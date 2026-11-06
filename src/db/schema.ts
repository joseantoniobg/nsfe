import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, numeric, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/** Dados do prestador. Tabela de linha única (id = 1). */
export const emitente = pgTable("emitente", {
  id: integer("id").primaryKey().default(1),
  cnpj: text("cnpj").notNull(),
  razaoSocial: text("razao_social").notNull(),
  inscricaoMunicipal: text("inscricao_municipal"),
  codMunicipio: text("cod_municipio").notNull(), // IBGE, 7 dígitos
  fone: text("fone"),
  email: text("email"),

  // Regime tributário (prest/regTrib)
  opSimpNac: text("op_simp_nac").notNull().default("3"), // 3 = ME/EPP
  regApTribSN: text("reg_ap_trib_sn").default("1"), // 1 = federais e municipal pelo SN
  regEspTrib: text("reg_esp_trib").notNull().default("0"),

  serie: text("serie").notNull().default("1"),
  proximoNumero: integer("proximo_numero").notNull().default(1),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

/** Dados do grupo serv/comExt, para exportação de serviços. */
export interface ComercioExterior {
  mdPrestacao: string; // 1 = transfronteiriço
  vincPrest: string; // 0 = sem vínculo com o tomador
  tpMoeda: string; // código numérico da moeda (o Emissor Nacional usa 840 para USD)
  mecAFComexP: string;
  mecAFComexT: string;
  movTempBens: string;
  mdic: string;
  moeda: string; // ISO 4217 para a cotação PTAX, ex.: "USD"
  cotacao: "compra" | "venda"; // qual PTAX usar
  casasCotacao: number; // a cotação é truncada nessa quantidade de casas decimais
}

/**
 * Perfil fiscal de um serviço: tudo que se repete nas notas de um mesmo tipo de serviço.
 * Cada cliente aponta para um perfil (ex.: suporte no Brasil x desenvolvimento exportado).
 */
export const servicos = pgTable("servicos", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),

  // serv/locPrest: município da prestação; vazio = município do prestador
  cLocPrestacao: text("c_loc_prestacao"),

  // serv/cServ
  cTribNac: text("c_trib_nac").notNull(), // 6 dígitos: item + subitem + desdobro
  cTribMun: text("c_trib_mun"),
  cNBS: text("c_nbs"),
  descricaoPadrao: text("descricao_padrao").notNull(),

  // valores/trib/tribMun
  tribISSQN: text("trib_issqn").notNull().default("1"), // 3 = exportação
  tpRetISSQN: text("tp_ret_issqn").notNull().default("1"),
  pAliq: numeric("p_aliq", { precision: 5, scale: 2 }),

  // valores/trib/tribFed/piscofins (o Emissor Nacional envia CST 00 para o Simples)
  cstPisCofins: text("cst_pis_cofins"),
  tpRetPisCofins: text("tp_ret_pis_cofins"),

  // valores/trib/totTrib: pTotTribSN (% do Simples) ou indTotTrib=0
  pTotTribSN: numeric("p_tot_trib_sn", { precision: 5, scale: 2 }),

  // Reforma tributária (grupo IBSCBS)
  ibscbsAtivo: boolean("ibscbs_ativo").notNull().default(true),
  cIndOp: text("c_ind_op"),
  cClassTrib: text("c_class_trib"),

  // Preenchido = exportação de serviço (valor digitado na moeda estrangeira)
  comExt: jsonb("com_ext").$type<ComercioExterior>(),

  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const clientes = pgTable(
  "clientes",
  {
    id: serial("id").primaryKey(),
    documento: text("documento").notNull(), // CPF/CNPJ (só dígitos/letras) ou NIF, se estrangeiro
    nome: text("nome").notNull(),
    email: text("email"),
    fone: text("fone"),
    pais: text("pais").notNull().default("BR"), // ISO 3166 alfa-2
    // Endereço nacional
    codMunicipio: text("cod_municipio"),
    cep: text("cep"),
    // Endereço no exterior
    codigoPostal: text("codigo_postal"),
    cidade: text("cidade"),
    estadoProvincia: text("estado_provincia"),
    // Comuns
    logradouro: text("logradouro"),
    numero: text("numero"),
    complemento: text("complemento"),
    bairro: text("bairro"),
    servicoId: integer("servico_id").references(() => servicos.id),
    descricao: text("descricao"), // sobrescreve a descrição padrão do perfil, se preenchida
    valorPadrao: numeric("valor_padrao", { precision: 15, scale: 2 }), // na moeda do perfil
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("clientes_documento_idx").on(t.documento)],
);

export const statusNota = pgEnum("status_nota", ["processando", "emitida", "rejeitada", "erro", "cancelada"]);

export const notas = pgTable(
  "notas",
  {
    id: serial("id").primaryKey(),
    clienteId: integer("cliente_id")
      .notNull()
      .references(() => clientes.id),
    servicoId: integer("servico_id").references(() => servicos.id),
    valor: numeric("valor", { precision: 15, scale: 2 }).notNull(), // em reais
    // Exportação: valor na moeda estrangeira e cotação usada na conversão
    moeda: text("moeda"),
    valorMoeda: numeric("valor_moeda", { precision: 15, scale: 2 }),
    cotacao: numeric("cotacao", { precision: 12, scale: 6 }),
    dataCotacao: text("data_cotacao"),
    // Exportação: quanto de fato entrou em reais (câmbio do recebimento); usado no caixa
    valorRecebido: numeric("valor_recebido", { precision: 15, scale: 2 }),
    descricao: text("descricao").notNull(),
    competencia: text("competencia").notNull(), // AAAA-MM-DD
    ambiente: text("ambiente").notNull(), // 1 produção, 2 produção restrita
    serie: text("serie").notNull(),
    numeroDps: integer("numero_dps").notNull(),
    idDps: text("id_dps").notNull(),
    status: statusNota("status").notNull().default("processando"),
    chaveAcesso: text("chave_acesso"),
    numeroNfse: text("numero_nfse"),
    xmlDps: text("xml_dps"),
    xmlNfse: text("xml_nfse"),
    xmlCancelamento: text("xml_cancelamento"),
    mensagens: jsonb("mensagens").$type<{ codigo?: string; descricao: string; complemento?: string }[]>(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    emitidaEm: timestamp("emitida_em", { withTimezone: true }),
  },
  (t) => [uniqueIndex("notas_id_dps_idx").on(t.idDps)],
);

export const servicosRelations = relations(servicos, ({ many }) => ({ clientes: many(clientes) }));
export const clientesRelations = relations(clientes, ({ many, one }) => ({
  notas: many(notas),
  servico: one(servicos, { fields: [clientes.servicoId], references: [servicos.id] }),
}));
export const notasRelations = relations(notas, ({ one }) => ({
  cliente: one(clientes, { fields: [notas.clienteId], references: [clientes.id] }),
  servico: one(servicos, { fields: [notas.servicoId], references: [servicos.id] }),
}));

export type Emitente = typeof emitente.$inferSelect;
export type Servico = typeof servicos.$inferSelect;
export type Cliente = typeof clientes.$inferSelect;
export type Nota = typeof notas.$inferSelect;
