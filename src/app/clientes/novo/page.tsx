import { connection } from "next/server";
import { Suspense } from "react";
import { listarPerfisOpcao } from "@/lib/perfis";
import { FormCliente } from "../form-cliente";

async function Formulario() {
  await connection();
  return <FormCliente perfis={await listarPerfisOpcao()} />;
}

export default function Page() {
  return (
    <div className="cartao max-w-3xl">
      <h1 className="mb-5 text-lg font-semibold">Novo cliente</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
        <Formulario />
      </Suspense>
    </div>
  );
}
