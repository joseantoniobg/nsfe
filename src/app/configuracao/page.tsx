import { asc } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { db } from "@/db";
import { servicos } from "@/db/schema";
import { certificadoConfigurado } from "@/lib/nfse/certificado";
import { formatarDocumento } from "@/lib/nfse/formatos";
import { obterEmitente } from "@/lib/notas";
import { FormEmitente } from "./form-emitente";
import { FormImportar } from "./form-importar";

function lerStatusCertificado() {
  try {
    const c = certificadoConfigurado();
    return { ...c, diasRestantes: Math.floor((c.validoAte.getTime() - Date.now()) / 86_400_000) };
  } catch (e) {
    return { erro: (e as Error).message };
  }
}

function StatusCertificado({ cnpjEmitente }: { cnpjEmitente?: string }) {
  const c = lerStatusCertificado();
  if ("erro" in c) return <p className="text-sm text-red-700">{c.erro}</p>;
  const divergente = cnpjEmitente && c.documento && c.documento !== cnpjEmitente;
  return (
    <div className="space-y-1 text-sm">
      <p>
        <span className="text-zinc-500">Titular:</span> {c.titular}
      </p>
      <p>
        <span className="text-zinc-500">Válido até:</span> {c.validoAte.toLocaleDateString("pt-BR")}{" "}
        <span className={c.diasRestantes < 30 ? "font-medium text-red-700" : "text-zinc-500"}>({c.diasRestantes} dias)</span>
      </p>
      {divergente && (
        <p className="font-medium text-red-700">
          Atenção: o certificado é do CNPJ {formatarDocumento(c.documento!)}, diferente do emitente configurado.
        </p>
      )}
    </div>
  );
}

async function Conteudo() {
  await connection();
  const [emitente, perfis] = await Promise.all([
    obterEmitente(),
    db.query.servicos.findMany({ with: { clientes: { columns: { nome: true } } }, orderBy: asc(servicos.nome) }),
  ]);
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <section className="cartao">
          <h2 className="mb-1 font-semibold">Importar notas do Emissor Nacional</h2>
          <p className="mb-4 text-sm text-zinc-600">
            Baixe no portal o XML de notas que você já emitiu. Cada tipo de serviço vira um perfil, com os códigos que o portal já aceitou, e os
            tomadores viram clientes ligados ao perfil da nota deles.
          </p>
          <FormImportar />
        </section>
        <section className="cartao">
          <h2 className="mb-3 font-semibold">Certificado digital</h2>
          <StatusCertificado cnpjEmitente={emitente?.cnpj} />
        </section>
      </div>

      <section className="cartao">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Perfis de serviço</h2>
          <Link href="/configuracao/servicos/novo" className="botao-secundario">
            Novo perfil
          </Link>
        </div>
        {perfis.length ? (
          <table className="tabela">
            <thead>
              <tr>
                <th>Perfil</th>
                <th>Código</th>
                <th>ISSQN</th>
                <th>IBS/CBS</th>
                <th>Clientes</th>
              </tr>
            </thead>
            <tbody>
              {perfis.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-50">
                  <td>
                    <Link href={`/configuracao/servicos/${p.id}`} className="font-medium underline-offset-2 hover:underline">
                      {p.nome}
                    </Link>
                  </td>
                  <td className="tabular-nums">{p.cTribNac}</td>
                  <td>{p.comExt ? `Exportação (${p.comExt.moeda})` : p.tribISSQN === "1" ? "Tributável" : p.tribISSQN}</td>
                  <td className="tabular-nums">{p.ibscbsAtivo && p.cClassTrib ? `${p.cClassTrib}${p.cIndOp ? ` / ${p.cIndOp}` : ""}` : "-"}</td>
                  <td>{p.clientes.map((c) => c.nome).join(", ") || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-zinc-500">Nenhum perfil. Importe XMLs do portal ou crie um.</p>
        )}
      </section>

      <section className="cartao">
        <FormEmitente key={emitente?.atualizadoEm.toISOString() ?? "novo"} emitente={emitente} />
      </section>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
      <Conteudo />
    </Suspense>
  );
}
