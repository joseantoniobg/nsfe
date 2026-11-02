import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { TabelaNotas } from "@/components/tabela-notas";
import { db } from "@/db";
import { clientes, notas } from "@/db/schema";
import { hojeBrasilia } from "@/lib/nfse/formatos";
import { obterEmitente } from "@/lib/notas";
import { listarPerfisOpcao } from "@/lib/perfis";
import { FormEmitir } from "./form-emitir";

async function Conteudo() {
  await connection();
  const [config, perfis, lista, recentes] = await Promise.all([
    obterEmitente(),
    listarPerfisOpcao(),
    db.query.clientes.findMany({ where: eq(clientes.ativo, true), orderBy: asc(clientes.nome) }),
    db.query.notas.findMany({ with: { cliente: true }, orderBy: desc(notas.id), limit: 8 }),
  ]);

  if (!config) {
    return (
      <div className="cartao max-w-xl">
        <h1 className="text-lg font-semibold">Vamos configurar</h1>
        <p className="mt-2 text-sm text-texto-3">
          Antes da primeira emissão, informe seus dados fiscais. O jeito mais rápido é importar o XML de uma nota já emitida no portal.
        </p>
        <Link href="/configuracao" className="botao mt-4">
          Ir para configuração
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
      <section className="cartao h-fit">
        <h1 className="mb-5 text-lg font-semibold">Emitir NFS-e</h1>
        {lista.length ? (
          <FormEmitir clientes={lista} perfis={perfis} hoje={hojeBrasilia()} />
        ) : (
          <p className="text-sm text-texto-3">
            Cadastre um cliente primeiro.{" "}
            <Link href="/clientes/novo" className="link">
              Novo cliente
            </Link>
          </p>
        )}
      </section>
      <section className="cartao h-fit">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">Últimas notas</h2>
          <Link href="/notas" className="link text-sm">
            Ver todas
          </Link>
        </div>
        <TabelaNotas notas={recentes} compacta />
      </section>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-texto-3">Carregando…</p>}>
      <Conteudo />
    </Suspense>
  );
}
