import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { servicos } from "@/db/schema";

/** Perfis ativos no formato usado pelos selects (moeda null = reais). */
export async function listarPerfisOpcao() {
  const lista = await db.query.servicos.findMany({ where: eq(servicos.ativo, true), orderBy: asc(servicos.nome) });
  return lista.map((s) => ({ id: s.id, nome: s.nome, moeda: s.comExt?.moeda ?? null, descricaoPadrao: s.descricaoPadrao }));
}
