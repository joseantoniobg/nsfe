CREATE TYPE "public"."status_nota" AS ENUM('processando', 'emitida', 'rejeitada', 'erro', 'cancelada');--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" serial PRIMARY KEY NOT NULL,
	"documento" text NOT NULL,
	"nome" text NOT NULL,
	"email" text,
	"fone" text,
	"cod_municipio" text,
	"cep" text,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"descricao" text,
	"valor_padrao" numeric(15, 2),
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emitente" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"cnpj" text NOT NULL,
	"razao_social" text NOT NULL,
	"inscricao_municipal" text,
	"cod_municipio" text NOT NULL,
	"fone" text,
	"email" text,
	"op_simp_nac" text DEFAULT '3' NOT NULL,
	"reg_ap_trib_sn" text DEFAULT '1',
	"reg_esp_trib" text DEFAULT '0' NOT NULL,
	"c_trib_nac" text NOT NULL,
	"c_trib_mun" text,
	"c_nbs" text,
	"descricao_padrao" text NOT NULL,
	"trib_issqn" text DEFAULT '1' NOT NULL,
	"tp_ret_issqn" text DEFAULT '1' NOT NULL,
	"p_aliq" numeric(5, 2),
	"p_tot_trib_sn" numeric(5, 2),
	"ibscbs_ativo" boolean DEFAULT true NOT NULL,
	"c_ind_op" text,
	"c_class_trib" text,
	"serie" text DEFAULT '1' NOT NULL,
	"proximo_numero" integer DEFAULT 1 NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notas" (
	"id" serial PRIMARY KEY NOT NULL,
	"cliente_id" integer NOT NULL,
	"valor" numeric(15, 2) NOT NULL,
	"descricao" text NOT NULL,
	"competencia" text NOT NULL,
	"ambiente" text NOT NULL,
	"serie" text NOT NULL,
	"numero_dps" integer NOT NULL,
	"id_dps" text NOT NULL,
	"status" "status_nota" DEFAULT 'processando' NOT NULL,
	"chave_acesso" text,
	"numero_nfse" text,
	"xml_dps" text,
	"xml_nfse" text,
	"xml_cancelamento" text,
	"mensagens" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"emitida_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notas" ADD CONSTRAINT "notas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_documento_idx" ON "clientes" USING btree ("documento");--> statement-breakpoint
CREATE UNIQUE INDEX "notas_id_dps_idx" ON "notas" USING btree ("id_dps");