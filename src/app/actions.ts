"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { clientes, emitente, notas, servicos, type ComercioExterior } from "@/db/schema";
import { consultarCnpj, type DadosCnpj } from "@/lib/cnpj";
import { importarXmls, type ResultadoImportacao } from "@/lib/importacao";
import { cancelarNota, emitirNota, reprocessarNota } from "@/lib/notas";
import { lerValor, normalizarDocumento, somenteDigitos } from "@/lib/nfse/formatos";

export interface EstadoForm {
  erro?: string;
  ok?: string;
}

const textoOuNulo = (f: FormData, nome: string) => {
  const v = String(f.get(nome) ?? "").trim();
  return v === "" ? null : v;
};

// ---------- Emissão ----------

export async function emitirAction(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  let id: number;
  try {
    const nota = await emitirNota({
      clienteId: Number(form.get("clienteId")),
      valor: lerValor(String(form.get("valor") ?? "")),
      servicoId: Number(form.get("servicoId")) || undefined,
      cotacao: textoOuNulo(form, "cotacao") ? Number(String(form.get("cotacao")).replace(",", ".")) : undefined,
      valorRecebido: lerValor(String(form.get("valorRecebido") ?? "")) || undefined,
      descricao: textoOuNulo(form, "descricao") ?? undefined,
      competencia: textoOuNulo(form, "competencia") ?? undefined,
    });
    id = nota.id;
  } catch (e) {
    return { erro: (e as Error).message };
  }
  redirect(`/notas/${id}`);
}

export async function reprocessarAction(id: number): Promise<EstadoForm> {
  try {
    const nota = await reprocessarNota(id);
    refresh();
    return nota.status === "emitida" ? { ok: "NFS-e localizada/emitida." } : { erro: "A nota continua pendente. Veja as mensagens." };
  } catch (e) {
    return { erro: (e as Error).message };
  }
}

export async function salvarValorRecebidoAction(id: number, _: EstadoForm, form: FormData): Promise<EstadoForm> {
  const texto = textoOuNulo(form, "valorRecebido");
  const valor = texto ? lerValor(texto) : null;
  if (valor !== null && !(valor > 0)) return { erro: "Informe um valor maior que zero (ou deixe em branco)." };
  await db
    .update(notas)
    .set({ valorRecebido: valor?.toFixed(2) ?? null })
    .where(eq(notas.id, id));
  refresh();
  return { ok: "Valor recebido salvo." };
}

export async function cancelarAction(id: number, _: EstadoForm, form: FormData): Promise<EstadoForm> {
  try {
    const motivo = String(form.get("codigoMotivo")) as "1" | "2" | "9";
    await cancelarNota(id, motivo, String(form.get("motivo") ?? ""));
    refresh();
    return { ok: "Nota cancelada." };
  } catch (e) {
    return { erro: (e as Error).message };
  }
}

// ---------- Clientes ----------

export async function consultarCnpjAction(cnpj: string): Promise<{ dados?: DadosCnpj; erro?: string }> {
  try {
    return { dados: await consultarCnpj(cnpj) };
  } catch (e) {
    return { erro: (e as Error).message };
  }
}

export async function salvarClienteAction(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const id = Number(form.get("id")) || null;
  const pais = (textoOuNulo(form, "pais") ?? "BR").toUpperCase();
  const estrangeiro = pais !== "BR";
  const documento = estrangeiro ? String(form.get("documento") ?? "").trim() : normalizarDocumento(String(form.get("documento") ?? ""));
  const nome = textoOuNulo(form, "nome");
  if (!/^[A-Z]{2}$/.test(pais)) return { erro: "País deve ser o código ISO de 2 letras (ex.: BR, US)." };
  if (!estrangeiro && !(documento.length === 11 || documento.length === 14)) return { erro: "Informe um CPF ou CNPJ válido." };
  if (estrangeiro && !documento) return { erro: "Informe o NIF (identificação fiscal no país do cliente)." };
  if (!nome) return { erro: "Informe o nome do cliente." };
  const valorPadrao = textoOuNulo(form, "valorPadrao");

  const dados = {
    documento,
    nome,
    pais,
    email: textoOuNulo(form, "email"),
    fone: textoOuNulo(form, "fone"),
    codMunicipio: estrangeiro ? null : textoOuNulo(form, "codMunicipio"),
    cep: estrangeiro ? null : somenteDigitos(textoOuNulo(form, "cep")) || null,
    codigoPostal: estrangeiro ? textoOuNulo(form, "codigoPostal") : null,
    cidade: estrangeiro ? textoOuNulo(form, "cidade") : null,
    estadoProvincia: estrangeiro ? textoOuNulo(form, "estadoProvincia") : null,
    logradouro: textoOuNulo(form, "logradouro"),
    numero: textoOuNulo(form, "numero"),
    complemento: textoOuNulo(form, "complemento"),
    bairro: textoOuNulo(form, "bairro"),
    servicoId: Number(form.get("servicoId")) || null,
    descricao: textoOuNulo(form, "descricao"),
    valorPadrao: valorPadrao ? lerValor(valorPadrao).toFixed(2) : null,
  };
  try {
    if (id) await db.update(clientes).set(dados).where(eq(clientes.id, id));
    else await db.insert(clientes).values(dados);
  } catch (e) {
    const msg = (e as Error).message;
    return { erro: msg.includes("clientes_documento_idx") ? "Já existe um cliente com esse documento." : msg };
  }
  redirect("/clientes");
}

export async function alternarClienteAtivoAction(id: number, ativo: boolean) {
  await db.update(clientes).set({ ativo }).where(eq(clientes.id, id));
  refresh();
}

// ---------- Configuração ----------

const obrigatorio = (form: FormData, nome: string, rotulo: string) => {
  const v = textoOuNulo(form, nome);
  if (!v) throw new Error(`Preencha: ${rotulo}`);
  return v;
};

export async function salvarEmitenteAction(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  try {
    const opSimpNac = obrigatorio(form, "opSimpNac", "situação no Simples Nacional");
    const dados = {
      cnpj: normalizarDocumento(obrigatorio(form, "cnpj", "CNPJ")),
      razaoSocial: obrigatorio(form, "razaoSocial", "razão social"),
      inscricaoMunicipal: textoOuNulo(form, "inscricaoMunicipal"),
      codMunicipio: somenteDigitos(obrigatorio(form, "codMunicipio", "código IBGE do município")),
      fone: textoOuNulo(form, "fone"),
      email: textoOuNulo(form, "email"),
      opSimpNac,
      regApTribSN: opSimpNac === "3" ? (textoOuNulo(form, "regApTribSN") ?? "1") : null,
      regEspTrib: textoOuNulo(form, "regEspTrib") ?? "0",
      serie: somenteDigitos(obrigatorio(form, "serie", "série")),
      proximoNumero: Number(obrigatorio(form, "proximoNumero", "próximo número")),
      atualizadoEm: new Date(),
    };
    if (dados.codMunicipio.length !== 7) throw new Error("O código do município deve ter 7 dígitos (IBGE).");
    if (!(dados.proximoNumero >= 1)) throw new Error("Próximo número inválido.");
    await db.insert(emitente).values({ id: 1, ...dados }).onConflictDoUpdate({ target: emitente.id, set: dados });
  } catch (e) {
    return { erro: (e as Error).message };
  }
  refresh();
  return { ok: "Dados da empresa salvos." };
}

export async function salvarServicoAction(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const id = Number(form.get("id")) || null;
  try {
    const decimalOuNulo = (nome: string) => {
      const v = textoOuNulo(form, nome);
      return v ? lerValor(v).toFixed(2) : null;
    };
    const exportacao = form.get("exportacao") === "on";
    const comExt: ComercioExterior | null = exportacao
      ? {
          mdPrestacao: textoOuNulo(form, "mdPrestacao") ?? "1",
          vincPrest: textoOuNulo(form, "vincPrest") ?? "0",
          tpMoeda: somenteDigitos(obrigatorio(form, "tpMoeda", "código da moeda")),
          mecAFComexP: textoOuNulo(form, "mecAFComexP") ?? "01",
          mecAFComexT: textoOuNulo(form, "mecAFComexT") ?? "01",
          movTempBens: textoOuNulo(form, "movTempBens") ?? "1",
          mdic: textoOuNulo(form, "mdic") ?? "0",
          moeda: obrigatorio(form, "moeda", "moeda (sigla)").toUpperCase(),
          cotacao: textoOuNulo(form, "tipoCotacao") === "venda" ? "venda" : "compra",
          casasCotacao: Number(textoOuNulo(form, "casasCotacao") ?? 2),
        }
      : null;
    const dados = {
      nome: obrigatorio(form, "nome", "nome do perfil"),
      cLocPrestacao: somenteDigitos(textoOuNulo(form, "cLocPrestacao")) || null,
      cTribNac: somenteDigitos(obrigatorio(form, "cTribNac", "código de tributação nacional")),
      cTribMun: textoOuNulo(form, "cTribMun"),
      cNBS: somenteDigitos(textoOuNulo(form, "cNBS")) || null,
      descricaoPadrao: obrigatorio(form, "descricaoPadrao", "descrição padrão do serviço"),
      tribISSQN: exportacao ? "3" : (textoOuNulo(form, "tribISSQN") ?? "1"),
      tpRetISSQN: textoOuNulo(form, "tpRetISSQN") ?? "1",
      pAliq: decimalOuNulo("pAliq"),
      cstPisCofins: textoOuNulo(form, "cstPisCofins"),
      tpRetPisCofins: textoOuNulo(form, "cstPisCofins") ? (textoOuNulo(form, "tpRetPisCofins") ?? "0") : null,
      pTotTribSN: decimalOuNulo("pTotTribSN"),
      ibscbsAtivo: form.get("ibscbsAtivo") === "on",
      cIndOp: somenteDigitos(textoOuNulo(form, "cIndOp")) || null,
      cClassTrib: somenteDigitos(textoOuNulo(form, "cClassTrib")) || null,
      comExt,
    };
    if (dados.cTribNac.length !== 6) throw new Error("O código de tributação nacional deve ter 6 dígitos.");
    if (dados.cNBS && dados.cNBS.length !== 9) throw new Error("O código NBS deve ter 9 dígitos.");
    if (dados.ibscbsAtivo && dados.cClassTrib && !dados.cNBS) throw new Error("Informe o código NBS: é obrigatório quando o grupo IBS/CBS é enviado.");
    if (dados.ibscbsAtivo && dados.cClassTrib && !dados.cIndOp) throw new Error("Informe o cIndOp: o leiaute em produção exige esse campo quando o grupo IBS/CBS é enviado.");
    if (dados.cLocPrestacao && dados.cLocPrestacao.length !== 7) throw new Error("O município da prestação deve ter 7 dígitos (IBGE).");
    if (dados.ibscbsAtivo && (dados.cClassTrib?.length !== 6 || (dados.cIndOp && dados.cIndOp.length !== 6))) {
      throw new Error("cClassTrib e cIndOp devem ter 6 dígitos.");
    }
    if (id) await db.update(servicos).set(dados).where(eq(servicos.id, id));
    else await db.insert(servicos).values(dados);
  } catch (e) {
    return { erro: (e as Error).message };
  }
  redirect("/configuracao");
}

export async function importarXmlsAction(_: ResultadoImportacao | { erro: string } | null, form: FormData) {
  const arquivos = form.getAll("arquivos").filter((a): a is File => a instanceof File && a.size > 0);
  if (!arquivos.length) return { erro: "Selecione ao menos um XML." };
  try {
    const resultado = await importarXmls(await Promise.all(arquivos.map(async (a) => ({ nome: a.name, conteudo: await a.text() }))));
    refresh();
    return resultado;
  } catch (e) {
    return { erro: (e as Error).message };
  }
}
