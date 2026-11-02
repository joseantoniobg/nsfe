import "server-only";

export interface CotacaoPtax {
  valor: number; // já truncado
  data: string; // AAAA-MM-DD do boletim usado
}

const URL_BCB = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata";

const mmddaaaa = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${m}-${d}-${a}`;
};

export const truncar = (v: number, casas: number) => Math.trunc(v * 10 ** casas + 1e-9) / 10 ** casas;

/**
 * PTAX de fechamento do Banco Central na data informada. Se não houver boletim nesse dia
 * (fim de semana/feriado), usa o último dia útil anterior.
 */
export async function obterPtax(moeda: string, data: string, tipo: "compra" | "venda", casas: number): Promise<CotacaoPtax> {
  const inicio = new Date(`${data}T12:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - 10);
  const params = new URLSearchParams({
    "@moeda": `'${moeda}'`,
    "@dataInicial": `'${mmddaaaa(inicio.toISOString().slice(0, 10))}'`,
    "@dataFinalCotacao": `'${mmddaaaa(data)}'`,
    $format: "json",
    $select: "cotacaoCompra,cotacaoVenda,dataHoraCotacao,tipoBoletim",
  });
  const url = `${URL_BCB}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?${params}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Falha ao consultar a PTAX no Banco Central (HTTP ${r.status}). Informe a cotação manualmente.`);
  const { value } = (await r.json()) as {
    value: { cotacaoCompra: number; cotacaoVenda: number; dataHoraCotacao: string; tipoBoletim: string }[];
  };
  const fechamento = value.filter((v) => v.tipoBoletim === "Fechamento").at(-1);
  if (!fechamento) throw new Error(`Sem PTAX de ${moeda} até ${data}. Informe a cotação manualmente.`);
  return {
    valor: truncar(tipo === "compra" ? fechamento.cotacaoCompra : fechamento.cotacaoVenda, casas),
    data: fechamento.dataHoraCotacao.slice(0, 10),
  };
}
