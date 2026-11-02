"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

type Tema = "sistema" | "light" | "dark";

const CHAVE = "tema";

/** Roda no <head>, antes da primeira pintura, para não piscar o tema errado. */
export const SCRIPT_TEMA = `try{var t=localStorage.getItem("${CHAVE}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

const ouvintes = new Set<() => void>();

function lerTema(): Tema {
  try {
    const t = localStorage.getItem(CHAVE);
    return t === "light" || t === "dark" ? t : "sistema";
  } catch {
    return "sistema";
  }
}

function aplicar(tema: Tema) {
  if (tema === "sistema") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = tema;
}

function escolher(tema: Tema) {
  try {
    if (tema === "sistema") localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, tema);
  } catch {}
  aplicar(tema);
  ouvintes.forEach((o) => o());
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

const ICONES: Record<Tema, React.ReactNode> = {
  sistema: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  dark: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
};

const OPCOES: [Tema, string][] = [
  ["sistema", "Tema do sistema"],
  ["light", "Tema claro"],
  ["dark", "Tema escuro"],
];

export function SeletorTema() {
  const atual = useSyncExternalStore(assinar, lerTema, () => "sistema" as Tema);

  // Em desenvolvimento, o Strict Mode remonta o <html> e apaga o data-theme do script inicial.
  useLayoutEffect(() => aplicar(lerTema()), []);

  return (
    <div role="radiogroup" aria-label="Tema" className="flex rounded-lg border border-borda bg-sutil p-0.5">
      {OPCOES.map(([tema, rotulo]) => (
        <button
          key={tema}
          type="button"
          role="radio"
          aria-checked={atual === tema}
          aria-label={rotulo}
          title={rotulo}
          onClick={() => escolher(tema)}
          className={`rounded-md p-1.5 ${atual === tema ? "bg-superficie text-texto shadow-sm" : "text-texto-3 hover:text-texto"}`}
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {ICONES[tema]}
          </svg>
        </button>
      ))}
    </div>
  );
}
