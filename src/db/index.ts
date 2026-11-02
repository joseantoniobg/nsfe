import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Reaproveita a conexão entre recargas do dev server.
const globalParaDb = globalThis as unknown as { conexao?: ReturnType<typeof postgres> };
const conexao = globalParaDb.conexao ?? postgres(process.env.DATABASE_URL!);
if (process.env.NODE_ENV !== "production") globalParaDb.conexao = conexao;

export const db = drizzle(conexao, { schema });
export { schema };
