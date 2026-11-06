import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { clientes, emitente, notas, servicos, type ComercioExterior } from "@/db/schema";
import { distribuicaoDfe, type LoteAdn } from "./nfse/adn";
import { certificadoConfigurado } from "./nfse/certificado";
import { correlacaoPorCodigo } from "./nfse/correlacao";
import type { Ambiente } from "./nfse/dps";
import { normalizarDocumento } from "./nfse/formatos";
import { lerNfse, type DadosNfse } from "./nfse/leitura";
import { ErroComunicacao } from "./nfse/sefin";
import { caminho, lerXml, texto } from "./nfse/xml";
import { ambienteConfigurado } from "./notas";

export interface ResultadoImportacao {
  notasLidas: number;
  clientesNovos: number;
  servicosNovos: number;
  emitenteAtualizado: boolean;
  avisos: string[];
}

// Código numérico de moeda usado no comExt (o Emissor Nacional usa ISO 4217) -> sigla para a PTAX.
const MOEDAS: Record<string, string> = { "840": "USD", "220": "USD" /* código Bacen, usado pelo emissor municipal */, "978": "EUR", "826": "GBP", "124": "CAD", "036": "AUD", "756": "CHF", "392": "JPY" };

// Exportação de serviço: imunidade (CST 410), cClassTrib 410004.
const CCLASSTRIB_EXPORTACAO = "410004";

// Anexo VIII ("REGRA OP NÃO ONE_EXT"): indicador da mesma operação quando o adquirente está no exterior.
const INDOP_EXTERIOR: Record<string, string> = { "100101": "100102", "100301": "100302", "100501": "100502" };

const br = (v: number, casas = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

/**
 * Transforma a descrição de uma nota real em modelo, trocando valores e datas daquela nota por
 * variáveis: "SUPORTE 09/2026" (competência 10/2026) -> "SUPORTE {mesAnoAnterior}".
 */
export function extrairModeloDescricao(n: DadosNfse): string {
  let d = n.dps.descricao ?? "";
  const competencia = n.dps.competencia;
  const vServ = Number(n.valores.servico);
  const vMoeda = Number(n.dps.valorMoeda);
  if (vMoeda > 0) {
    d = d.replace(vMoeda.toLocaleString("en-US", { minimumFractionDigits: 2 }), "{valorMoeda}");
    const cotacao = vServ / vMoeda;
    for (const casas of [4, 2]) {
      if (Math.abs(Number(cotacao.toFixed(casas)) - cotacao) < 1e-6) d = d.replace(br(cotacao, casas), "{cotacao}");
    }
  }
  if (vServ > 0) d = d.replace(br(vServ), "{valor}");
  if (competencia) {
    const [ano, mes, dia] = competencia.split("-").map(Number);
    const mm = (m: number) => String(m).padStart(2, "0");
    if (vMoeda > 0) d = d.replace(`${mm(dia)}/${mm(mes)}/${ano}`, "{dataCotacao}");
    const [mesAnt, anoAnt] = mes === 1 ? [12, ano - 1] : [mes - 1, ano];
    d = d.replace(`${mm(mes)}/${ano}`, "{mesAno}").replace(`${mm(mesAnt)}/${anoAnt}`, "{mesAnoAnterior}");
  }
  return d;
}

function comExtDaNota(n: DadosNfse): ComercioExterior | null {
  const c = n.dps.comExt;
  if (!c) return null;
  return {
    mdPrestacao: c.mdPrestacao ?? "1",
    vincPrest: c.vincPrest ?? "0",
    tpMoeda: c.tpMoeda ?? "840",
    mecAFComexP: c.mecAFComexP ?? "01",
    mecAFComexT: c.mecAFComexT ?? "01",
    movTempBens: c.movTempBens ?? "1",
    mdic: c.mdic ?? "0",
    moeda: MOEDAS[c.tpMoeda ?? "840"] ?? "USD",
    cotacao: "compra",
    casasCotacao: 2,
  };
}

const localDaPrestacao = (d: DadosNfse["dps"]) => (d.cLocPrestacao && d.cLocPrestacao !== d.codMunicipio ? d.cLocPrestacao : null);

/** Perfil de serviço já cadastrado equivalente ao da nota, se houver. */
async function perfilExistente(n: DadosNfse): Promise<number | undefined> {
  const d = n.dps;
  if (!d.cTribNac) return undefined;
  const cLocPrestacao = localDaPrestacao(d);
  const existentes = await db.query.servicos.findMany({ where: eq(servicos.cTribNac, d.cTribNac) });
  return existentes.find((s) => s.tribISSQN === (d.tribISSQN ?? "1") && (s.cLocPrestacao ?? null) === cLocPrestacao)?.id;
}

/** Encontra (ou cria) o perfil de serviço equivalente ao da nota. */
async function perfilDaNota(n: DadosNfse): Promise<{ id: number; novo: boolean; semNbs?: boolean }> {
  const d = n.dps;
  const exportacao = d.tribISSQN === "3";
  const cLocPrestacao = localDaPrestacao(d);

  const igual = await perfilExistente(n);
  if (igual) return { id: igual, novo: false };

  const sugestao = correlacaoPorCodigo(d.cTribNac!);
  const [criado] = await db
    .insert(servicos)
    .values({
      nome: `${n.descricaoTributacaoNacional ?? sugestao?.descricao ?? d.cTribNac}`.slice(0, 60) + (exportacao ? " (exportação)" : ""),
      cLocPrestacao,
      cTribNac: d.cTribNac!,
      cTribMun: d.cTribMun ?? null,
      // NBS é obrigatório com IBS/CBS; se a nota não tem e só há uma opção para o item, usa ela.
      cNBS: d.cNBS ?? (sugestao?.nbs.length === 1 ? sugestao.nbs[0].codigo : null),
      descricaoPadrao: extrairModeloDescricao(n),
      tribISSQN: d.tribISSQN ?? "1",
      tpRetISSQN: d.tpRetISSQN ?? "1",
      pAliq: d.pAliq ?? null,
      cstPisCofins: d.cstPisCofins ?? null,
      tpRetPisCofins: d.tpRetPisCofins ?? null,
      pTotTribSN: d.pTotTribSN ?? null,
      ibscbsAtivo: true,
      cIndOp: d.cIndOp ?? (exportacao ? (INDOP_EXTERIOR[sugestao?.cIndOp ?? ""] ?? null) : (sugestao?.cIndOp ?? null)),
      cClassTrib: d.cClassTrib ?? (exportacao ? CCLASSTRIB_EXPORTACAO : (sugestao?.cClassTrib[0]?.codigo ?? null)),
      comExt: comExtDaNota(n),
    })
    .returning({ id: servicos.id });
  return { id: criado.id, novo: true, semNbs: !d.cNBS && sugestao?.nbs.length !== 1 };
}

/**
 * Importa XMLs de NFS-e emitidas no Emissor Nacional: cada tipo de serviço vira um perfil
 * (com os códigos que o portal já aceitou), os tomadores viram clientes ligados ao perfil e a
 * nota mais recente atualiza os dados da empresa.
 */
export async function importarXmls(arquivos: { nome: string; conteudo: string }[]): Promise<ResultadoImportacao> {
  const avisos: string[] = [];
  const lidas: DadosNfse[] = [];
  for (const a of arquivos) {
    try {
      const n = lerNfse(a.conteudo);
      if (!n.dps.cTribNac) throw new Error("nota sem código de tributação nacional");
      lidas.push(n);
    } catch (e) {
      avisos.push(`${a.nome}: ${(e as Error).message}`);
    }
  }
  // Da mais antiga para a mais recente: a descrição/valor mais recentes prevalecem.
  lidas.sort((a, b) => (a.dps.dhEmi ?? "").localeCompare(b.dps.dhEmi ?? ""));

  const modelo = lidas.at(-1);
  let emitenteAtualizado = false;
  if (modelo?.prestador.documento && modelo.dps.codMunicipio) {
    const atual = await db.query.emitente.findFirst();
    const valores = {
      cnpj: normalizarDocumento(modelo.prestador.documento),
      razaoSocial: modelo.prestador.nome ?? atual?.razaoSocial ?? "",
      inscricaoMunicipal: modelo.prestador.inscricaoMunicipal ?? atual?.inscricaoMunicipal ?? null,
      codMunicipio: modelo.dps.codMunicipio,
      fone: atual?.fone ?? modelo.prestador.fone ?? null,
      email: atual?.email ?? modelo.prestador.email ?? null,
      opSimpNac: modelo.dps.opSimpNac ?? "3",
      regApTribSN: modelo.dps.regApTribSN ?? null,
      regEspTrib: modelo.dps.regEspTrib ?? "0",
      atualizadoEm: new Date(),
    };
    await db.insert(emitente).values({ id: 1, ...valores }).onConflictDoUpdate({ target: emitente.id, set: valores });
    emitenteAtualizado = true;
  }

  let clientesNovos = 0;
  let servicosNovos = 0;
  for (const n of lidas) {
    const perfil = await perfilDaNota(n);
    if (perfil.novo) servicosNovos++;
    if (perfil.semNbs) avisos.push(`Nota ${n.numero ?? ""} sem código NBS: escolha um no perfil (obrigatório com IBS/CBS).`);
    if (!n.dps.cClassTrib) avisos.push(`Nota ${n.numero ?? ""} sem grupo IBS/CBS: confira cIndOp e cClassTrib sugeridos no perfil.`);

    const t = n.tomador;
    if (!t.documento || !t.nome) continue;
    const documento = normalizarDocumento(t.documento);
    const inseridos = await db
      .insert(clientes)
      .values({
        documento,
        nome: t.nome,
        email: t.email,
        fone: t.fone,
        pais: t.pais ?? "BR",
        codMunicipio: t.codMunicipio,
        cep: t.cep,
        codigoPostal: t.codigoPostal,
        cidade: t.cidade,
        estadoProvincia: t.estadoProvincia,
        logradouro: t.logradouro,
        numero: t.numero,
        complemento: t.complemento,
        bairro: t.bairro,
        servicoId: perfil.id,
        valorPadrao: n.dps.valorMoeda ?? n.valores.servico,
      })
      .onConflictDoNothing()
      .returning({ id: clientes.id });
    clientesNovos += inseridos.length;
    // Cliente que já existia sem perfil passa a usar o desta nota.
    await db
      .update(clientes)
      .set({ servicoId: perfil.id })
      .where(and(eq(clientes.documento, documento), isNull(clientes.servicoId)));
  }

  return { notasLidas: lidas.length, clientesNovos, servicosNovos, emitenteAtualizado, avisos };
}

export interface ResultadoSincronizacao {
  notasNovas: number;
  canceladas: number;
  clientesNovos: number;
  ultimoNsu: number;
  avisos: string[];
}

const nomeComparavel = (v: string | null | undefined) => (v ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");

/** Cliente do tomador da nota; tomador ainda não cadastrado vira cliente inativo (só histórico). */
async function clienteDaNota(n: DadosNfse, servicoId: number | undefined): Promise<{ id: number; novo: boolean } | null> {
  const t = n.tomador;
  const documento = normalizarDocumento(t.documento);
  if (documento) {
    const c = await db.query.clientes.findFirst({ where: eq(clientes.documento, documento), columns: { id: true } });
    if (c) return { id: c.id, novo: false };
  }
  // Estrangeiro sem NIF (cNaoNIF) não tem documento: procura pelo nome.
  const nome = nomeComparavel(t.nome);
  if (nome) {
    const todos = await db.query.clientes.findMany({ columns: { id: true, nome: true } });
    const c = todos.find((c) => nomeComparavel(c.nome) === nome);
    if (c) return { id: c.id, novo: false };
  }
  if (!documento || !t.nome) return null;
  const [criado] = await db
    .insert(clientes)
    .values({
      documento,
      nome: t.nome,
      email: t.email,
      fone: t.fone,
      pais: t.pais ?? "BR",
      codMunicipio: t.codMunicipio,
      cep: t.cep,
      codigoPostal: t.codigoPostal,
      cidade: t.cidade,
      estadoProvincia: t.estadoProvincia,
      logradouro: t.logradouro,
      numero: t.numero,
      complemento: t.complemento,
      bairro: t.bairro,
      servicoId,
      ativo: false,
    })
    .returning({ id: clientes.id });
  return { id: criado.id, novo: true };
}

/** Chave da NFS-e cancelada por um evento (cancelamento simples ou por substituição). */
function chaveCancelada(xmlEvento: string): string | undefined {
  const ped = caminho(lerXml(xmlEvento), "evento/infEvento/pedRegEvento/infPedReg");
  if (!caminho(ped, "e101101") && !caminho(ped, "e105102")) return undefined;
  return texto(ped, "chNFSe");
}

async function loteComRetentativa(ambiente: Ambiente, cnpj: string, nsu: number): Promise<LoteAdn> {
  const cert = certificadoConfigurado();
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await distribuicaoDfe(ambiente, cert, cnpj, nsu);
    } catch (e) {
      // O ADN às vezes derruba a conexão (ECONNRESET); espera um pouco e tenta de novo.
      if (!(e instanceof ErroComunicacao) || tentativa === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * tentativa));
    }
  }
}

/**
 * Traz do Ambiente de Dados Nacional as NFS-e emitidas pelo CNPJ fora deste sistema (Emissor
 * Nacional, emissor da prefeitura) e aplica os cancelamentos. Continua do último NSU lido;
 * notas que já estão no banco (mesma DPS ou chave) são ignoradas.
 */
export async function importarDoAdn(): Promise<ResultadoSincronizacao> {
  const config = await db.query.emitente.findFirst();
  if (!config) throw new Error("Configure os dados do emitente antes de importar.");
  const ambiente = ambienteConfigurado();
  const resultado: ResultadoSincronizacao = { notasNovas: 0, canceladas: 0, clientesNovos: 0, ultimoNsu: config.ultimoNsuAdn, avisos: [] };
  const cancelamentos: { chave: string; xml: string }[] = [];

  for (;;) {
    const lote = await loteComRetentativa(ambiente, config.cnpj, resultado.ultimoNsu);
    if (!lote.encontrou) break;

    for (const d of lote.documentos) {
      if (!d.xml) continue;
      if (d.tipo === "EVENTO") {
        const chave = chaveCancelada(d.xml);
        if (chave) cancelamentos.push({ chave, xml: d.xml });
        continue;
      }
      if (d.tipo !== "NFSE") continue;

      const n = lerNfse(d.xml);
      // Notas recebidas (o CNPJ é tomador) também vêm na distribuição.
      if (normalizarDocumento(n.prestador.documento) !== config.cnpj) continue;
      if (!n.dps.id || !n.dps.competencia) {
        resultado.avisos.push(`NSU ${d.nsu}: NFS-e ${n.numero ?? ""} sem identificação da DPS ou competência; ignorada.`);
        continue;
      }

      const servicoId = await perfilExistente(n);
      const cliente = await clienteDaNota(n, servicoId);
      if (!cliente) {
        resultado.avisos.push(`NFS-e ${n.numero ?? ""} (NSU ${d.nsu}): tomador sem documento nem cliente com o mesmo nome; ignorada.`);
        continue;
      }
      if (cliente.novo) resultado.clientesNovos++;

      const valor = Number(n.valores.servico);
      const valorMoeda = n.dps.valorMoeda ? Number(n.dps.valorMoeda) : undefined;
      const emissao = new Date(n.dps.dhEmi ?? n.dataProcessamento ?? n.dps.competencia);
      const inseridas = await db
        .insert(notas)
        .values({
          clienteId: cliente.id,
          servicoId,
          valor: valor.toFixed(2),
          moeda: valorMoeda ? (MOEDAS[n.dps.comExt?.tpMoeda ?? ""] ?? "USD") : undefined,
          valorMoeda: valorMoeda?.toFixed(2),
          cotacao: valorMoeda ? (valor / valorMoeda).toFixed(6) : undefined,
          descricao: n.dps.descricao ?? "",
          competencia: n.dps.competencia,
          ambiente: n.ambiente ?? ambiente,
          serie: n.dps.serie ?? "",
          numeroDps: Number(n.dps.numero ?? 0),
          idDps: n.dps.id,
          status: "emitida",
          origem: "importada",
          chaveAcesso: d.chaveAcesso ?? n.chaveAcesso,
          numeroNfse: n.numero,
          xmlNfse: d.xml,
          criadoEm: emissao,
          emitidaEm: n.dataProcessamento ? new Date(n.dataProcessamento) : emissao,
        })
        .onConflictDoNothing()
        .returning({ id: notas.id });
      resultado.notasNovas += inseridas.length;
    }

    // Cancelamentos do lote são aplicados antes de avançar o NSU, para não se perderem numa falha.
    for (const c of cancelamentos.splice(0)) {
      const atualizadas = await db
        .update(notas)
        .set({ status: "cancelada", xmlCancelamento: c.xml })
        .where(and(eq(notas.chaveAcesso, c.chave), eq(notas.status, "emitida")))
        .returning({ id: notas.id });
      resultado.canceladas += atualizadas.length;
    }
    resultado.ultimoNsu = Math.max(resultado.ultimoNsu, ...lote.documentos.map((d) => d.nsu));
    await db.update(emitente).set({ ultimoNsuAdn: resultado.ultimoNsu }).where(eq(emitente.id, config.id));
  }
  return resultado;
}
