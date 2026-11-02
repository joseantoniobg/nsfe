import Link from "next/link";
import type { Cliente, Nota } from "@/db/schema";
import { formatarMoeda } from "@/lib/nfse/formatos";
import { StatusNota } from "./status-nota";

/** `compacta`: sem a coluna de data e sem o botão Detalhes (o número da nota leva aos detalhes). */
export function TabelaNotas({ notas, compacta = false }: { notas: (Nota & { cliente: Cliente })[]; compacta?: boolean }) {
  if (!notas.length) return <p className="text-sm text-texto-3">Nenhuma nota emitida ainda.</p>;
  return (
    <div className="rolagem-tabela">
      <table className="tabela">
        <thead>
          <tr>
            <th>Nº NFS-e</th>
            {!compacta && <th>Data</th>}
            <th>Cliente</th>
            <th className="text-right">Valor</th>
            <th>Situação</th>
            <th className="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {notas.map((n) => (
            <tr key={n.id}>
              <td className="whitespace-nowrap">
                <Link href={`/notas/${n.id}`} className="link">
                  {n.numeroNfse ?? `DPS ${n.numeroDps}`}
                </Link>
                {n.ambiente === "2" && <span className="ml-1 text-xs font-normal text-aviso">(teste)</span>}
              </td>
              {!compacta && <td className="whitespace-nowrap tabular-nums">{n.criadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>}
              <td>
                <span className="block max-w-52 truncate" title={n.cliente.nome}>
                  {n.cliente.nome}
                </span>
              </td>
              <td className="whitespace-nowrap text-right tabular-nums">{formatarMoeda(n.valor)}</td>
              <td>
                <StatusNota status={n.status} />
              </td>
              <td>
                <div className="flex justify-end gap-1.5">
                  {!compacta && (
                    <Link href={`/notas/${n.id}`} className="botao-mini">
                      Detalhes
                    </Link>
                  )}
                  {n.xmlNfse ? (
                    <>
                      <a href={`/notas/${n.id}/xml`} className="botao-mini" download>
                        XML
                      </a>
                      <a href={`/notas/${n.id}/pdf?download=1`} className="botao-mini" download>
                        PDF
                      </a>
                    </>
                  ) : (
                    <>
                      <span className="botao-mini-inativo" title="Nota sem NFS-e autorizada">
                        XML
                      </span>
                      <span className="botao-mini-inativo" title="Nota sem NFS-e autorizada">
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
    </div>
  );
}
