import { desc } from "drizzle-orm";
import { connection } from "next/server";
import { Suspense } from "react";
import { TabelaNotas } from "@/components/tabela-notas";
import { db } from "@/db";
import { notas } from "@/db/schema";

async function Lista() {
  await connection();
  const lista = await db.query.notas.findMany({ with: { cliente: true }, orderBy: desc(notas.id), limit: 500 });
  return <TabelaNotas notas={lista} />;
}

export default function Page() {
  return (
    <div className="cartao">
      <h1 className="mb-4 text-lg font-semibold">Notas</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
        <Lista />
      </Suspense>
    </div>
  );
}
