import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { TabelaNotas } from "@/components/tabela-notas";
import { db } from "@/db";
import { notas } from "@/db/schema";
import { formatarMoeda, hojeBrasilia } from "@/lib/nfse/formatos";

type Periodo = { de?: string; ate?: string };

const dataValida = (v: string | string[] | undefined) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** Atalhos de período a partir de hoje (Brasília). */
function atalhos(): [string, Periodo][] {
  const hoje = hojeBrasilia();
  const [ano, mes] = hoje.split("-").map(Number);
  const [anoAnt, mesAnt] = mes === 1 ? [ano - 1, 12] : [ano, mes - 1];
  const mm = (m: number) => String(m).padStart(2, "0");
  const ultimoDiaAnt = new Date(Date.UTC(anoAnt, mesAnt, 0)).getUTCDate();
  return [
    ["Este mês", { de: `${hoje.slice(0, 8)}01`, ate: hoje }],
    ["Mês anterior", { de: `${anoAnt}-${mm(mesAnt)}-01`, ate: `${anoAnt}-${mm(mesAnt)}-${ultimoDiaAnt}` }],
    ["Este ano", { de: `${ano}-01-01`, ate: hoje }],
    ["Tudo", {}],
  ];
}

const hrefPeriodo = ({ de, ate }: Periodo) => {
  const p = new URLSearchParams();
  if (de) p.set("de", de);
  if (ate) p.set("ate", ate);
  return p.size ? `/notas?${p}` : "/notas";
};

function Filtro({ de, ate }: Periodo) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <form method="get" className="flex flex-wrap items-end gap-3">
        <div>
          <label className="rotulo" htmlFor="de">
            Emitidas de
          </label>
          <input id="de" name="de" type="date" defaultValue={de} className="campo" />
        </div>
        <div>
          <label className="rotulo" htmlFor="ate">
            até
          </label>
          <input id="ate" name="ate" type="date" defaultValue={ate} className="campo" />
        </div>
        <button className="botao">Filtrar</button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {atalhos().map(([rotulo, periodo]) => (
          <Link key={rotulo} href={hrefPeriodo(periodo)} className="botao-mini">
            {rotulo}
          </Link>
        ))}
      </div>
    </div>
  );
}

async function Lista({ de, ate }: Periodo) {
  await connection();
  // Data de emissão no fuso de Brasília, para o filtro bater com a coluna "Data".
  const dia = sql`(${notas.criadoEm} at time zone 'America/Sao_Paulo')::date`;
  const filtros: SQL[] = [];
  if (de) filtros.push(sql`${dia} >= ${de}::date`);
  if (ate) filtros.push(sql`${dia} <= ${ate}::date`);

  const [lista, [totais]] = await Promise.all([
    db.query.notas.findMany({ where: and(...filtros), with: { cliente: true }, orderBy: desc(notas.id), limit: 500 }),
    // Caixa: só notas válidas de produção; nas de exportação vale o que de fato foi recebido.
    db
      .select({
        quantidade: sql<number>`count(*)::int`,
        notas: sql<string>`coalesce(sum(${notas.valor}), 0)`,
        caixa: sql<string>`coalesce(sum(coalesce(${notas.valorRecebido}, ${notas.valor})), 0)`,
        semRecebido: sql<number>`(count(*) filter (where ${notas.moeda} is not null and ${notas.valorRecebido} is null))::int`,
      })
      .from(notas)
      .where(and(eq(notas.status, "emitida"), eq(notas.ambiente, "1"), ...filtros)),
  ]);

  return (
    <>
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-borda px-4 py-3">
          <p className="text-sm text-texto-3">Recebido (caixa)</p>
          <p className="text-2xl font-semibold tabular-nums">{formatarMoeda(totais.caixa)}</p>
          <p className="ajuda">
            {totais.quantidade} {totais.quantidade === 1 ? "nota emitida" : "notas emitidas"} em produção
            {totais.semRecebido > 0 &&
              ` · ${totais.semRecebido} de exportação sem valor recebido (somada${totais.semRecebido === 1 ? "" : "s"} pelo valor da nota)`}
          </p>
        </div>
        <div className="rounded-lg border border-borda px-4 py-3">
          <p className="text-sm text-texto-3">Valor das notas</p>
          <p className="text-2xl font-semibold tabular-nums">{formatarMoeda(totais.notas)}</p>
          <p className="ajuda">Valor fiscal (exportação convertida pela PTAX)</p>
        </div>
      </div>
      <TabelaNotas notas={lista} />
    </>
  );
}

export default async function Page(props: PageProps<"/notas">) {
  const busca = await props.searchParams;
  const periodo = { de: dataValida(busca.de), ate: dataValida(busca.ate) };
  return (
    <div className="cartao">
      <h1 className="mb-4 text-lg font-semibold">Notas</h1>
      <Filtro {...periodo} />
      <Suspense key={hrefPeriodo(periodo)} fallback={<p className="text-sm text-texto-3">Carregando…</p>}>
        <Lista {...periodo} />
      </Suspense>
    </div>
  );
}
