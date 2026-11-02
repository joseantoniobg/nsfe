import { dataHoraBrasilia, decimal2, ehCpf, normalizarDocumento, somenteDigitos } from "./formatos";
import { grupo, NAMESPACE_NFSE, tag } from "./xml";

export const VERSAO_LEIAUTE = "1.01";
export const VERSAO_APLICATIVO = "nfe-proprio-1.0";

export type Ambiente = "1" | "2";

/**
 * A produção e a Produção Restrita estão em versões diferentes do leiaute v1.01:
 * - "atual": XSD de 09/02/2026 (produção). finNFSe dentro de IBSCBS, cIndOp obrigatório,
 *   CST/cClassTrib em IBSCBS/valores/trib/gIBSCBS e xDescServ antes de cNBS.
 * - "nt009": XSD de 20/10/2026 (Produção Restrita). finNFSe em infDPS, cIndOp opcional,
 *   CST/cClassTrib em IBSCBS/valores/trib e cNBS antes de xDescServ.
 * Quando a produção migrar para a NT 009, basta definir NFSE_LEIAUTE=nt009.
 */
export type Leiaute = "atual" | "nt009";

export function leiauteDoAmbiente(ambiente: Ambiente): Leiaute {
  const forcado = process.env.NFSE_LEIAUTE;
  if (forcado === "atual" || forcado === "nt009") return forcado;
  return ambiente === "1" ? "atual" : "nt009";
}

// CSTs sem tributação a detalhar: na NT 009 não se informa cIndOp para eles.
const CST_SEM_TRIBUTACAO = ["400", "410", "820"];

export interface PrestadorDps {
  cnpj: string;
  inscricaoMunicipal?: string | null;
  codMunicipio: string;
  fone?: string | null;
  email?: string | null;
  opSimpNac: string;
  regApTribSN?: string | null;
  regEspTrib: string;
}

export interface ComExtDps {
  mdPrestacao: string;
  vincPrest: string;
  tpMoeda: string;
  mecAFComexP: string;
  mecAFComexT: string;
  movTempBens: string;
  mdic: string;
}

export interface ServicoDps {
  cLocPrestacao?: string | null;
  cTribNac: string;
  cTribMun?: string | null;
  cNBS?: string | null;
  tribISSQN: string;
  tpRetISSQN: string;
  pAliq?: string | number | null;
  cstPisCofins?: string | null;
  tpRetPisCofins?: string | null;
  pTotTribSN?: string | number | null;
  ibscbsAtivo: boolean;
  cIndOp?: string | null;
  cClassTrib?: string | null;
  comExt?: ComExtDps | null;
}

export interface TomadorDps {
  documento: string; // CPF/CNPJ, ou NIF quando pais != BR
  nome: string;
  pais?: string | null;
  email?: string | null;
  fone?: string | null;
  codMunicipio?: string | null;
  cep?: string | null;
  codigoPostal?: string | null;
  cidade?: string | null;
  estadoProvincia?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
}

export interface DadosDps {
  ambiente: Ambiente;
  leiaute?: Leiaute; // padrão: o do ambiente
  prestador: PrestadorDps;
  servico: ServicoDps;
  tomador: TomadorDps;
  serie: string;
  numero: number;
  valor: number; // em reais
  valorMoeda?: number; // exportação: valor na moeda estrangeira
  descricao: string;
  competencia: string; // AAAA-MM-DD
  emitidaEm?: Date;
}

const preenchido = (v: unknown) => v !== null && v !== undefined && v !== "";

export const tomadorEstrangeiro = (t: Pick<TomadorDps, "pais">) => !!t.pais && t.pais !== "BR";

/**
 * Id da DPS (45 posições): "DPS" + município (7) + tipo de inscrição (1=CPF, 2=CNPJ)
 * + inscrição (14) + série (5) + número (15).
 */
export function montarIdDps(codMunicipio: string, cnpjPrestador: string, serie: string, numero: number): string {
  const documento = normalizarDocumento(cnpjPrestador);
  const tipo = ehCpf(documento) ? "1" : "2";
  return `DPS${codMunicipio}${tipo}${documento.padStart(14, "0")}${serie.padStart(5, "0")}${String(numero).padStart(15, "0")}`;
}

function documentoXml(documento: string): string {
  const doc = normalizarDocumento(documento);
  return ehCpf(doc) ? tag("CPF", doc) : tag("CNPJ", doc);
}

function enderecoTomador(t: TomadorDps): string {
  // O endereço é opcional; só é enviado completo (o leiaute exige logradouro, número e bairro juntos).
  if (tomadorEstrangeiro(t)) {
    if (!t.cidade || !t.logradouro) return "";
    return grupo(
      "end",
      grupo(
        "endExt",
        tag("cPais", t.pais),
        tag("cEndPost", t.codigoPostal || "NI"),
        tag("xCidade", t.cidade),
        tag("xEstProvReg", t.estadoProvincia || "NI"),
      ),
      tag("xLgr", t.logradouro),
      tag("nro", t.numero || "NI"),
      tag("xCpl", t.complemento),
      tag("xBairro", t.bairro || "NI"),
    );
  }
  if (!t.codMunicipio || !t.cep || !t.logradouro || !t.bairro) return "";
  return grupo(
    "end",
    grupo("endNac", tag("cMun", t.codMunicipio), tag("CEP", somenteDigitos(t.cep))),
    tag("xLgr", t.logradouro),
    tag("nro", t.numero || "S/N"),
    tag("xCpl", t.complemento),
    tag("xBairro", t.bairro),
  );
}

function telefone(v?: string | null) {
  const digitos = somenteDigitos(v);
  return digitos.length >= 6 ? digitos : undefined;
}

/** Gera o XML (sem assinatura) da DPS no leiaute nacional v1.01. */
export function montarDps(d: DadosDps): { id: string; xml: string } {
  const p = d.prestador;
  const s = d.servico;
  const t = d.tomador;
  const leiaute = d.leiaute ?? leiauteDoAmbiente(d.ambiente);
  const id = montarIdDps(p.codMunicipio, p.cnpj, d.serie, d.numero);
  // Alguns segundos de folga: a Sefin rejeita dhEmi posterior ao horário de processamento.
  const dhEmi = dataHoraBrasilia(new Date((d.emitidaEm ?? new Date()).getTime() - 30_000));

  if (s.comExt && !(d.valorMoeda! > 0)) throw new Error("Exportação de serviço exige o valor na moeda estrangeira.");

  const prest = grupo(
    "prest",
    documentoXml(p.cnpj),
    tag("IM", p.inscricaoMunicipal),
    tag("fone", telefone(p.fone)),
    tag("email", p.email),
    grupo(
      "regTrib",
      tag("opSimpNac", p.opSimpNac),
      p.opSimpNac === "3" ? tag("regApTribSN", p.regApTribSN || "1") : "",
      tag("regEspTrib", p.regEspTrib),
    ),
  );

  const toma = grupo(
    "toma",
    tomadorEstrangeiro(t) ? tag("NIF", t.documento) : documentoXml(t.documento),
    tag("xNome", t.nome),
    enderecoTomador(t),
    tag("fone", telefone(t.fone)),
    tag("email", t.email),
  );

  const comExt = s.comExt
    ? grupo(
        "comExt",
        tag("mdPrestacao", s.comExt.mdPrestacao),
        tag("vincPrest", s.comExt.vincPrest),
        tag("tpMoeda", s.comExt.tpMoeda),
        tag("vServMoeda", decimal2(d.valorMoeda!)),
        tag("mecAFComexP", s.comExt.mecAFComexP),
        tag("mecAFComexT", s.comExt.mecAFComexT),
        tag("movTempBens", s.comExt.movTempBens),
        tag("mdic", s.comExt.mdic),
      )
    : "";

  const serv = grupo(
    "serv",
    grupo("locPrest", tag("cLocPrestacao", s.cLocPrestacao || p.codMunicipio)),
    leiaute === "atual"
      ? grupo("cServ", tag("cTribNac", s.cTribNac), tag("cTribMun", s.cTribMun), tag("xDescServ", d.descricao), tag("cNBS", somenteDigitos(s.cNBS)))
      : grupo("cServ", tag("cTribNac", s.cTribNac), tag("cTribMun", s.cTribMun), tag("cNBS", somenteDigitos(s.cNBS)), tag("xDescServ", d.descricao)),
    comExt,
  );

  const totTrib = preenchido(s.pTotTribSN) ? tag("pTotTribSN", decimal2(s.pTotTribSN!)) : tag("indTotTrib", "0");

  const valores = grupo(
    "valores",
    grupo("vServPrest", tag("vServ", decimal2(d.valor))),
    grupo(
      "trib",
      grupo(
        "tribMun",
        tag("tribISSQN", s.tribISSQN),
        // Exportação (tribISSQN=3) exige o país onde o resultado do serviço se verifica.
        s.tribISSQN === "3" ? tag("cPaisResult", t.pais && t.pais !== "BR" ? t.pais : undefined) : "",
        tag("tpRetISSQN", s.tpRetISSQN),
        preenchido(s.pAliq) ? tag("pAliq", decimal2(s.pAliq!)) : "",
      ),
      s.cstPisCofins ? grupo("tribFed", grupo("piscofins", tag("CST", s.cstPisCofins), tag("tpRetPisCofins", s.tpRetPisCofins))) : "",
      grupo("totTrib", totTrib),
    ),
  );

  let ibscbs = "";
  if (s.ibscbsAtivo && s.cClassTrib) {
    const cst = s.cClassTrib.slice(0, 3);
    const classificacao = tag("CST", cst) + tag("cClassTrib", s.cClassTrib);
    if (leiaute === "atual") {
      if (!s.cIndOp) throw new Error("O leiaute em produção exige o indicador da operação (cIndOp) no perfil de serviço.");
      ibscbs = grupo(
        "IBSCBS",
        tag("finNFSe", "0"), // NFS-e regular
        tag("cIndOp", s.cIndOp),
        tag("indDest", "0"), // destinatário = o próprio tomador
        grupo("valores", grupo("trib", grupo("gIBSCBS", classificacao))),
      );
    } else {
      ibscbs = grupo(
        "IBSCBS",
        CST_SEM_TRIBUTACAO.includes(cst) ? "" : tag("cIndOp", s.cIndOp),
        tag("indDest", "0"),
        grupo("valores", grupo("trib", classificacao)),
      );
    }
  }

  const infDps =
    `<infDPS Id="${id}">` +
    tag("tpAmb", d.ambiente) +
    tag("dhEmi", dhEmi) +
    tag("verAplic", VERSAO_APLICATIVO) +
    tag("serie", d.serie) +
    tag("nDPS", d.numero) +
    tag("dCompet", d.competencia) +
    tag("tpEmit", "1") + // emitente = prestador
    (leiaute === "nt009" ? tag("finNFSe", "0") : "") + // NFS-e regular
    tag("cLocEmi", p.codMunicipio) +
    prest +
    toma +
    serv +
    valores +
    ibscbs +
    `</infDPS>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="${NAMESPACE_NFSE}" versao="${VERSAO_LEIAUTE}">${infDps}</DPS>`;
  return { id, xml };
}

/** Pedido de registro do evento de cancelamento (e101101). */
export function montarPedidoCancelamento(args: {
  ambiente: Ambiente;
  cnpjAutor: string;
  chaveAcesso: string;
  codigoMotivo: "1" | "2" | "9";
  motivo: string;
}): { id: string; xml: string } {
  const id = `PRE${args.chaveAcesso}101101`;
  const inf =
    `<infPedReg Id="${id}">` +
    tag("tpAmb", args.ambiente) +
    tag("verAplic", VERSAO_APLICATIVO) +
    tag("dhEvento", dataHoraBrasilia(new Date(Date.now() - 30_000))) +
    tag("CNPJAutor", normalizarDocumento(args.cnpjAutor)) +
    tag("chNFSe", args.chaveAcesso) +
    grupo("e101101", tag("xDesc", "Cancelamento de NFS-e"), tag("cMotivo", args.codigoMotivo), tag("xMotivo", args.motivo)) +
    `</infPedReg>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><pedRegEvento xmlns="${NAMESPACE_NFSE}" versao="${VERSAO_LEIAUTE}">${inf}</pedRegEvento>`;
  return { id, xml };
}
