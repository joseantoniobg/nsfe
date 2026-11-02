"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: [string, string][] = [
  ["/", "Emitir"],
  ["/notas", "Notas"],
  ["/clientes", "Clientes"],
  ["/configuracao", "Configuração"],
];

const ativo = (href: string, caminho: string | null) => (href === "/" ? caminho === "/" : !!caminho?.startsWith(href));

/** Links sem destaque, para o fallback do Suspense enquanto o caminho não é conhecido. */
export function LinksNavegacao({ caminho = null }: { caminho?: string | null }) {
  return (
    <>
      {LINKS.map(([href, rotulo]) => (
        <Link
          key={href}
          href={href}
          aria-current={ativo(href, caminho) ? "page" : undefined}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 ${
            ativo(href, caminho) ? "bg-sutil font-medium text-texto" : "text-texto-3 hover:bg-sutil/60 hover:text-texto"
          }`}
        >
          {rotulo}
        </Link>
      ))}
    </>
  );
}

export function Navegacao() {
  return <LinksNavegacao caminho={usePathname()} />;
}
