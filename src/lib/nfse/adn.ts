import type { Certificado } from "./certificado";
import type { Ambiente } from "./dps";
import { campo, descompactarXml, ErroComunicacao, errosDaResposta, requisitar } from "./sefin";

// Ambiente de Dados Nacional: distribuição dos documentos em que o contribuinte é parte.
const URL_ADN: Record<Ambiente, string> = {
  "1": "https://adn.nfse.gov.br/contribuintes",
  "2": "https://adn.producaorestrita.nfse.gov.br/contribuintes",
};

export interface DocumentoAdn {
  nsu: number;
  chaveAcesso?: string;
  tipo: string; // NFSE, EVENTO, ...
  xml?: string;
}

export interface LoteAdn {
  documentos: DocumentoAdn[];
  /** false quando o ADN responde que não há documentos a partir do NSU pedido. */
  encontrou: boolean;
}

/** Busca o lote de documentos a partir do NSU (exclusivo: o primeiro retornado é o seguinte a ele). */
export async function distribuicaoDfe(ambiente: Ambiente, cert: Certificado, cnpj: string, nsu: number): Promise<LoteAdn> {
  const url = new URL(`${process.env.NFSE_URL_ADN ?? URL_ADN[ambiente]}/DFe/${nsu}`);
  url.searchParams.set("cnpjConsulta", cnpj);
  url.searchParams.set("lote", "true");
  const r = await requisitar(url, cert, "GET");
  if (r.status >= 500) throw new ErroComunicacao(`ADN respondeu HTTP ${r.status}: ${r.texto.slice(0, 300)}`);

  const status = r.corpo ? String(campo(r.corpo, "StatusProcessamento") ?? "") : "";
  if (status === "NENHUM_DOCUMENTO_LOCALIZADO" || (r.status === 404 && !errosReais(r))) return { documentos: [], encontrou: false };
  const lote = r.corpo ? campo(r.corpo, "LoteDFe") : undefined;
  if (r.status !== 200 || !Array.isArray(lote)) {
    throw new Error(`Falha na distribuição do ADN: ${errosDaResposta(r).map((e) => [e.codigo, e.descricao].filter(Boolean).join(" - ")).join("; ")}`);
  }

  const documentos = lote
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
    .map((d) => {
      const xmlB64 = campo(d, "ArquivoXml") as string | undefined;
      return {
        nsu: Number(campo(d, "NSU")),
        chaveAcesso: (campo(d, "ChaveAcesso") as string | undefined) ?? undefined,
        tipo: String(campo(d, "TipoDocumento") ?? ""),
        xml: xmlB64 ? descompactarXml(xmlB64) : undefined,
      };
    });
  return { documentos, encontrou: documentos.length > 0 };
}

function errosReais(r: { corpo: Record<string, unknown> | null }): boolean {
  const erros = r.corpo ? campo(r.corpo, "Erros") : undefined;
  return Array.isArray(erros) && erros.length > 0;
}
