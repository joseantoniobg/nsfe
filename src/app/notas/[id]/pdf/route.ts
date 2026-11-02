import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notas } from "@/db/schema";
import { gerarDanfse } from "@/lib/nfse/danfse";

export async function GET(req: Request, ctx: RouteContext<"/notas/[id]/pdf">) {
  const { id } = await ctx.params;
  const nota = await db.query.notas.findFirst({ where: eq(notas.id, Number(id)) });
  if (!nota?.xmlNfse) return new Response("NFS-e não encontrada", { status: 404 });

  const pdf = await gerarDanfse(nota.xmlNfse, { cancelada: nota.status === "cancelada" });
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // ?download=1 baixa o arquivo em vez de abrir no navegador.
      "Content-Disposition": `${new URL(req.url).searchParams.has("download") ? "attachment" : "inline"}; filename="nfse-${nota.numeroNfse ?? nota.id}.pdf"`,
    },
  });
}
