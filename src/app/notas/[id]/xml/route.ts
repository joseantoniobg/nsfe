import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notas } from "@/db/schema";

export async function GET(_: Request, ctx: RouteContext<"/notas/[id]/xml">) {
  const { id } = await ctx.params;
  const nota = await db.query.notas.findFirst({ where: eq(notas.id, Number(id)) });
  const xml = nota?.xmlNfse ?? nota?.xmlDps;
  if (!nota || !xml) return new Response("Nota não encontrada", { status: 404 });

  const nome = nota.xmlNfse ? `nfse-${nota.chaveAcesso}.xml` : `${nota.idDps}.xml`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
    },
  });
}
