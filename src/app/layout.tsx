import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Emissor NFS-e",
  description: "Emissão de NFS-e pelo padrão nacional",
};

const producao = process.env.NFSE_AMBIENTE === "1";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {!producao && (
          <div className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
            Ambiente de PRODUÇÃO RESTRITA — notas sem valor fiscal. Altere NFSE_AMBIENTE=1 no .env para emitir de verdade.
          </div>
        )}
        <header className="border-b border-zinc-200 bg-white">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold">
              NFS-e
            </Link>
            <Link href="/" className="text-zinc-600 hover:text-zinc-900">
              Emitir
            </Link>
            <Link href="/notas" className="text-zinc-600 hover:text-zinc-900">
              Notas
            </Link>
            <Link href="/clientes" className="text-zinc-600 hover:text-zinc-900">
              Clientes
            </Link>
            <Link href="/configuracao" className="ml-auto text-zinc-600 hover:text-zinc-900">
              Configuração
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
