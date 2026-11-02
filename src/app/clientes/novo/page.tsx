import { connection } from "next/server";
import { Suspense } from "react";
import { Voltar } from "@/components/voltar";
import { listarPerfisOpcao } from "@/lib/perfis";
import { FormCliente } from "../form-cliente";

async function Formulario() {
  await connection();
  return <FormCliente perfis={await listarPerfisOpcao()} />;
}

export default function Page() {
  return (
    <>
      <Voltar href="/clientes" rotulo="Clientes" />
      <div className="cartao max-w-3xl">
        <h1 className="mb-5 text-lg font-semibold">Novo cliente</h1>
        <Suspense fallback={<p className="text-sm text-texto-3">Carregando…</p>}>
          <Formulario />
        </Suspense>
      </div>
    </>
  );
}
