import { XMLParser } from "fast-xml-parser";

export const NAMESPACE_NFSE = "http://www.sped.fazenda.gov.br/nfse";

export function escaparXml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Monta um elemento simples; valores vazios/undefined são omitidos (campos opcionais do leiaute). */
export function tag(nome: string, valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "";
  return `<${nome}>${escaparXml(String(valor))}</${nome}>`;
}

/** Grupo: omitido quando todos os filhos são vazios. */
export function grupo(nome: string, ...filhos: string[]): string {
  const conteudo = filhos.join("");
  return conteudo ? `<${nome}>${conteudo}</${nome}>` : "";
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  parseTagValue: false, // mantém zeros à esquerda (CNPJ, códigos)
  trimValues: true,
});

export function lerXml(xml: string): Record<string, unknown> {
  return parser.parse(xml);
}

/** Navega por um caminho "a/b/c" num objeto produzido por lerXml. */
export function caminho(obj: unknown, path: string): unknown {
  return path.split("/").reduce<unknown>((atual, parte) => {
    if (atual && typeof atual === "object") return (atual as Record<string, unknown>)[parte];
    return undefined;
  }, obj);
}

export function texto(obj: unknown, path: string): string | undefined {
  const v = caminho(obj, path);
  if (v === undefined || v === null || typeof v === "object") return undefined;
  return String(v);
}
