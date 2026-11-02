import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { clientes, emitente, servicos, type ComercioExterior } from "@/db/schema";
import { correlacaoPorCodigo } from "./nfse/correlacao";
import { normalizarDocumento } from "./nfse/formatos";
import { lerNfse, type DadosNfse } from "./nfse/leitura";

export interface ResultadoImportacao {
  notasLidas: number;
  clientesNovos: number;
  servicosNovos: number;
  emitenteAtualizado: boolean;
  avisos: string[];
}

// Código numérico de moeda usado no comExt (o Emissor Nacional usa ISO 4217) -> sigla para a PTAX.
const MOEDAS: Record<string, string> = { "840": "USD", "978": "EUR", "826": "GBP", "124": "CAD", "036": "AUD", "756": "CHF", "392": "JPY" };

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

/** Encontra (ou cria) o perfil de serviço equivalente ao da nota. */
async function perfilDaNota(n: DadosNfse): Promise<{ id: number; novo: boolean; semNbs?: boolean }> {
  const d = n.dps;
  const exportacao = d.tribISSQN === "3";
  const cLocPrestacao = d.cLocPrestacao && d.cLocPrestacao !== d.codMunicipio ? d.cLocPrestacao : null;

  const existentes = await db.query.servicos.findMany({ where: eq(servicos.cTribNac, d.cTribNac!) });
  const igual = existentes.find((s) => s.tribISSQN === (d.tribISSQN ?? "1") && (s.cLocPrestacao ?? null) === cLocPrestacao);
  if (igual) return { id: igual.id, novo: false };

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
