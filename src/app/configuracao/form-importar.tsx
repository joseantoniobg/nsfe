"use client";

import { useActionState } from "react";
import { importarXmlsAction } from "../actions";

export function FormImportar() {
  const [estado, acao, enviando] = useActionState(importarXmlsAction, null);
  return (
    <form action={acao} className="space-y-3">
      <input type="file" name="arquivos" accept=".xml,text/xml,application/xml" multiple className="block w-full text-sm" />
      <button className="botao-secundario" disabled={enviando}>
        {enviando ? "Importando…" : "Importar XMLs"}
      </button>
      {estado && "erro" in estado && <p className="text-sm text-red-700">{estado.erro}</p>}
      {estado && "notasLidas" in estado && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          {estado.notasLidas} nota(s) lida(s), {estado.servicosNovos} perfil(is) de serviço e {estado.clientesNovos} cliente(s) novo(s)
          {estado.emitenteAtualizado && "; dados da empresa atualizados"}.
          {estado.avisos.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-amber-900">
              {estado.avisos.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
