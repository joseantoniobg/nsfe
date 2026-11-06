"use client";

import { useActionState, useState, useTransition } from "react";
import { cancelarAction, reprocessarAction, salvarValorRecebidoAction, type EstadoForm } from "../../actions";

export function Reprocessar({ id }: { id: number }) {
  const [pendente, iniciar] = useTransition();
  const [estado, setEstado] = useState<EstadoForm>({});
  return (
    <div className="space-y-2">
      <button className="botao" disabled={pendente} onClick={() => iniciar(async () => setEstado(await reprocessarAction(id)))}>
        {pendente ? "Consultando…" : "Verificar na Sefin / reenviar"}
      </button>
      {estado.erro && <p role="alert" className="text-sm text-erro">{estado.erro}</p>}
      {estado.ok && <p role="status" className="text-sm text-sucesso">{estado.ok}</p>}
    </div>
  );
}

/** Exportação: reais que de fato entraram, que podem diferir do valor da nota pela variação do câmbio. */
export function ValorRecebido({ id, valor }: { id: number; valor: string | null }) {
  const [estado, acao, enviando] = useActionState(salvarValorRecebidoAction.bind(null, id), {});
  return (
    <form action={acao} className="space-y-1">
      <div className="flex max-w-xs gap-2">
        <input
          name="valorRecebido"
          inputMode="decimal"
          placeholder="Não informado"
          aria-label="Valor recebido em reais"
          className="campo tabular-nums"
          defaultValue={valor ? Number(valor).toFixed(2).replace(".", ",") : ""}
        />
        <button className="botao-secundario shrink-0" disabled={enviando}>
          {enviando ? "Salvando…" : "Salvar"}
        </button>
      </div>
      {estado.erro && <p role="alert" className="text-sm text-erro">{estado.erro}</p>}
      {estado.ok && <p role="status" className="text-sm text-sucesso">{estado.ok}</p>}
    </form>
  );
}

export function Cancelar({ id }: { id: number }) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao, enviando] = useActionState(cancelarAction.bind(null, id), {});

  if (!aberto) {
    return (
      <button className="botao-secundario text-erro" onClick={() => setAberto(true)}>
        Cancelar nota…
      </button>
    );
  }
  return (
    <form action={acao} className="w-full space-y-3 rounded-lg border border-erro/30 bg-erro-fundo p-4">
      <div>
        <label className="rotulo" htmlFor="codigoMotivo">
          Motivo
        </label>
        <select id="codigoMotivo" name="codigoMotivo" className="campo" defaultValue="1">
          <option value="1">Erro na emissão</option>
          <option value="2">Serviço não prestado</option>
          <option value="9">Outros</option>
        </select>
      </div>
      <div>
        <label className="rotulo" htmlFor="motivo">
          Justificativa (mín. 15 caracteres)
        </label>
        <textarea id="motivo" name="motivo" required minLength={15} rows={2} className="campo" />
      </div>
      {estado.erro && <p role="alert" className="whitespace-pre-line text-sm text-erro">{estado.erro}</p>}
      <div className="flex gap-2">
        <button className="botao-perigo" disabled={enviando}>
          {enviando ? "Cancelando…" : "Confirmar cancelamento"}
        </button>
        <button type="button" className="botao-secundario" onClick={() => setAberto(false)}>
          Voltar
        </button>
      </div>
    </form>
  );
}
