import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { StatusNota } from "@/components/status-nota";
import { Voltar } from "@/components/voltar";
import { db } from "@/db";
import { notas } from "@/db/schema";
import { formatarDocumento, formatarMoeda } from "@/lib/nfse/formatos";
import { Cancelar, Reprocessar, ValorRecebido } from "./acoes-nota";

async function Detalhe({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const nota = await db.query.notas.findFirst({ where: eq(notas.id, Number(id)), with: { cliente: true } });
  if (!nota) notFound();

  const linhas: [string, React.ReactNode][] = [
    ["Cliente", `${nota.cliente.nome} (${nota.cliente.pais === "BR" ? formatarDocumento(nota.cliente.documento) : `NIF ${nota.cliente.documento}`})`],
    ["Valor", formatarMoeda(nota.valor)],
    ...(nota.valorMoeda
      ? ([
          [
            "Câmbio",
            `${nota.moeda} ${Number(nota.valorMoeda).toLocaleString("en-US", { minimumFractionDigits: 2 })} × ${Number(nota.cotacao).toLocaleString("pt-BR", { maximumFractionDigits: 6 })} (PTAX ${nota.dataCotacao?.split("-").reverse().join("/")})`,
          ],
          ["Valor recebido (R$)", <ValorRecebido key="recebido" id={nota.id} valor={nota.valorRecebido} />],
        ] as [string, React.ReactNode][])
      : []),
    ["Competência", nota.competencia.split("-").reverse().join("/")],
    ["DPS", `série ${nota.serie}, nº ${nota.numeroDps}`],
    ["Ambiente", nota.ambiente === "1" ? "Produção" : "Produção restrita (sem valor fiscal)"],
    ["Chave de acesso", nota.chaveAcesso ? <code className="break-all text-xs">{nota.chaveAcesso}</code> : "-"],
  ];

  return (
    <div className="cartao space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{nota.numeroNfse ? `NFS-e nº ${nota.numeroNfse}` : `DPS nº ${nota.numeroDps}`}</h1>
        <StatusNota status={nota.status} />
      </div>

      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[160px_1fr]">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo} className="contents">
            <dt className="text-texto-3">{rotulo}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
        <dt className="text-texto-3">Descrição</dt>
        <dd className="whitespace-pre-line">{nota.descricao}</dd>
      </dl>

      {nota.mensagens?.length ? (
        <div className={`rounded-lg p-4 text-sm ${nota.status === "emitida" ? "bg-aviso-fundo text-aviso" : "bg-erro-fundo text-erro"}`}>
          <p className="mb-2 font-medium">{nota.status === "emitida" ? "Alertas da Sefin" : "Mensagens da Sefin"}</p>
          <ul className="list-disc space-y-1 pl-5">
            {nota.mensagens.map((m, i) => (
              <li key={i}>
                {m.codigo && <strong>{m.codigo}: </strong>}
                {m.descricao}
                {m.complemento && <span className="text-texto-3"> — {m.complemento}</span>}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-3">
        {nota.xmlNfse && (
          <>
            <a className="botao" href={`/notas/${nota.id}/pdf`} target="_blank">
              Abrir PDF
            </a>
            <a className="botao-secundario" href={`/notas/${nota.id}/xml`}>
              Baixar XML
            </a>
          </>
        )}
        {!nota.xmlNfse && nota.xmlDps && (
          <a className="botao-secundario" href={`/notas/${nota.id}/xml`}>
            Baixar XML da DPS
          </a>
        )}
        {nota.status === "erro" && <Reprocessar id={nota.id} />}
        {nota.status === "emitida" && <Cancelar id={nota.id} />}
      </div>
    </div>
  );
}

export default function Page(props: PageProps<"/notas/[id]">) {
  return (
    <>
      <Voltar href="/notas" rotulo="Notas" />
      <Suspense fallback={<p className="text-sm text-texto-3">Carregando…</p>}>
        <Detalhe params={props.params} />
      </Suspense>
    </>
  );
}
