"use client";

import { useActionState } from "react";
import { importarDoAdnAction, importarXmlsAction } from "../actions";

export function FormImportar() {
  const [estado, acao, enviando] = useActionState(importarXmlsAction, null);
  return (
    <form action={acao} className="space-y-3">
      <input type="file" name="arquivos" accept=".xml,text/xml,application/xml" multiple className="block w-full text-sm text-texto-3 file:mr-3 file:rounded-lg file:border file:border-borda-forte file:bg-superficie file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-texto-2 hover:file:bg-sutil" />
      <button className="botao-secundario" disabled={enviando}>
        {enviando ? "Importando…" : "Importar XMLs"}
      </button>
      {estado && "erro" in estado && <p role="alert" className="alerta-erro">{estado.erro}</p>}
      {estado && "notasLidas" in estado && (
        <div role="status" className="alerta-sucesso">
          {estado.notasLidas} nota(s) lida(s), {estado.servicosNovos} perfil(is) de serviço e {estado.clientesNovos} cliente(s) novo(s)
          {estado.emitenteAtualizado && "; dados da empresa atualizados"}.
          {estado.avisos.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-aviso">
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

export function FormImportarAdn() {
  const [estado, acao, buscando] = useActionState(importarDoAdnAction, null);
  return (
    <form action={acao} className="space-y-3">
      <button className="botao-secundario" disabled={buscando}>
        {buscando ? "Buscando…" : "Buscar notas emitidas"}
      </button>
      {estado && "erro" in estado && <p role="alert" className="alerta-erro">{estado.erro}</p>}
      {estado && "notasNovas" in estado && (
        <div role="status" className="alerta-sucesso">
          {estado.notasNovas} nota(s) nova(s), {estado.canceladas} cancelamento(s) aplicado(s)
          {estado.clientesNovos > 0 && ` e ${estado.clientesNovos} cliente(s) inativo(s) criado(s)`}.
          {estado.avisos.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-aviso">
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
