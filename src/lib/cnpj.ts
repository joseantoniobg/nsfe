import "server-only";
import { somenteDigitos } from "./nfse/formatos";

export interface DadosCnpj {
  nome: string;
  email: string | null;
  fone: string | null;
  codMunicipio: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
}

/** Consulta dados públicos do CNPJ (BrasilAPI) para preencher o cadastro do cliente. */
export async function consultarCnpj(cnpj: string): Promise<DadosCnpj> {
  const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${somenteDigitos(cnpj)}`, { cache: "no-store" });
  if (r.status === 404) throw new Error("CNPJ não encontrado.");
  if (!r.ok) throw new Error(`Falha ao consultar CNPJ (HTTP ${r.status}).`);
  const d = await r.json();
  const logradouro = [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(" ");
  return {
    nome: d.razao_social,
    email: d.email ? String(d.email).toLowerCase() : null,
    fone: d.ddd_telefone_1 ? somenteDigitos(d.ddd_telefone_1) : null,
    codMunicipio: d.codigo_municipio_ibge ? String(d.codigo_municipio_ibge) : null,
    cep: d.cep ? somenteDigitos(String(d.cep)).padStart(8, "0") : null,
    logradouro: logradouro || null,
    numero: d.numero || null,
    complemento: d.complemento || null,
    bairro: d.bairro || null,
  };
}
