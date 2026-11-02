"use client";

import { useActionState, useState } from "react";
import { formatarMoeda, lerValor } from "@/lib/nfse/formatos";
import { emitirAction } from "./actions";

interface ClienteOpcao {
  id: number;
  nome: string;
  servicoId: number | null;
  valorPadrao: string | null;
}

interface PerfilOpcao {
  id: number;
  nome: string;
  moeda: string | null;
}

const paraCampo = (v: string | null) => (v ? Number(v).toFixed(2).replace(".", ",") : "");

function rotuloEmitir(valor: string, moeda?: string | null) {
  const numero = lerValor(valor);
  if (!(numero > 0)) return "Emitir NFS-e";
  return `Emitir NFS-e de ${moeda ? `${moeda} ${numero.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : formatarMoeda(numero)}`;
}

export function FormEmitir({ clientes, perfis, hoje }: { clientes: ClienteOpcao[]; perfis: PerfilOpcao[]; hoje: string }) {
  const [estado, acao, enviando] = useActionState(emitirAction, {});
  const unico = clientes.length === 1 ? clientes[0] : undefined;
  const [clienteId, setClienteId] = useState(unico ? String(unico.id) : "");
  const [valor, setValor] = useState(paraCampo(unico?.valorPadrao ?? null));
  const perfilPadrao = (c?: ClienteOpcao) => String(c?.servicoId ?? (perfis.length === 1 ? perfis[0].id : ""));
  const [servicoId, setServicoId] = useState(perfilPadrao(unico));
  const moeda = perfis.find((p) => String(p.id) === servicoId)?.moeda;

  return (
    <form action={acao} className="space-y-5">
      <div>
        <label className="rotulo" htmlFor="clienteId">
          Cliente
        </label>
        <select
          id="clienteId"
          name="clienteId"
          required
          className="campo"
          value={clienteId}
          onChange={(e) => {
            setClienteId(e.target.value);
            const c = clientes.find((c) => String(c.id) === e.target.value);
            setServicoId(perfilPadrao(c));
            setValor(paraCampo(c?.valorPadrao ?? null));
          }}
        >
          <option value="" disabled>
            Selecione…
          </option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="rotulo" htmlFor="valor">
          Valor ({moeda ?? "R$"})
        </label>
        <input
          id="valor"
          name="valor"
          required
          inputMode="decimal"
          placeholder="0,00"
          className="campo text-lg tabular-nums"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
        {moeda && <p className="ajuda">Convertido para reais pela PTAX de {moeda} da data de competência.</p>}
      </div>

      <details className="rounded-lg border border-borda px-4 py-3 text-sm">
        <summary className="cursor-pointer text-texto-3">Opções (competência, perfil, descrição{moeda ? ", cotação" : ""})</summary>
        <div className="mt-4 space-y-4">
          <div className="grid gap-4">
            <div>
              <label className="rotulo" htmlFor="competencia">
                Competência
              </label>
              <input id="competencia" name="competencia" type="date" defaultValue={hoje} className="campo" />
            </div>
            {moeda && (
              <div>
                <label className="rotulo" htmlFor="cotacao">
                  Cotação manual
                </label>
                <input id="cotacao" name="cotacao" inputMode="decimal" className="campo" placeholder="PTAX automática" />
              </div>
            )}
          </div>
          <div>
            <label className="rotulo" htmlFor="servicoId">
              Perfil de serviço
            </label>
            <select id="servicoId" name="servicoId" className="campo" value={servicoId} onChange={(e) => setServicoId(e.target.value)}>
              <option value="">Do cliente</option>
              {perfis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="rotulo" htmlFor="descricao">
              Descrição do serviço
            </label>
            <textarea id="descricao" name="descricao" rows={3} className="campo" placeholder="Em branco = descrição padrão (perfil ou cliente)" />
          </div>
        </div>
      </details>

      {estado.erro && <p role="alert" className="alerta-erro">{estado.erro}</p>}

      <button className="botao w-full py-3 text-base" disabled={enviando}>
        {enviando ? "Emitindo…" : rotuloEmitir(valor, moeda)}
      </button>
    </form>
  );
}
