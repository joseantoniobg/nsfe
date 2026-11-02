CREATE TABLE "servicos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"c_loc_prestacao" text,
	"c_trib_nac" text NOT NULL,
	"c_trib_mun" text,
	"c_nbs" text,
	"descricao_padrao" text NOT NULL,
	"trib_issqn" text DEFAULT '1' NOT NULL,
	"tp_ret_issqn" text DEFAULT '1' NOT NULL,
	"p_aliq" numeric(5, 2),
	"cst_pis_cofins" text,
	"tp_ret_pis_cofins" text,
	"p_tot_trib_sn" numeric(5, 2),
	"ibscbs_ativo" boolean DEFAULT true NOT NULL,
	"c_ind_op" text,
	"c_class_trib" text,
	"com_ext" jsonb,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "pais" text DEFAULT 'BR' NOT NULL;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "codigo_postal" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "cidade" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "estado_provincia" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "servico_id" integer;--> statement-breakpoint
ALTER TABLE "notas" ADD COLUMN "servico_id" integer;--> statement-breakpoint
ALTER TABLE "notas" ADD COLUMN "moeda" text;--> statement-breakpoint
ALTER TABLE "notas" ADD COLUMN "valor_moeda" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "notas" ADD COLUMN "cotacao" numeric(12, 6);--> statement-breakpoint
ALTER TABLE "notas" ADD COLUMN "data_cotacao" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_servico_id_servicos_id_fk" FOREIGN KEY ("servico_id") REFERENCES "public"."servicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas" ADD CONSTRAINT "notas_servico_id_servicos_id_fk" FOREIGN KEY ("servico_id") REFERENCES "public"."servicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emitente" DROP COLUMN "c_trib_nac";--> statement-breakpoint
ALTER TABLE "emitente" DROP COLUMN "c_trib_mun";--> statement-breakpoint
ALTER TABLE "emitente" DROP COLUMN "c_nbs";--> statement-breakpoint
ALTER TABLE "emitente" DROP COLUMN "descricao_padrao";--> statement-breakpoint
ALTER TABLE "emitente" DROP COLUMN "trib_issqn";--> statement-breakpoint
ALTER TABLE "emitente" DROP COLUMN "tp_ret_issqn";--> statement-breakpoint
ALTER TABLE "emitente" DROP COLUMN "p_aliq";--> statement-breakpoint
ALTER TABLE "emitente" DROP COLUMN "p_tot_trib_sn";--> statement-breakpoint
ALTER TABLE "emitente" DROP COLUMN "ibscbs_ativo";--> statement-breakpoint
ALTER TABLE "emitente" DROP COLUMN "c_ind_op";--> statement-breakpoint
ALTER TABLE "emitente" DROP COLUMN "c_class_trib";