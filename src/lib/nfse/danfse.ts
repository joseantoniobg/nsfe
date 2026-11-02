import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import localidades from "@/data/localidades.json";
import { formatarDocumento } from "./formatos";
import { caminho, lerXml, texto } from "./xml";

/**
 * DANFSe no leiaute v2.0 (NT 008), reproduzindo a grade do PDF gerado pelo portal nacional.
 * As medidas (em pontos, A4) foram extraídas de um DANFSe oficial; coordenadas verticais são
 * contadas a partir do topo da página ("td") e convertidas na hora de desenhar.
 */

const URL_CONSULTA_PUBLICA = "https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=";
const LOGO = path.join(process.cwd(), "src/lib/nfse/recursos/logo-nfse.png");
// Logo da empresa ao lado do da NFS-e (opcional; PNG ou JPG).
const LOGO_EMPRESA = ["png", "jpg", "jpeg"].map((ext) => path.join(process.cwd(), `src/lib/nfse/recursos/logo-empresa.${ext}`));

const LARGURA = 595;
const ALTURA = 842;
const BORDA = [8.5, 153.1, 297.6, 442.2, 586.8]; // limites das 4 colunas
const COLUNA = [11.9, 156.5, 301.0, 445.6]; // início do texto de cada coluna
const CINZA = rgb(0.949, 0.949, 0.949);
const PRETO = rgb(0, 0, 0);

const ROTULO = 6; // tamanho dos rótulos (negrito)
const VALOR = 7; // tamanho dos valores
const ROTULO_VALOR = 7.7; // distância da linha de base do rótulo à do valor
const LINHA_CAMPOS = 19.1; // altura de uma linha de campos
const APOS_SECAO = 6; // da última linha de base até o traço da próxima seção

const { municipios, paises } = localidades as unknown as { municipios: Record<string, [string, string]>; paises: Record<string, string> };

// ---------- formatação ----------

const traco = (v?: string | null) => (v && v.trim() ? v : "-");
const numeroBr = (v: string, casas = 2) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const reais = (v?: string) => (v ? `R$ ${numeroBr(v)}` : "-");
const percentual = (v?: string) => (v ? `${numeroBr(v)} %` : "-");

function dataHora(iso?: string) {
  if (!iso) return "-";
  const [data, hora] = iso.split("T");
  const dataBr = data.split("-").reverse().join("/");
  return hora ? `${dataBr} ${hora.slice(0, 8)}` : dataBr;
}

function telefone(v?: string) {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return traco(v);
}

const ibge = (c?: string) => (c ? `${c.slice(0, 2)}.${c.slice(2)}` : "-");
const cep = (c?: string) => (c && c.length === 8 ? `${c.slice(0, 2)}.${c.slice(2, 5)}-${c.slice(5)}` : traco(c));
const codigoTributacao = (c?: string) => (c ? `${c.slice(0, 2)}.${c.slice(2, 4)}.${c.slice(4, 6)}` : "-");
const nbs = (c?: string) => (c && c.length === 9 ? `${c[0]}.${c.slice(1, 5)}.${c.slice(5, 7)}.${c.slice(7)}` : traco(c));
const municipioUf = (cod?: string) => (cod && municipios[cod] ? `${municipios[cod][0]} / ${municipios[cod][1]}` : "-");
const naoInformado = (v?: string) => (v && v !== "NI" ? v : undefined);

const SIMPLES: Record<string, string> = {
  "1": "Não Optante",
  "2": "Optante - Microempreendedor Individual (MEI)",
  "3": "Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)",
  "4": "Optante Pendente",
};
const REGIME_SN: Record<string, string> = {
  "1": "Regime de apuração dos tributos federais e municipal pelo Simples Nacional",
  "2": "Regime de apuração dos tributos federais pelo SN e o ISSQN por fora do SN conforme respectiva legislação municipal do tributo",
  "3": "Regime de apuração dos tributos federais e municipal por fora do SN conforme respectivas legislações federal e municipal de cada tributo",
};
const EMITENTE: Record<string, string> = { "1": "Prestador", "2": "Tomador", "3": "Intermediário" };
const TRIBUTACAO_ISSQN: Record<string, string> = {
  "1": "Operação Tributável",
  "2": "Imunidade",
  "3": "Exportação de Serviço",
  "4": "Não Incidência",
};
const RETENCAO_ISSQN: Record<string, string> = { "1": "Não Retido", "2": "Retido pelo Tomador", "3": "Retido pelo Intermediário" };
const RETENCAO_PIS_COFINS: Record<string, string> = {
  "0": "PIS/COFINS/CSLL Não Retidos",
  "1": "PIS/COFINS Retidos",
  "2": "PIS/COFINS Não Retidos",
  "3": "PIS/COFINS/CSLL Retidos",
  "4": "PIS/COFINS Retidos, CSLL Não Retido",
  "5": "PIS Retido, COFINS/CSLL Não Retido",
  "6": "COFINS Retido, PIS/CSLL Não Retido",
  "7": "PIS Não Retido, COFINS/CSLL Retidos",
  "8": "PIS/COFINS Não Retidos, CSLL Retido",
  "9": "COFINS Não Retido, PIS/CSLL Retidos",
};
const MOEDAS: Record<string, string> = { "840": "USD", "978": "EUR", "826": "GBP", "124": "CAD", "036": "AUD", "756": "CHF", "392": "JPY" };

/** Fontes padrão do PDF usam WinAnsi: remove caracteres fora dessa tabela. */
const limpar = (t: string) =>
  t
    .normalize("NFC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

// ---------- desenho ----------

interface Campo {
  rotulo: string;
  valor: string;
  colunas?: number; // quantas colunas o campo ocupa (padrão 1)
}

class Pagina {
  constructor(
    private page: PDFPage,
    private normal: PDFFont,
    private negrito: PDFFont,
  ) {}

  texto(t: string, x: number, td: number, tamanho: number, fonte: "n" | "b" = "n") {
    this.page.drawText(limpar(t), { x, y: ALTURA - td, size: tamanho, font: fonte === "b" ? this.negrito : this.normal, color: PRETO });
  }

  centralizado(t: string, centro: number, td: number, tamanho: number, fonte: "n" | "b" = "n") {
    const largura = (fonte === "b" ? this.negrito : this.normal).widthOfTextAtSize(limpar(t), tamanho);
    this.texto(t, centro - largura / 2, td, tamanho, fonte);
  }

  /** Corta com "..." o que não cabe na largura, como o portal faz. */
  ajustar(t: string, largura: number, tamanho: number, fonte: "n" | "b" = "n"): string {
    const f = fonte === "b" ? this.negrito : this.normal;
    let s = limpar(t);
    if (f.widthOfTextAtSize(s, tamanho) <= largura) return s;
    while (s && f.widthOfTextAtSize(s + " ...", tamanho) > largura) s = s.slice(0, -1);
    return s.trimEnd() + " ...";
  }

  quebrar(t: string, largura: number, tamanho: number): string[] {
    const linhas: string[] = [];
    for (const paragrafo of limpar(t).split(/\r?\n/)) {
      let atual = "";
      for (const palavra of paragrafo.split(/\s+/)) {
        const tentativa = atual ? `${atual} ${palavra}` : palavra;
        if (this.normal.widthOfTextAtSize(tentativa, tamanho) > largura && atual) {
          linhas.push(atual);
          atual = palavra;
        } else atual = tentativa;
      }
      linhas.push(atual);
    }
    return linhas;
  }

  linha(td: number, x1 = BORDA[0], x2 = BORDA[4], espessura = 0.5) {
    this.page.drawLine({ start: { x: x1, y: ALTURA - td }, end: { x: x2, y: ALTURA - td }, thickness: espessura, color: PRETO });
  }

  fundo(x: number, td: number, largura: number, altura: number) {
    this.page.drawRectangle({ x, y: ALTURA - td - altura, width: largura, height: altura, color: CINZA });
  }

  /** Uma linha de campos em colunas, a partir da coluna `inicio`. */
  campos(td: number, campos: Campo[], inicio = 0) {
    let col = inicio;
    for (const c of campos) {
      const span = c.colunas ?? 1;
      const largura = BORDA[col + span] - COLUNA[col] - 2;
      this.texto(this.ajustar(c.rotulo, largura, ROTULO, "b"), COLUNA[col], td, ROTULO, "b");
      this.texto(this.ajustar(c.valor, largura, VALOR), COLUNA[col], td + ROTULO_VALOR, VALOR);
      col += span;
    }
  }

  /**
   * Seção com título na primeira coluna (fundo cinza) e linhas de campos.
   * Retorna a posição do traço da próxima seção.
   */
  secao(td: number, titulo: string, linhas: Campo[][]): number {
    this.fundo(BORDA[0], td, BORDA[1] - BORDA[0], 19.1);
    this.linha(td);
    this.texto(titulo, COLUNA[0], td + 6.8, VALOR, "b");
    let y = td + 5.9;
    linhas.forEach((campos, i) => {
      this.campos(y, campos, i === 0 ? 1 : 0);
      if (i < linhas.length - 1) y += LINHA_CAMPOS;
    });
    return y + ROTULO_VALOR + APOS_SECAO;
  }

  /** Faixa estreita com texto centralizado ("DESTINATÁRIO ... NÃO IDENTIFICADO"). */
  faixa(td: number, t: string): number {
    this.linha(td);
    this.centralizado(t, (BORDA[0] + BORDA[4]) / 2, td + 6.7, VALOR);
    return td + 8.4;
  }

  marcaDagua(t: string, td: number) {
    this.page.drawText(t, { x: 80, y: ALTURA - td, size: 52, font: this.negrito, color: rgb(0.85, 0.1, 0.1), opacity: 0.15, rotate: degrees(30) });
  }
}

export async function gerarDanfse(xmlNfse: string, opcoes: { cancelada?: boolean } = {}): Promise<Uint8Array> {
  const doc = lerXml(xmlNfse);
  const inf = caminho(doc, "NFSe/infNFSe");
  if (!inf) throw new Error("XML de NFS-e inválido.");
  const dps = caminho(inf, "DPS/infDPS");
  const t = (no: unknown, p: string) => texto(no, p);
  const chave = t(inf, "@Id")?.replace(/^NFS/, "") ?? "";
  const numero = t(inf, "nNFSe") ?? "";

  const pdf = await PDFDocument.create();
  pdf.setTitle(`NFS-e ${numero}`);
  const page = pdf.addPage([LARGURA, ALTURA]);
  const p = new Pagina(page, await pdf.embedFont(StandardFonts.Helvetica), await pdf.embedFont(StandardFonts.HelveticaBold));

  // Moldura e cabeçalho
  page.drawRectangle({ x: 5, y: 5, width: 585, height: 832, borderColor: PRETO, borderWidth: 1 });
  p.fundo(BORDA[0], 5.7, BORDA[1] - BORDA[0], 34);
  p.fundo(BORDA[1], 5.7, BORDA[3] - BORDA[1], 34);
  p.fundo(BORDA[3], 5.7, BORDA[4] - BORDA[3], 34);
  const logo = await pdf.embedPng(readFileSync(LOGO));
  page.drawImage(logo, { x: 11.91, y: 808.76, width: 115.65, height: 22.92 });
  const arquivoEmpresa = LOGO_EMPRESA.find((a) => existsSync(a));
  if (arquivoEmpresa) {
    const bytes = readFileSync(arquivoEmpresa);
    const img = arquivoEmpresa.endsWith(".png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    // Cabe em 70 x 23 pt, 8 pt à direita do logo da NFS-e e alinhado verticalmente com ele.
    const escala = Math.min(70 / img.width, 22.92 / img.height);
    const altura = img.height * escala;
    page.drawImage(img, { x: 11.91 + 115.65 + 8, y: 808.76 + (22.92 - altura) / 2, width: img.width * escala, height: altura });
  }
  p.linha(39.9);
  p.centralizado("DANFSe v2.0", (BORDA[1] + BORDA[3]) / 2, 20.8, 9, "b");
  p.centralizado("Documento Auxiliar da NFS-e", (BORDA[1] + BORDA[3]) / 2, 31.1, 9, "b");
  const ufEmit = t(inf, "emit/enderNac/UF") ?? municipios[t(dps, "cLocEmi") ?? ""]?.[1];
  p.texto(`Município: ${t(inf, "xLocEmi") ?? "-"}${ufEmit ? ` - ${ufEmit}` : ""}`, COLUNA[3], 18.7, 8);
  p.texto(`Ambiente Gerador: ${t(inf, "ambGer") ?? "-"}`, COLUNA[3], 25.9, 6);
  p.texto(`Tipo de Ambiente: ${t(dps, "tpAmb") ?? "-"}`, COLUNA[3], 32.7, 6);

  // Identificação da nota
  p.texto("CHAVE DE ACESSO DA NFS-e", COLUNA[0], 51.0, VALOR, "b");
  p.texto(chave, COLUNA[0], 58.9, VALOR);
  const topo: [string, string][][] = [
    [
      ["NÚMERO DA NFS-e", numero],
      ["COMPETÊNCIA DA NFS-e", dataHora(t(dps, "dCompet"))],
      ["DATA E HORA DA EMISSÃO DA NFS-e", dataHora(t(inf, "dhProc"))],
    ],
    [
      ["NÚMERO DA DPS", traco(t(dps, "nDPS"))],
      ["SÉRIE DA DPS", traco(t(dps, "serie"))],
      ["DATA E HORA DA EMISSÃO DA DPS", dataHora(t(dps, "dhEmi"))],
    ],
    [
      ["EMITENTE DA NFS-e", EMITENTE[t(dps, "tpEmit") ?? ""] ?? "-"],
      ["SITUAÇÃO DA NFS-e", opcoes.cancelada ? "NFS-e Cancelada" : "NFS-e Gerada"],
      ["FINALIDADE", "NFS-e regular"],
    ],
  ];
  p.fundo(BORDA[0], 105.1, BORDA[1] - BORDA[0], 20.2);
  topo.forEach((linha, i) =>
    linha.forEach(([rotulo, valor], j) => {
      p.texto(rotulo, COLUNA[j], 71.2 + i * 20.25, VALOR, "b");
      p.texto(valor, COLUNA[j], 79.2 + i * 20.2, VALOR);
    }),
  );
  if (chave) {
    const qr = await pdf.embedPng(await QRCode.toBuffer(URL_CONSULTA_PUBLICA + chave, { margin: 0, width: 300 }));
    page.drawImage(qr, { x: 491.99, y: 752.24, width: 45, height: 45 });
  }
  ["A autenticidade desta NFS-e pode ser verificada", "pela leitura deste código QR ou pela consulta da", "chave de acesso no portal nacional da NFS-e"].forEach(
    (l, i) => p.texto(l, COLUNA[3], 97.4 + i * 6.8, 6),
  );

  // Prestador
  const emit = caminho(inf, "emit");
  const endEmit = caminho(emit, "enderNac");
  const regTrib = caminho(dps, "prest/regTrib");
  let y = p.secao(125.6, "PRESTADOR / FORNECEDOR", [
    [
      { rotulo: "CNPJ / CPF / NIF", valor: formatarDocumento(t(emit, "CNPJ") ?? t(emit, "CPF") ?? "-") },
      { rotulo: "Indicador Municipal (Inscrição)", valor: traco(t(emit, "IM") ?? t(dps, "prest/IM")) },
      { rotulo: "Telefone", valor: telefone(t(emit, "fone")) },
    ],
    [
      { rotulo: "Nome / Nome Empresarial", valor: traco(t(emit, "xNome")), colunas: 2 },
      { rotulo: "Município / Sigla UF", valor: municipioUf(t(endEmit, "cMun")) },
      { rotulo: "Código IBGE / CEP", valor: `${ibge(t(endEmit, "cMun"))} / ${cep(t(endEmit, "CEP"))}` },
    ],
    [
      {
        rotulo: "Endereço",
        valor: traco([t(endEmit, "xLgr"), t(endEmit, "nro"), t(endEmit, "xCpl"), t(endEmit, "xBairro")].filter(Boolean).join(", ")),
        colunas: 2,
      },
      { rotulo: "E-mail", valor: traco(t(emit, "email")), colunas: 2 },
    ],
    [
      { rotulo: "Simples Nacional na Data de Competência", valor: SIMPLES[t(regTrib, "opSimpNac") ?? ""] ?? "-" },
      { rotulo: "Regime de Apuração Tributária pelo SN", valor: REGIME_SN[t(regTrib, "regApTribSN") ?? ""] ?? "-", colunas: 3 },
    ],
  ]);

  // Tomador
  const toma = caminho(dps, "toma");
  if (toma) {
    const end = caminho(toma, "end");
    const ext = caminho(end, "endExt");
    const nacional = caminho(end, "endNac");
    const localTomador = ext
      ? [t(ext, "xCidade"), naoInformado(t(ext, "xEstProvReg")), paises[t(ext, "cPais") ?? ""] ?? t(ext, "cPais")].filter(Boolean).join(" / ")
      : municipioUf(t(nacional, "cMun"));
    const docNacional = t(toma, "CNPJ") ?? t(toma, "CPF");
    y = p.secao(y, "TOMADOR / ADQUIRENTE", [
      [
        { rotulo: "CNPJ / CPF / NIF", valor: t(toma, "NIF") ?? (docNacional ? formatarDocumento(docNacional) : "-") },
        { rotulo: "Indicador Municipal (Inscrição)", valor: traco(t(toma, "IM")) },
        { rotulo: "Telefone", valor: telefone(t(toma, "fone")) },
      ],
      [
        { rotulo: "Nome / Nome Empresarial", valor: traco(t(toma, "xNome")), colunas: 2 },
        { rotulo: "Município / Sigla UF", valor: traco(localTomador) },
        {
          rotulo: "Código IBGE / CEP",
          valor: ext ? `- / ${traco(naoInformado(t(ext, "cEndPost")))}` : `${ibge(t(nacional, "cMun"))} / ${cep(t(nacional, "CEP"))}`,
        },
      ],
      [
        {
          rotulo: "Endereço",
          valor: traco(
            [t(end, "xLgr"), naoInformado(t(end, "nro")), naoInformado(t(end, "xCpl")), naoInformado(t(end, "xBairro"))].filter(Boolean).join(", "),
          ),
          colunas: 2,
        },
        { rotulo: "E-mail", valor: traco(t(toma, "email")), colunas: 2 },
      ],
    ]);
  } else {
    y = p.faixa(y, "TOMADOR / ADQUIRENTE NÃO IDENTIFICADO NA NFS-e");
  }
  y = p.faixa(y, "DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e");
  y = p.faixa(y, "INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e");

  // Serviço
  const cServ = caminho(dps, "serv/cServ");
  const cLocPrestacao = t(dps, "serv/locPrest/cLocPrestacao");
  const paisPrestacao = t(dps, "serv/locPrest/cPaisPrestacao");
  p.fundo(BORDA[0], y, BORDA[1] - BORDA[0], 19.1);
  p.linha(y);
  p.texto("SERVIÇO PRESTADO", COLUNA[0], y + 6.8, VALOR, "b");
  p.campos(
    y + 5.9,
    [
      { rotulo: "Código de Tributação Nacional/Municipal", valor: `${codigoTributacao(t(cServ, "cTribNac"))} / ${traco(t(cServ, "cTribMun"))}` },
      { rotulo: "Código da NBS", valor: nbs(t(cServ, "cNBS")) },
      {
        rotulo: "Local da Prestação / Sigla UF / País",
        valor: paisPrestacao
          ? `- / - / ${paises[paisPrestacao] ?? paisPrestacao}`
          : `${t(inf, "xLocPrestacao") ?? municipios[cLocPrestacao ?? ""]?.[0] ?? "-"} / ${municipios[cLocPrestacao ?? ""]?.[1] ?? "-"} / -`,
      },
    ],
    1,
  );
  y += 5.9 + ROTULO_VALOR + 12.1;
  p.texto(p.ajustar(t(inf, "xTribNac") ?? "", BORDA[4] - COLUNA[0] - 2, VALOR), COLUNA[0], y, VALOR);
  y += 11.4;
  p.texto("Descrição do Serviço", COLUNA[0], y, ROTULO, "b");
  y += ROTULO_VALOR;
  const descricao = p.quebrar(t(cServ, "xDescServ") ?? "-", BORDA[4] - COLUNA[0] - 2, VALOR);
  descricao.forEach((l, i) => p.texto(l, COLUNA[0], y + i * 8.5, VALOR));
  y += (descricao.length - 1) * 8.5 + APOS_SECAO;

  // Tributação municipal
  const tribMun = caminho(dps, "valores/trib/tribMun");
  const valoresNfse = caminho(inf, "valores");
  const cLocIncid = t(inf, "cLocIncid");
  const paisResultado = t(tribMun, "cPaisResult");
  y = p.secao(y, "TRIBUTAÇÃO MUNICIPAL (ISSQN)", [
    [
      { rotulo: "Tipo de Tributação do ISSQN", valor: TRIBUTACAO_ISSQN[t(tribMun, "tribISSQN") ?? ""] ?? "-" },
      {
        rotulo: "Município / Sigla UF / País de Incidência do ISSQN",
        valor: `${t(inf, "xLocIncid") ?? "-"} / ${municipios[cLocIncid ?? ""]?.[1] ?? "-"} / ${paisResultado ? (paises[paisResultado] ?? paisResultado) : "-"}`,
        colunas: 2,
      },
    ],
    [
      { rotulo: "BC ISSQN", valor: reais(t(valoresNfse, "vBC")) },
      { rotulo: "Alíquota Aplicada", valor: percentual(t(valoresNfse, "pAliqAplic")) },
      { rotulo: "Retenção do ISSQN", valor: RETENCAO_ISSQN[t(tribMun, "tpRetISSQN") ?? ""] ?? "-" },
      { rotulo: "ISSQN Apurado", valor: reais(t(valoresNfse, "vISSQN")) },
    ],
  ]);

  // Tributação federal
  const tribFed = caminho(dps, "valores/trib/tribFed");
  const tpRetPisCofins = t(tribFed, "piscofins/tpRetPisCofins");
  y = p.secao(y, "TRIBUTAÇÃO FEDERAL (EXCETO CBS)", [
    [
      { rotulo: "IRRF", valor: reais(t(tribFed, "vRetIRRF")) },
      { rotulo: "Contribuição Previdenciária - Retida", valor: reais(t(tribFed, "vRetCP")) },
      { rotulo: "Contribuições Sociais - Retidas", valor: reais(t(tribFed, "vRetCSLL")) },
    ],
    [
      { rotulo: "PIS - Débito Apuração Própria", valor: reais(t(tribFed, "piscofins/vPis")) },
      { rotulo: "COFINS - Débito Apuração Própria", valor: reais(t(tribFed, "piscofins/vCofins")) },
      {
        rotulo: "Descrição Contrib. Sociais - Retidas",
        valor: tpRetPisCofins ? `${tpRetPisCofins} - ${RETENCAO_PIS_COFINS[tpRetPisCofins] ?? ""}` : "-",
        colunas: 2,
      },
    ],
  ]);

  // Tributação IBS/CBS (valores calculados pela Sefin ficam em infNFSe/IBSCBS)
  const ibsDps = caminho(dps, "IBSCBS");
  const ibs = caminho(inf, "IBSCBS");
  const vIbs = caminho(ibs, "valores");
  const tot = caminho(ibs, "totCIBS");
  const cst = t(ibsDps, "valores/trib/CST") ?? t(ibsDps, "valores/trib/gIBSCBS/CST");
  const cClassTrib = t(ibsDps, "valores/trib/cClassTrib") ?? t(ibsDps, "valores/trib/gIBSCBS/cClassTrib");
  const cLocIbs = t(ibs, "cLocalidadeIncid");
  y = p.secao(y, "TRIBUTAÇÃO IBS/CBS", [
    [
      { rotulo: "CST / cClassTrib", valor: `${traco(cst)} / ${traco(cClassTrib)}` },
      {
        rotulo: "Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF",
        valor: [traco(t(ibsDps, "cIndOp")), traco(cLocIbs), traco(t(ibs, "xLocalidadeIncid")), municipios[cLocIbs ?? ""]?.[1] ?? "-"].join(" / "),
        colunas: 2,
      },
    ],
    [
      { rotulo: "Exclusões e Reduções da Base de Cálculo", valor: reais(t(vIbs, "vCalcReeRepRes")) },
      { rotulo: "Base de Cálculo Após Exclusões e Reduções", valor: reais(t(vIbs, "vBC")) },
      {
        rotulo: "Red. Alíquota IBS / Red. Alíquota CBS",
        valor: [t(vIbs, "uf/pRedAliqUF"), t(vIbs, "mun/pRedAliqMun"), t(vIbs, "fed/pRedAliqCBS")].map((v) => (v ? `${numeroBr(v)} %` : "-")).join(" / "),
      },
      { rotulo: "Alíquota - IBS UF / IBS Mun", valor: `${percentual(t(vIbs, "uf/pIBSUF"))} / ${percentual(t(vIbs, "mun/pIBSMun"))}` },
    ],
    [
      { rotulo: "Alíq. Efetiva Municipal - IBS", valor: percentual(t(vIbs, "mun/pAliqEfetMun")) },
      { rotulo: "Valor Apurado Municipal - IBS", valor: reais(t(tot, "gIBS/gIBSMunTot/vIBSMun")) },
      { rotulo: "Alíq. Efetiva Estadual - IBS", valor: percentual(t(vIbs, "uf/pAliqEfetUF")) },
      { rotulo: "Valor Apurado Estadual - IBS", valor: reais(t(tot, "gIBS/gIBSUFTot/vIBSUF")) },
    ],
    [
      { rotulo: "Valor Total Apurado - IBS", valor: reais(t(tot, "gIBS/vIBSTot")) },
      { rotulo: "Alíquota - CBS", valor: percentual(t(vIbs, "fed/pCBS")) },
      { rotulo: "Alíquota Efetiva - CBS", valor: percentual(t(vIbs, "fed/pAliqEfetCBS")) },
      { rotulo: "Valor Total Apurado - CBS", valor: reais(t(tot, "gCBS/vCBS")) },
    ],
  ]);

  // Valor total
  const vServ = t(dps, "valores/vServPrest/vServ");
  const vIbsTot = t(tot, "gIBS/vIBSTot");
  const vCbs = t(tot, "gCBS/vCBS");
  const totalIbsCbs = vIbsTot || vCbs ? String(Number(vIbsTot ?? 0) + Number(vCbs ?? 0)) : undefined;
  p.fundo(BORDA[3], y + 19.3, BORDA[4] - BORDA[3], 19.1);
  y = p.secao(y, "VALOR TOTAL DA NFS-e", [
    [
      { rotulo: "VALOR DA OPERAÇÃO / SERVIÇO", valor: reais(vServ) },
      { rotulo: "Desconto Incondicionado", valor: reais(t(dps, "valores/vDescCondIncond/vDescIncond")) },
      { rotulo: "Desconto Condicionado", valor: reais(t(dps, "valores/vDescCondIncond/vDescCond")) },
    ],
    [
      { rotulo: "Total das Retenções (ISSQN / Federais)", valor: reais(t(valoresNfse, "vTotalRet")) },
      { rotulo: "VALOR LÍQUIDO DA NFS-e", valor: reais(t(valoresNfse, "vLiq") ?? vServ) },
      { rotulo: "Total do IBS/CBS", valor: reais(totalIbsCbs) },
      { rotulo: "VALOR LÍQUIDO DA NFS-e + IBS/CBS", valor: reais(t(tot, "vTotNF") ?? t(valoresNfse, "vLiq") ?? vServ) },
    ],
  ]);

  // Informações complementares
  p.linha(y);
  p.texto("INFORMAÇÕES COMPLEMENTARES", COLUNA[0], y + 6.8, VALOR, "b");
  const totTrib = caminho(dps, "valores/trib/totTrib");
  const aprox = (monet?: string, perc?: string) => (monet ? `R$ ${numeroBr(monet)}` : perc ? `${numeroBr(perc)}%` : "-");
  const informacoes = [
    `Totais aproximados dos Tributos cfe. Lei n° 12.741/2012: Federais: ${aprox(t(totTrib, "vTotTrib/vTotTribFed"), t(totTrib, "pTotTrib/pTotTribFed"))}; ` +
      `Estaduais: ${aprox(t(totTrib, "vTotTrib/vTotTribEst"), t(totTrib, "pTotTrib/pTotTribEst"))}; ` +
      `Municipais: ${aprox(t(totTrib, "vTotTrib/vTotTribMun"), t(totTrib, "pTotTrib/pTotTribMun"))};`,
  ];
  const comExt = caminho(dps, "serv/comExt");
  if (comExt) {
    const tpMoeda = t(comExt, "tpMoeda") ?? "";
    const valorMoeda = Number(t(comExt, "vServMoeda") ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
    informacoes.push(`Exportação de serviço - valor na moeda estrangeira: ${MOEDAS[tpMoeda] ?? tpMoeda} ${valorMoeda}`);
  }
  const infoCompl = t(dps, "serv/infoCompl/xInfComp");
  if (infoCompl) informacoes.push(infoCompl);
  let yInfo = y + 26.9;
  for (const linha of informacoes.flatMap((i) => p.quebrar(i, BORDA[4] - COLUNA[0] - 2, VALOR))) {
    p.texto(linha, COLUNA[0], yInfo, VALOR);
    yInfo += 8.5;
  }

  // Canhoto
  for (const x of [9.0, 153.6, 298.1, 587.3]) page.drawLine({ start: { x, y: 25.6 }, end: { x, y: 45.7 }, thickness: 1, color: PRETO });
  for (const yy of [26.1, 46.2]) page.drawLine({ start: { x: 8.5, y: yy }, end: { x: 587.8, y: yy }, thickness: 1, color: PRETO });
  p.texto("DATA CIENTIFICAÇÃO:", 12.9, 801.9, ROTULO, "b");
  p.texto("IDENTIFICAÇÃO E ASSINATURA", 157.5, 801.9, ROTULO, "b");
  p.texto("N° NFS-e / CHAVE NFS-e", 302.0, 801.9, ROTULO, "b");
  p.texto(`${numero} / ${chave}`, 302.0, 809.7, VALOR);

  // Marcas d'água
  if (t(dps, "tpAmb") === "2") p.marcaDagua("SEM VALOR FISCAL", 560);
  if (opcoes.cancelada) p.marcaDagua("CANCELADA", 420);

  return pdf.save();
}
