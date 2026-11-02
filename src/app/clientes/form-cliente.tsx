"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import type { Cliente } from "@/db/schema";
import { consultarCnpjAction, salvarClienteAction } from "../actions";

type Campos = Record<
  | "documento"
  | "nome"
  | "email"
  | "fone"
  | "pais"
  | "codMunicipio"
  | "cep"
  | "codigoPostal"
  | "cidade"
  | "estadoProvincia"
  | "logradouro"
  | "numero"
  | "complemento"
  | "bairro",
  string
>;

const iniciais = (c?: Cliente): Campos => ({
  documento: c?.documento ?? "",
  nome: c?.nome ?? "",
  email: c?.email ?? "",
  fone: c?.fone ?? "",
  pais: c?.pais ?? "BR",
  codMunicipio: c?.codMunicipio ?? "",
  cep: c?.cep ?? "",
  codigoPostal: c?.codigoPostal ?? "",
  cidade: c?.cidade ?? "",
  estadoProvincia: c?.estadoProvincia ?? "",
  logradouro: c?.logradouro ?? "",
  numero: c?.numero ?? "",
  complemento: c?.complemento ?? "",
  bairro: c?.bairro ?? "",
});

export interface PerfilOpcao {
  id: number;
  nome: string;
  moeda: string | null;
}

export function FormCliente({ cliente, perfis }: { cliente?: Cliente; perfis: PerfilOpcao[] }) {
  const [estado, acao, salvando] = useActionState(salvarClienteAction, {});
  const [campos, setCampos] = useState<Campos>(iniciais(cliente));
  const [servicoId, setServicoId] = useState(String(cliente?.servicoId ?? (perfis.length === 1 ? perfis[0].id : "")));
  const [buscando, iniciarBusca] = useTransition();
  const [erroBusca, setErroBusca] = useState<string>();
  const ultimoBuscado = useRef("");
  const estrangeiro = campos.pais.toUpperCase() !== "BR";
  const moeda = perfis.find((p) => String(p.id) === servicoId)?.moeda ?? "R$";

  const alterar = (nome: keyof Campos) => (e: React.ChangeEvent<HTMLInputElement>) => setCampos((c) => ({ ...c, [nome]: e.target.value }));

  const buscarCnpj = () => {
    const doc = campos.documento.replace(/[^0-9A-Za-z]/g, "");
    if (estrangeiro || doc.length !== 14 || doc === ultimoBuscado.current) return;
    ultimoBuscado.current = doc;
    iniciarBusca(async () => {
      const r = await consultarCnpjAction(doc);
      setErroBusca(r.erro);
      if (r.dados) {
        const d = r.dados;
        setCampos((c) => ({
          ...c,
          nome: d.nome ?? c.nome,
          email: c.email || d.email || "",
          fone: c.fone || d.fone || "",
          codMunicipio: d.codMunicipio ?? c.codMunicipio,
          cep: d.cep ?? c.cep,
          logradouro: d.logradouro ?? c.logradouro,
          numero: d.numero ?? c.numero,
          complemento: d.complemento ?? c.complemento,
          bairro: d.bairro ?? c.bairro,
        }));
      }
    });
  };

  const input = (nome: keyof Campos, rotulo: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="rotulo" htmlFor={nome}>
        {rotulo}
      </label>
      <input id={nome} name={nome} className="campo" value={campos[nome]} onChange={alterar(nome)} {...extra} />
    </div>
  );

  return (
    <form action={acao} className="space-y-5">
      {cliente && <input type="hidden" name="id" value={cliente.id} />}
      <div className="grid gap-4 sm:grid-cols-[90px_220px_1fr]">
        {input("pais", "País", { required: true, maxLength: 2, pattern: "[A-Za-z]{2}", title: "Código ISO de 2 letras" })}
        <div>
          {input("documento", estrangeiro ? "NIF (tax ID)" : "CNPJ ou CPF", { required: true, onBlur: buscarCnpj, autoFocus: !cliente })}
          <p className="ajuda">{estrangeiro ? "Identificação fiscal no país do cliente" : buscando ? "Buscando dados do CNPJ…" : (erroBusca ?? "CNPJ preenche o resto sozinho.")}</p>
        </div>
        {input("nome", "Nome / razão social", { required: true })}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {input("email", "E-mail", { type: "email" })}
        {input("fone", "Telefone")}
      </div>

      <fieldset className="space-y-4 rounded-lg border border-zinc-200 p-4">
        <legend className="px-1 text-sm text-zinc-500">Endereço (opcional, enviado só se completo)</legend>
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          {input("logradouro", estrangeiro ? "Endereço (street)" : "Logradouro")}
          {input("numero", "Número")}
        </div>
        {estrangeiro ? (
          <div className="grid gap-4 sm:grid-cols-4">
            {input("cidade", "Cidade")}
            {input("estadoProvincia", "Estado / província")}
            {input("codigoPostal", "Código postal")}
            {input("bairro", "Bairro")}
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              {input("complemento", "Complemento")}
              {input("bairro", "Bairro")}
              {input("cep", "CEP")}
            </div>
            <div className="sm:w-1/3">{input("codMunicipio", "Código IBGE do município", { pattern: "\\d{7}" })}</div>
          </>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <div>
          <label className="rotulo" htmlFor="servicoId">
            Perfil de serviço
          </label>
          <select id="servicoId" name="servicoId" className="campo" value={servicoId} onChange={(e) => setServicoId(e.target.value)}>
            <option value="">Selecione…</option>
            {perfis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          <p className="ajuda">Define código do serviço, tributos e se é exportação.</p>
        </div>
        <div>
          <label className="rotulo" htmlFor="valorPadrao">
            Valor padrão ({moeda})
          </label>
          <input
            id="valorPadrao"
            name="valorPadrao"
            inputMode="decimal"
            className="campo"
            defaultValue={cliente?.valorPadrao ? Number(cliente.valorPadrao).toFixed(2).replace(".", ",") : ""}
          />
          <p className="ajuda">Pré-preenche o valor na emissão.</p>
        </div>
      </div>
      <div>
        <label className="rotulo" htmlFor="descricao">
          Descrição específica do serviço
        </label>
        <textarea id="descricao" name="descricao" rows={2} className="campo" defaultValue={cliente?.descricao ?? ""} />
        <p className="ajuda">Opcional. Substitui a descrição padrão do perfil para este cliente (aceita as mesmas variáveis).</p>
      </div>

      {estado.erro && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{estado.erro}</p>}
      <button className="botao" disabled={salvando}>
        {salvando ? "Salvando…" : "Salvar cliente"}
      </button>
    </form>
  );
}
