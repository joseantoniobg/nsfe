import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { db } from "@/db";
import { servicos } from "@/db/schema";
import { listarItensServico } from "@/lib/nfse/correlacao";
import { FormServico } from "../form-servico";

async function Editar({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const servico = await db.query.servicos.findFirst({ where: eq(servicos.id, Number(id)) });
  if (!servico) notFound();
  return (
    <div className="cartao">
      <h1 className="mb-5 text-lg font-semibold">{servico.nome}</h1>
      <FormServico servico={servico} correlacao={listarItensServico()} />
    </div>
  );
}

export default function Page(props: PageProps<"/configuracao/servicos/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
      <Editar params={props.params} />
    </Suspense>
  );
}
