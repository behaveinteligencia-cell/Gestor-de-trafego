"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Clock, FileText, LayoutDashboard, Megaphone, PenSquare, Settings, Bell } from "lucide-react";

const ITENS = [
  { href: "/", rotulo: "Visão geral", Icone: LayoutDashboard },
  { href: "/campanhas", rotulo: "Campanhas", Icone: Megaphone },
  { href: "/rascunhos", rotulo: "Subir campanha", Icone: PenSquare },
  { href: "/relatorios", rotulo: "Relatórios", Icone: FileText },
  { href: "/alertas", rotulo: "Alertas", Icone: Bell },
  { href: "/rotinas", rotulo: "Rotinas", Icone: Clock },
  { href: "/agentes", rotulo: "Agentes", Icone: Bot },
  { href: "/configuracoes", rotulo: "Configurações", Icone: Settings },
];

export function BarraLateral() {
  const caminho = usePathname();
  return (
    <aside className="w-60 shrink-0 bg-lateral text-lateral-texto flex flex-col sticky top-0 h-screen">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-primaria" />
          <span className="font-semibold text-white tracking-tight">Gestor de Tráfego</span>
        </div>
        <p className="text-xs mt-1 text-lateral-texto/70">Operado pelo Claude Code</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {ITENS.map(({ href, rotulo, Icone }) => {
          const ativo = href === "/" ? caminho === "/" : caminho.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                ativo ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icone size={16} />
              {rotulo}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-4 border-t border-white/10 text-xs text-lateral-texto/70 leading-relaxed">
        No Claude Code: <code className="text-white/90">/trafego</code>
        <br />
        CLI: <code className="text-white/90">npm run gestor -- status</code>
      </div>
    </aside>
  );
}
