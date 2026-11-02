import type { Nota } from "@/db/schema";

const ESTILOS: Record<Nota["status"], [string, string]> = {
  processando: ["Processando", "bg-sutil text-texto-2"],
  emitida: ["Emitida", "bg-sucesso-fundo text-sucesso"],
  rejeitada: ["Rejeitada", "bg-erro-fundo text-erro"],
  erro: ["Pendente (erro de comunicação)", "bg-aviso-fundo text-aviso"],
  cancelada: ["Cancelada", "bg-sutil text-texto-3 line-through"],
};

export function StatusNota({ status }: { status: Nota["status"] }) {
  const [rotulo, classe] = ESTILOS[status];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${classe}`}>{rotulo}</span>;
}
