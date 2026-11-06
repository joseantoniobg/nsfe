export const somenteDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/** CNPJ pode ser alfanumérico a partir de 07/2026; CPF continua numérico. */
export const normalizarDocumento = (v: string | null | undefined) => (v ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");

export const ehCpf = (documento: string) => /^\d{11}$/.test(documento);
export const ehCnpj = (documento: string) => /^[0-9A-Z]{12}\d{2}$/.test(documento);

export function formatarDocumento(documento: string): string {
  if (ehCpf(documento)) return documento.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (ehCnpj(documento)) return documento.replace(/^(\w{2})(\w{3})(\w{3})(\w{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return documento;
}

export function formatarMoeda(valor: number | string): string {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * "1.234,56" | "1,234.56" | "1234.56" | "1234,5" -> 1234.56.
 * Com os dois separadores, o último é o decimal; com um só repetido ("1.234.567"), é milhar.
 */
export function lerValor(entrada: string): number {
  const limpo = entrada.trim().replace(/[^\d.,-]/g, "");
  const ultimo = Math.max(limpo.lastIndexOf(","), limpo.lastIndexOf("."));
  let normalizado = limpo;
  if (ultimo >= 0) {
    const sep = limpo[ultimo];
    const repetido = limpo.split(sep).length > 2;
    normalizado = repetido && !limpo.includes(sep === "," ? "." : ",")
      ? limpo.replaceAll(sep, "")
      : limpo.slice(0, ultimo).replace(/[.,]/g, "") + "." + limpo.slice(ultimo + 1);
  }
  return Math.round(Number(normalizado) * 100) / 100;
}

export const decimal2 = (v: number | string) => Number(v).toFixed(2);

/**
 * Data/hora no fuso de Brasília (UTC-3, sem horário de verão desde 2019) no formato exigido
 * pelo leiaute: AAAA-MM-DDThh:mm:ss-03:00.
 */
export function dataHoraBrasilia(data: Date): string {
  const local = new Date(data.getTime() - 3 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 19) + "-03:00";
}

export function hojeBrasilia(): string {
  return dataHoraBrasilia(new Date()).slice(0, 10);
}

/** Dia 01 do mês corrente (Brasília): competência padrão da emissão. */
export function inicioMesBrasilia(): string {
  return hojeBrasilia().slice(0, 8) + "01";
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export interface ContextoDescricao {
  competencia: string; // AAAA-MM-DD
  valor?: number; // em reais
  moeda?: string;
  valorMoeda?: number;
  cotacao?: number;
  dataCotacao?: string; // AAAA-MM-DD
}

export const VARIAVEIS_DESCRICAO =
  "{competencia} novembro/2026 · {mes} · {ano} · {mesAno} 11/2026 · {mesAnoAnterior} 10/2026 · {valor} 6.172,80 · exportação: {valorMoeda} 1,234.56 · {moeda} · {cotacao} 5,00 · {dataCotacao}";

const numeroBr = (v: number, casas = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const dataBr = (iso: string) => iso.split("-").reverse().join("/");

/** Substitui as variáveis de {@link VARIAVEIS_DESCRICAO} na descrição do serviço. */
export function aplicarModeloDescricao(modelo: string, ctx: ContextoDescricao): string {
  const [ano, mes] = ctx.competencia.split("-").map(Number);
  const anterior = mes === 1 ? [12, ano - 1] : [mes - 1, ano];
  const mm = (m: number) => String(m).padStart(2, "0");
  const variaveis: Record<string, string | undefined> = {
    competencia: `${MESES[mes - 1]}/${ano}`,
    mes: MESES[mes - 1],
    ano: String(ano),
    mesAno: `${mm(mes)}/${ano}`,
    mesAnoAnterior: `${mm(anterior[0])}/${anterior[1]}`,
    valor: ctx.valor !== undefined ? numeroBr(ctx.valor) : undefined,
    moeda: ctx.moeda,
    // Valor em moeda estrangeira no formato americano, como em "1,234.56 USD".
    valorMoeda: ctx.valorMoeda !== undefined ? ctx.valorMoeda.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : undefined,
    cotacao: ctx.cotacao !== undefined ? numeroBr(ctx.cotacao, Math.max(2, (String(ctx.cotacao).split(".")[1] ?? "").length)) : undefined,
    dataCotacao: ctx.dataCotacao ? dataBr(ctx.dataCotacao) : undefined,
  };
  return modelo.replace(/\{(\w+)\}/g, (original, nome: string) => variaveis[nome] ?? original);
}
