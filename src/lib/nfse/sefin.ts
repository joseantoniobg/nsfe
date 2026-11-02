import { readFileSync } from "node:fs";
import { request } from "node:https";
import { gunzipSync, gzipSync } from "node:zlib";
import type { Certificado } from "./certificado";
import type { Ambiente } from "./dps";

const URL_SEFIN: Record<Ambiente, string> = {
  "1": "https://sefin.nfse.gov.br/SefinNacional",
  "2": "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
};

export interface MensagemSefin {
  codigo?: string;
  descricao: string;
  complemento?: string;
}

export interface RespostaHttp {
  status: number;
  corpo: Record<string, unknown> | null;
  texto: string;
}

/** Falha de transporte (timeout, conexão, 5xx): não se sabe se a Sefin processou o pedido. */
export class ErroComunicacao extends Error {}

export const compactarXml = (xml: string) => gzipSync(Buffer.from(xml, "utf-8")).toString("base64");
export const descompactarXml = (b64: string) => gunzipSync(Buffer.from(b64, "base64")).toString("utf-8");

function chamar(ambiente: Ambiente, cert: Certificado, metodo: string, caminho: string, corpo?: unknown): Promise<RespostaHttp> {
  // NFSE_URL_SEFIN permite apontar para um servidor de testes.
  const url = new URL((process.env.NFSE_URL_SEFIN ?? URL_SEFIN[ambiente]) + caminho);
  const dados = corpo === undefined ? undefined : Buffer.from(JSON.stringify(corpo));
  const caExtra = process.env.NFSE_CA_PATH ? readFileSync(process.env.NFSE_CA_PATH) : undefined;

  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: metodo,
        // Autenticação mútua TLS com o certificado A1 do contribuinte.
        key: cert.chavePem,
        cert: [cert.certPem, ...cert.cadeiaPem].join("\n"),
        ...(caExtra ? { ca: caExtra } : {}),
        headers: {
          Accept: "application/json",
          ...(dados ? { "Content-Type": "application/json", "Content-Length": dados.length } : {}),
        },
        timeout: 60_000,
      },
      (res) => {
        const partes: Buffer[] = [];
        res.on("data", (p) => partes.push(p));
        res.on("end", () => {
          const texto = Buffer.concat(partes).toString("utf-8");
          let json: Record<string, unknown> | null = null;
          try {
            json = texto ? JSON.parse(texto) : null;
          } catch {
            /* corpo não-JSON (ex.: página de erro do balanceador) */
          }
          resolve({ status: res.statusCode ?? 0, corpo: json, texto });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("Tempo esgotado aguardando a Sefin Nacional")));
    req.on("error", (e) => reject(new ErroComunicacao(`Falha de comunicação com a Sefin Nacional: ${e.message}`)));
    if (dados) req.write(dados);
    req.end();
  });
}

/** Lê um campo ignorando maiúsculas/minúsculas (a API mistura "Codigo"/"codigo"). */
function campo(obj: Record<string, unknown>, nome: string): unknown {
  const chave = Object.keys(obj).find((k) => k.toLowerCase() === nome.toLowerCase());
  return chave ? obj[chave] : undefined;
}

function mensagens(valor: unknown): MensagemSefin[] {
  const lista = Array.isArray(valor) ? valor : valor ? [valor] : [];
  return lista
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map((m) => ({
      codigo: campo(m, "codigo") as string | undefined,
      descricao: String(campo(m, "descricao") ?? campo(m, "mensagem") ?? JSON.stringify(m)),
      complemento: (campo(m, "complemento") as string | undefined) ?? undefined,
    }));
}

/** Extrai erros de uma resposta de rejeição, cobrindo as variações conhecidas do corpo. */
export function errosDaResposta(r: RespostaHttp): MensagemSefin[] {
  if (r.corpo) {
    const erros = mensagens(campo(r.corpo, "erros") ?? campo(r.corpo, "erro"));
    if (erros.length) return erros;
  }
  return [{ codigo: String(r.status), descricao: r.texto.slice(0, 500) || "Resposta vazia da Sefin Nacional" }];
}

export type ResultadoEnvio =
  | { tipo: "autorizada"; chaveAcesso: string; xmlNfse: string; alertas: MensagemSefin[] }
  | { tipo: "rejeitada"; erros: MensagemSefin[] };

export async function enviarDps(ambiente: Ambiente, cert: Certificado, xmlAssinado: string): Promise<ResultadoEnvio> {
  const r = await chamar(ambiente, cert, "POST", "/nfse", { dpsXmlGZipB64: compactarXml(xmlAssinado) });
  if (r.status >= 500) throw new ErroComunicacao(`Sefin Nacional respondeu HTTP ${r.status}: ${r.texto.slice(0, 300)}`);
  if (r.status >= 200 && r.status < 300 && r.corpo) {
    const chave = campo(r.corpo, "chaveAcesso") as string | undefined;
    const xmlB64 = campo(r.corpo, "nfseXmlGZipB64") as string | undefined;
    if (chave && xmlB64) {
      return { tipo: "autorizada", chaveAcesso: chave, xmlNfse: descompactarXml(xmlB64), alertas: mensagens(campo(r.corpo, "alertas")) };
    }
  }
  return { tipo: "rejeitada", erros: errosDaResposta(r) };
}

/** Recupera a chave de acesso de uma DPS já processada (null se a Sefin não gerou NFS-e para ela). */
export async function consultarChavePorDps(ambiente: Ambiente, cert: Certificado, idDps: string): Promise<string | null> {
  const r = await chamar(ambiente, cert, "GET", `/dps/${idDps}`);
  if (r.status === 404) return null;
  if (r.status >= 500) throw new ErroComunicacao(`Sefin Nacional respondeu HTTP ${r.status}`);
  const chave = r.corpo ? (campo(r.corpo, "chaveAcesso") as string | undefined) : undefined;
  if (!chave) {
    if (r.status >= 400) return null;
    throw new Error(`Resposta inesperada ao consultar DPS: ${r.texto.slice(0, 300)}`);
  }
  return chave;
}

export async function consultarNfse(ambiente: Ambiente, cert: Certificado, chaveAcesso: string): Promise<string> {
  const r = await chamar(ambiente, cert, "GET", `/nfse/${chaveAcesso}`);
  const xmlB64 = r.corpo ? (campo(r.corpo, "nfseXmlGZipB64") as string | undefined) : undefined;
  if (r.status !== 200 || !xmlB64) {
    throw new Error(`Falha ao consultar NFS-e: ${errosDaResposta(r).map((e) => e.descricao).join("; ")}`);
  }
  return descompactarXml(xmlB64);
}

export type ResultadoEvento = { tipo: "registrado"; xmlEvento: string } | { tipo: "rejeitado"; erros: MensagemSefin[] };

export async function registrarEvento(ambiente: Ambiente, cert: Certificado, chaveAcesso: string, xmlAssinado: string): Promise<ResultadoEvento> {
  const r = await chamar(ambiente, cert, "POST", `/nfse/${chaveAcesso}/eventos`, {
    pedidoRegistroEventoXmlGZipB64: compactarXml(xmlAssinado),
  });
  if (r.status >= 500) throw new ErroComunicacao(`Sefin Nacional respondeu HTTP ${r.status}: ${r.texto.slice(0, 300)}`);
  const xmlB64 = r.corpo ? (campo(r.corpo, "eventoXmlGZipB64") as string | undefined) : undefined;
  if (r.status >= 200 && r.status < 300 && xmlB64) return { tipo: "registrado", xmlEvento: descompactarXml(xmlB64) };
  return { tipo: "rejeitado", erros: errosDaResposta(r) };
}
