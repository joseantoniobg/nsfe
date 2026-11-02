import Link from "next/link";

export function Voltar({ href, rotulo }: { href: string; rotulo: string }) {
  return (
    <Link href={href} className="mb-4 inline-flex items-center gap-1 text-sm text-texto-3 hover:text-texto">
      <span aria-hidden>←</span> {rotulo}
    </Link>
  );
}
