import Link from "next/link";
import type { Cliente, Nota } from "@/db/schema";
import { formatarMoeda } from "@/lib/nfse/formatos";
import { StatusNota } from "./status-nota";

const BOTAO = "rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100";
const BOTAO_INATIVO = "rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-300";

export function TabelaNotas({ notas }: { notas: (Nota & { cliente: Cliente })[] }) {
  if (!notas.length) return <p className="text-sm text-zinc-500">Nenhuma nota emitida ainda.</p>;
  return (
    <table className="tabela">
      <thead>
        <tr>
          <th>Nº NFS-e</th>
          <th>Data</th>
          <th>Cliente</th>
          <th className="text-right">Valor</th>
          <th>Situação</th>
          <th className="text-right">Ações</th>
        </tr>
      </thead>
      <tbody>
        {notas.map((n) => (
          <tr key={n.id} className="hover:bg-zinc-50">
            <td className="font-medium">
              {n.numeroNfse ?? `DPS ${n.numeroDps}`}
              {n.ambiente === "2" && <span className="ml-1 text-xs font-normal text-amber-700">(teste)</span>}
            </td>
            <td>{n.criadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
            <td>{n.cliente.nome}</td>
            <td className="text-right tabular-nums">{formatarMoeda(n.valor)}</td>
            <td>
              <StatusNota status={n.status} />
            </td>
            <td>
              <div className="flex justify-end gap-1.5">
                <Link href={`/notas/${n.id}`} className={BOTAO}>
                  Detalhes
                </Link>
                {n.xmlNfse ? (
                  <>
                    <a href={`/notas/${n.id}/xml`} className={BOTAO} download>
                      XML
                    </a>
                    <a href={`/notas/${n.id}/pdf?download=1`} className={BOTAO} download>
                      PDF
                    </a>
                  </>
                ) : (
                  <>
                    <span className={BOTAO_INATIVO} title="Nota sem NFS-e autorizada">
                      XML
                    </span>
                    <span className={BOTAO_INATIVO} title="Nota sem NFS-e autorizada">
                      PDF
                    </span>
                  </>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
