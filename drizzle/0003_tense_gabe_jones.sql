CREATE TYPE "public"."origem_nota" AS ENUM('sistema', 'importada');--> statement-breakpoint
ALTER TABLE "emitente" ADD COLUMN "ultimo_nsu_adn" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notas" ADD COLUMN "origem" "origem_nota" DEFAULT 'sistema' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notas_chave_acesso_idx" ON "notas" USING btree ("chave_acesso");