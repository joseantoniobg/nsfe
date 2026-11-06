import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { clientes, emitente, notas, servicos, type Cliente, type Emitente, type Nota, type Servico } from "@/db/schema";
import { assinarXml } from "./nfse/assinatura";
import { certificadoConfigurado } from "./nfse/certificado";
import { montarDps, montarPedidoCancelamento, tomadorEstrangeiro, type Ambiente } from "./nfse/dps";
import { obterPtax } from "./ptax";
import { aplicarModeloDescricao, inicioMesBrasilia } from "./nfse/formatos";
import { lerNfse } from "./nfse/leitura";
import { consultarChavePorDps, consultarNfse, enviarDps, ErroComunicacao, registrarEvento, type MensagemSefin } from "./nfse/sefin";

export function ambienteConfigurado(): Ambiente {
  return process.env.NFSE_AMBIENTE === "1" ? "1" : "2";
}

export async function obterEmitente(): Promise<Emitente | undefined> {
  return db.query.emitente.findFirst();
}

export interface PedidoEmissao {
  clienteId: number;
  valor: number; // na moeda do perfil de serviço (reais, ou ex.: USD na exportação)
  servicoId?: number; // padrão: o perfil do cliente
  cotacao?: number; // exportação: sobrescreve a PTAX
  valorRecebido?: number; // exportação: reais que de fato entraram (caixa)
  descricao?: string;
  competencia?: string;
}

/** Perfil de serviço usado para o cliente: o vinculado a ele ou, se houver só um, esse. */
export async function servicoDoCliente(cliente: Cliente, servicoId?: number): Promise<Servico> {
  const id = servicoId ?? cliente.servicoId;
  if (id) {
    const s = await db.query.servicos.findFirst({ where: eq(servicos.id, id) });
    if (s) return s;
  }
  const ativos = await db.query.servicos.findMany({ where: eq(servicos.ativo, true) });
  if (ativos.length === 1) return ativos[0];
  throw new Error(ativos.length ? `Escolha o perfil de serviço do cliente ${cliente.nome}.` : "Cadastre um perfil de serviço na configuração.");
}

/**
 * Emite uma NFS-e: reserva o próximo número de DPS, gera e assina o XML, persiste
 * antes de enviar (para recuperar em caso de queda) e transmite à Sefin Nacional.
 */
export async function emitirNota(pedido: PedidoEmissao): Promise<Nota> {
  const config = await obterEmitente();
  if (!config) throw new Error("Configure os dados do emitente antes de emitir.");
  const cliente = await db.query.clientes.findFirst({ where: eq(clientes.id, pedido.clienteId) });
  if (!cliente) throw new Error("Cliente não encontrado.");
  if (!(pedido.valor > 0)) throw new Error("Informe um valor maior que zero.");
  const servico = await servicoDoCliente(cliente, pedido.servicoId);
  if (servico.comExt && !tomadorEstrangeiro(cliente)) throw new Error(`O perfil "${servico.nome}" é de exportação, mas o cliente é do Brasil.`);
  if (!servico.comExt && servico.tribISSQN === "3") throw new Error(`O perfil "${servico.nome}" está como exportação, mas sem dados de comércio exterior.`);
  if (servico.ibscbsAtivo && servico.cClassTrib && !servico.cNBS) {
    throw new Error(`O perfil "${servico.nome}" não tem código NBS, obrigatório quando há informações de IBS/CBS (E0322). Preencha na configuração.`);
  }

  const cert = certificadoConfigurado();
  const ambiente = ambienteConfigurado();
  const competencia = pedido.competencia || inicioMesBrasilia();

  // Exportação: o valor digitado está em moeda estrangeira; converte pela PTAX da competência.
  let valor = pedido.valor;
  let cambio: { moeda: string; valorMoeda: number; cotacao: number; dataCotacao: string } | undefined;
  if (servico.comExt) {
    const { moeda, cotacao: tipo, casasCotacao } = servico.comExt;
    const ptax = pedido.cotacao ? { valor: pedido.cotacao, data: competencia } : await obterPtax(moeda, competencia, tipo, casasCotacao);
    valor = Math.round(pedido.valor * ptax.valor * 100) / 100;
    cambio = { moeda, valorMoeda: pedido.valor, cotacao: ptax.valor, dataCotacao: ptax.data };
  }

  // A descrição digitada também passa pelo modelo: variáveis só conhecidas aqui (ex.: {cotacao}) são preenchidas.
  const descricao = aplicarModeloDescricao(pedido.descricao?.trim() || cliente.descricao || servico.descricaoPadrao, {
    competencia,
    valor,
    moeda: cambio?.moeda,
    valorMoeda: cambio?.valorMoeda,
    cotacao: cambio?.cotacao,
    dataCotacao: cambio?.dataCotacao,
  });

  const nota = await db.transaction(async (tx) => {
    const [{ numero }] = await tx
      .update(emitente)
      .set({ proximoNumero: sql`${emitente.proximoNumero} + 1` })
      .where(eq(emitente.id, config.id))
      .returning({ numero: sql<number>`${emitente.proximoNumero} - 1` });

    const { id, xml } = montarDps({
      ambiente,
      prestador: config,
      servico,
      tomador: cliente,
      serie: config.serie,
      numero,
      valor,
      valorMoeda: cambio?.valorMoeda,
      descricao,
      competencia,
    });
    const xmlAssinado = assinarXml(xml, "infDPS", cert);

    const [criada] = await tx
      .insert(notas)
      .values({
        clienteId: cliente.id,
        servicoId: servico.id,
        valor: valor.toFixed(2),
        moeda: cambio?.moeda,
        valorMoeda: cambio?.valorMoeda.toFixed(2),
        cotacao: cambio ? String(cambio.cotacao) : undefined,
        dataCotacao: cambio?.dataCotacao,
        valorRecebido: cambio && pedido.valorRecebido ? pedido.valorRecebido.toFixed(2) : undefined,
        descricao,
        competencia,
        ambiente,
        serie: config.serie,
        numeroDps: numero,
        idDps: id,
        xmlDps: xmlAssinado,
      })
      .returning();
    return criada;
  });

  return transmitir(nota);
}

async function transmitir(nota: Nota): Promise<Nota> {
  const cert = certificadoConfigurado();
  const ambiente = nota.ambiente as Ambiente;
  try {
    const r = await enviarDps(ambiente, cert, nota.xmlDps!);
    if (r.tipo === "autorizada") return marcarEmitida(nota.id, r.chaveAcesso, r.xmlNfse, r.alertas);

    // E0014 = DPS já convertida em NFS-e (ex.: reenvio após timeout): recupera a nota existente.
    if (r.erros.some((e) => e.codigo === "E0014")) return recuperar(nota);
    return atualizar(nota.id, { status: "rejeitada", mensagens: r.erros });
  } catch (e) {
    const mensagem = (e as Error).message;
    // Em falha de comunicação a DPS pode ter sido processada: fica como "erro" para verificação posterior.
    const status = e instanceof ErroComunicacao ? "erro" : "rejeitada";
    return atualizar(nota.id, { status, mensagens: [{ descricao: mensagem }] });
  }
}

/**
 * Para notas em "erro": pergunta à Sefin se a DPS virou NFS-e. Se virou, baixa o XML;
 * se não, reenvia a mesma DPS assinada (mesmo Id, então não há risco de duplicidade).
 */
export async function reprocessarNota(id: number): Promise<Nota> {
  const nota = await db.query.notas.findFirst({ where: eq(notas.id, id) });
  if (!nota) throw new Error("Nota não encontrada.");
  if (nota.status !== "erro") throw new Error("Só notas com erro de comunicação podem ser reprocessadas.");
  return recuperar(nota, true);
}

async function recuperar(nota: Nota, reenviarSeAusente = false): Promise<Nota> {
  const cert = certificadoConfigurado();
  const ambiente = nota.ambiente as Ambiente;
  try {
    const chave = await consultarChavePorDps(ambiente, cert, nota.idDps);
    if (chave) return marcarEmitida(nota.id, chave, await consultarNfse(ambiente, cert, chave), []);
  } catch (e) {
    return atualizar(nota.id, { status: "erro", mensagens: [{ descricao: (e as Error).message }] });
  }
  if (reenviarSeAusente) return transmitir(nota);
  return atualizar(nota.id, { status: "erro", mensagens: [{ descricao: "DPS informada como existente, mas a NFS-e não foi localizada." }] });
}

async function marcarEmitida(id: number, chaveAcesso: string, xmlNfse: string, alertas: MensagemSefin[]): Promise<Nota> {
  const dados = lerNfse(xmlNfse);
  return atualizar(id, {
    status: "emitida",
    chaveAcesso,
    numeroNfse: dados.numero ?? null,
    xmlNfse,
    mensagens: alertas.length ? alertas : null,
    emitidaEm: new Date(),
  });
}

async function atualizar(id: number, campos: Partial<Nota>): Promise<Nota> {
  const [n] = await db.update(notas).set(campos).where(eq(notas.id, id)).returning();
  return n;
}

export async function cancelarNota(id: number, codigoMotivo: "1" | "2" | "9", motivo: string): Promise<Nota> {
  const nota = await db.query.notas.findFirst({ where: eq(notas.id, id) });
  if (!nota?.chaveAcesso || nota.status !== "emitida") throw new Error("Só notas emitidas podem ser canceladas.");
  if (motivo.trim().length < 15) throw new Error("O motivo do cancelamento precisa ter ao menos 15 caracteres.");
  const config = await obterEmitente();
  const cert = certificadoConfigurado();
  const ambiente = nota.ambiente as Ambiente;

  const { xml } = montarPedidoCancelamento({
    ambiente,
    cnpjAutor: config!.cnpj,
    chaveAcesso: nota.chaveAcesso,
    codigoMotivo,
    motivo: motivo.trim(),
  });
  const r = await registrarEvento(ambiente, cert, nota.chaveAcesso, assinarXml(xml, "infPedReg", cert));
  if (r.tipo === "rejeitado") {
    throw new Error(r.erros.map((e) => [e.codigo, e.descricao, e.complemento].filter(Boolean).join(" - ")).join("\n"));
  }
  return atualizar(id, { status: "cancelada", xmlCancelamento: r.xmlEvento });
}
