import type { Metadata } from "next";
import "./globals.css";
import { BarraLateral } from "@/components/BarraLateral";

export const metadata: Metadata = {
  title: "Gestor de Tráfego",
  description: "Controle de campanhas de tráfego pago operado pelo Claude Code",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">
        <div className="flex min-h-screen">
          <BarraLateral />
          <main className="flex-1 min-w-0 px-6 py-6 lg:px-10 max-w-[1400px]">{children}</main>
        </div>
      </body>
    </html>
  );
}
