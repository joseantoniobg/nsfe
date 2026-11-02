"use client";

import { useActionState, useState, useTransition } from "react";
import { cancelarAction, reprocessarAction, type EstadoForm } from "../../actions";

export function Reprocessar({ id }: { id: number }) {
  const [pendente, iniciar] = useTransition();
  const [estado, setEstado] = useState<EstadoForm>({});
  return (
    <div className="space-y-2">
      <button className="botao" disabled={pendente} onClick={() => iniciar(async () => setEstado(await reprocessarAction(id)))}>
        {pendente ? "Consultando…" : "Verificar na Sefin / reenviar"}
      </button>
      {estado.erro && <p className="text-sm text-red-700">{estado.erro}</p>}
      {estado.ok && <p className="text-sm text-emerald-700">{estado.ok}</p>}
    </div>
  );
}

export function Cancelar({ id }: { id: number }) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao, enviando] = useActionState(cancelarAction.bind(null, id), {});

  if (!aberto) {
    return (
      <button className="botao-secundario text-red-700" onClick={() => setAberto(true)}>
        Cancelar nota…
      </button>
    );
  }
  return (
    <form action={acao} className="w-full space-y-3 rounded-lg border border-red-200 bg-red-50/50 p-4">
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
      {estado.erro && <p className="whitespace-pre-line text-sm text-red-700">{estado.erro}</p>}
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
