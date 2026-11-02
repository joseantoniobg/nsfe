import tabela from "@/data/correlacao.json";

export interface ItemCorrelacao {
  item: string; // "01.01"
  descricao: string;
  nbs: { codigo: string; descricao: string }[];
  cAtvSN: string | null;
  cIndOp: string | null;
  localIncidencia: string | null;
  cClassTrib: { codigo: string; nome: string }[];
}

const itens = tabela as ItemCorrelacao[];

export const listarItensServico = () => itens;

/** cTribNac "010101" -> item "01.01" do Anexo VIII (correlação LC 116 x NBS x cIndOp x cClassTrib). */
export function correlacaoPorCodigo(cTribNac: string): ItemCorrelacao | undefined {
  const item = `${cTribNac.slice(0, 2)}.${cTribNac.slice(2, 4)}`;
  return itens.find((i) => i.item === item);
}
