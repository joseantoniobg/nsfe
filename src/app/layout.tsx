import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { LinksNavegacao, Navegacao } from "@/components/navegacao";
import { SCRIPT_TEMA, SeletorTema } from "@/components/tema";
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
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="flex min-h-full flex-col">
        {!producao && (
          <div className="bg-aviso-fundo px-4 py-1.5 text-center text-xs font-medium text-aviso">
            Ambiente de PRODUÇÃO RESTRITA — notas sem valor fiscal. Altere NFSE_AMBIENTE=1 no .env para emitir de verdade.
          </div>
        )}
        <header className="sticky top-0 z-10 border-b border-borda bg-superficie/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
            <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold" aria-label="Início">
              <Image src="/icon.svg" alt="" width={26} height={26} unoptimized />
              <span className="hidden sm:inline">NFS-e</span>
            </Link>
            <nav className="-my-1 flex min-w-0 flex-1 gap-1 overflow-x-auto py-1 text-sm">
              <Suspense fallback={<LinksNavegacao />}>
                <Navegacao />
              </Suspense>
            </nav>
            <SeletorTema />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
