import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Voltar } from "@/components/voltar";
import { db } from "@/db";
import { clientes } from "@/db/schema";
import { listarPerfisOpcao } from "@/lib/perfis";
import { alternarClienteAtivoAction } from "../../actions";
import { FormCliente } from "../form-cliente";

async function Editar({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const [cliente, perfis] = await Promise.all([db.query.clientes.findFirst({ where: eq(clientes.id, Number(id)) }), listarPerfisOpcao()]);
  if (!cliente) notFound();
  return (
    <div className="cartao max-w-3xl">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold">{cliente.nome}</h1>
        <form action={alternarClienteAtivoAction.bind(null, cliente.id, !cliente.ativo)}>
          <button className="botao-secundario">{cliente.ativo ? "Inativar" : "Reativar"}</button>
        </form>
      </div>
      <FormCliente cliente={cliente} perfis={perfis} />
    </div>
  );
}

export default function Page(props: PageProps<"/clientes/[id]">) {
  return (
    <>
      <Voltar href="/clientes" rotulo="Clientes" />
      <Suspense fallback={<p className="text-sm text-texto-3">Carregando…</p>}>
        <Editar params={props.params} />
      </Suspense>
    </>
  );
}
