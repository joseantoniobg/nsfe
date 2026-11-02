import { caminho, lerXml, texto } from "./xml";

export interface PessoaNfse {
  documento?: string; // CPF/CNPJ ou NIF
  pais?: string; // ISO alfa-2; ausente = Brasil
  codigoPostal?: string;
  cidade?: string;
  estadoProvincia?: string;
  nome?: string;
  inscricaoMunicipal?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  codMunicipio?: string;
  uf?: string;
  cep?: string;
  fone?: string;
  email?: string;
}

export interface DadosNfse {
  chaveAcesso?: string;
  numero?: string;
  ambiente?: string;
  dataProcessamento?: string;
  municipioEmissao?: string;
  municipioIncidencia?: string;
  descricaoTributacaoNacional?: string;
  prestador: PessoaNfse;
  tomador: PessoaNfse;
  dps: {
    id?: string;
    serie?: string;
    numero?: string;
    dhEmi?: string;
    competencia?: string;
    codMunicipio?: string;
    cLocPrestacao?: string;
    opSimpNac?: string;
    regApTribSN?: string;
    regEspTrib?: string;
    cTribNac?: string;
    cTribMun?: string;
    cNBS?: string;
    descricao?: string;
    tribISSQN?: string;
    tpRetISSQN?: string;
    cPaisResult?: string;
    pAliq?: string;
    cstPisCofins?: string;
    tpRetPisCofins?: string;
    pTotTribSN?: string;
    cIndOp?: string;
    cClassTrib?: string;
    comExt?: Record<string, string>;
    valorMoeda?: string;
  };
  valores: {
    servico?: string;
    baseCalculo?: string;
    aliquota?: string;
    iss?: string;
    retencoes?: string;
    liquido?: string;
  };
}

function pessoa(no: unknown, chaveEndereco: "end" | "enderNac"): PessoaNfse {
  const end = chaveEndereco === "end" ? caminho(no, "end") : caminho(no, "enderNac");
  return {
    documento: texto(no, "CNPJ") ?? texto(no, "CPF") ?? texto(no, "NIF"),
    pais: texto(end, "endExt/cPais"),
    codigoPostal: texto(end, "endExt/cEndPost"),
    cidade: texto(end, "endExt/xCidade"),
    estadoProvincia: texto(end, "endExt/xEstProvReg"),
    nome: texto(no, "xNome"),
    inscricaoMunicipal: texto(no, "IM"),
    logradouro: texto(end, "xLgr"),
    numero: texto(end, "nro"),
    complemento: texto(end, "xCpl"),
    bairro: texto(end, "xBairro"),
    codMunicipio: texto(end, "cMun") ?? texto(end, "endNac/cMun"),
    uf: texto(end, "UF"),
    cep: texto(end, "CEP") ?? texto(end, "endNac/CEP"),
    fone: texto(no, "fone"),
    email: texto(no, "email"),
  };
}

/** Lê um XML de NFS-e (o retornado pela API ou baixado no Emissor Nacional). */
export function lerNfse(xml: string): DadosNfse {
  const doc = lerXml(xml);
  const inf = caminho(doc, "NFSe/infNFSe");
  if (!inf) throw new Error("O arquivo não parece ser um XML de NFS-e do padrão nacional (NFSe/infNFSe não encontrado).");
  const dps = caminho(inf, "DPS/infDPS");
  const tribMun = caminho(dps, "valores/trib/tribMun");

  return {
    chaveAcesso: texto(inf, "@Id")?.replace(/^NFS/, ""),
    numero: texto(inf, "nNFSe"),
    ambiente: texto(dps, "tpAmb"),
    dataProcessamento: texto(inf, "dhProc"),
    municipioEmissao: texto(inf, "xLocEmi"),
    municipioIncidencia: texto(inf, "xLocIncid"),
    descricaoTributacaoNacional: texto(inf, "xTribNac"),
    prestador: pessoa(caminho(inf, "emit"), "enderNac"),
    tomador: pessoa(caminho(dps, "toma"), "end"),
    dps: {
      id: texto(dps, "@Id"),
      serie: texto(dps, "serie"),
      numero: texto(dps, "nDPS"),
      dhEmi: texto(dps, "dhEmi"),
      competencia: texto(dps, "dCompet"),
      codMunicipio: texto(dps, "cLocEmi"),
      cLocPrestacao: texto(dps, "serv/locPrest/cLocPrestacao"),
      opSimpNac: texto(dps, "prest/regTrib/opSimpNac"),
      regApTribSN: texto(dps, "prest/regTrib/regApTribSN"),
      regEspTrib: texto(dps, "prest/regTrib/regEspTrib"),
      cTribNac: texto(dps, "serv/cServ/cTribNac"),
      cTribMun: texto(dps, "serv/cServ/cTribMun"),
      cNBS: texto(dps, "serv/cServ/cNBS"),
      descricao: texto(dps, "serv/cServ/xDescServ"),
      tribISSQN: texto(tribMun, "tribISSQN"),
      tpRetISSQN: texto(tribMun, "tpRetISSQN"),
      cPaisResult: texto(tribMun, "cPaisResult"),
      pAliq: texto(tribMun, "pAliq"),
      cstPisCofins: texto(dps, "valores/trib/tribFed/piscofins/CST"),
      tpRetPisCofins: texto(dps, "valores/trib/tribFed/piscofins/tpRetPisCofins"),
      pTotTribSN: texto(dps, "valores/trib/totTrib/pTotTribSN"),
      cIndOp: texto(dps, "IBSCBS/cIndOp"),
      cClassTrib: texto(dps, "IBSCBS/valores/trib/cClassTrib") ?? texto(dps, "IBSCBS/valores/trib/gIBSCBS/cClassTrib"),
      comExt: caminho(dps, "serv/comExt") as Record<string, string> | undefined,
      valorMoeda: texto(dps, "serv/comExt/vServMoeda"),
    },
    valores: {
      servico: texto(dps, "valores/vServPrest/vServ"),
      baseCalculo: texto(inf, "valores/vBC"),
      aliquota: texto(inf, "valores/pAliqAplic"),
      iss: texto(inf, "valores/vISSQN"),
      retencoes: texto(inf, "valores/vTotalRet"),
      liquido: texto(inf, "valores/vLiq"),
    },
  };
}
