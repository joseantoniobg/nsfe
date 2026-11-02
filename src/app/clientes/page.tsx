import { asc, desc } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { db } from "@/db";
import { clientes } from "@/db/schema";
import { formatarDocumento, formatarMoeda } from "@/lib/nfse/formatos";

async function Lista() {
  await connection();
  const lista = await db.query.clientes.findMany({ with: { servico: true }, orderBy: [desc(clientes.ativo), asc(clientes.nome)] });
  if (!lista.length) return <p className="text-sm text-zinc-500">Nenhum cliente cadastrado.</p>;
  return (
    <table className="tabela">
      <thead>
        <tr>
          <th>Nome</th>
          <th>CNPJ / CPF</th>
          <th>Perfil de serviço</th>
          <th className="text-right">Valor padrão</th>
        </tr>
      </thead>
      <tbody>
        {lista.map((c) => (
          <tr key={c.id} className={c.ativo ? "hover:bg-zinc-50" : "text-zinc-400"}>
            <td>
              <Link href={`/clientes/${c.id}`} className="font-medium underline-offset-2 hover:underline">
                {c.nome}
              </Link>
              {!c.ativo && <span className="ml-2 text-xs">(inativo)</span>}
            </td>
            <td className="tabular-nums">
              {c.pais !== "BR" && <span className="mr-1 text-xs text-zinc-500">{c.pais}</span>}
              {c.pais === "BR" ? formatarDocumento(c.documento) : c.documento}
            </td>
            <td>{c.servico?.nome ?? <span className="text-red-700">sem perfil</span>}</td>
            <td className="text-right tabular-nums">
              {c.valorPadrao ? (c.servico?.comExt ? `${c.servico.comExt.moeda} ${Number(c.valorPadrao).toFixed(2)}` : formatarMoeda(c.valorPadrao)) : "-"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Page() {
  return (
    <div className="cartao">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Clientes</h1>
        <Link href="/clientes/novo" className="botao">
          Novo cliente
        </Link>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
        <Lista />
      </Suspense>
    </div>
  );
}
