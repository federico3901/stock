import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Stock — analisi fondamentale dai documenti",
  description: "Strumento personale per analizzare un titolo partendo da 10-K, 10-Q e presentazioni.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6 h-12 flex items-center gap-6">
            <Link href="/" className="font-semibold tracking-tight text-[15px] flex items-center gap-2">
              <span className="inline-block size-5 rounded bg-accent" aria-hidden />
              Stock
            </Link>
            <nav className="flex items-center gap-1 text-sm text-ink-2">
              <Link href="/" className="px-2.5 py-1 rounded hover:bg-surface-2 hover:text-ink">Aziende</Link>
              <Link href="/confronta" className="px-2.5 py-1 rounded hover:bg-surface-2 hover:text-ink">Confronta</Link>
              <Link href="/impostazioni" className="px-2.5 py-1 rounded hover:bg-surface-2 hover:text-ink">Impostazioni</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-[1400px] px-4 sm:px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
