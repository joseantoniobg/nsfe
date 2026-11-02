import type { Nota } from "@/db/schema";

const ESTILOS: Record<Nota["status"], [string, string]> = {
  processando: ["Processando", "bg-zinc-100 text-zinc-700"],
  emitida: ["Emitida", "bg-emerald-100 text-emerald-800"],
  rejeitada: ["Rejeitada", "bg-red-100 text-red-800"],
  erro: ["Pendente (erro de comunicação)", "bg-amber-100 text-amber-900"],
  cancelada: ["Cancelada", "bg-zinc-200 text-zinc-600 line-through"],
};

export function StatusNota({ status }: { status: Nota["status"] }) {
  const [rotulo, classe] = ESTILOS[status];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${classe}`}>{rotulo}</span>;
}
