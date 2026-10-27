import Link from "next/link";
import type { ReactNode } from "react";
import { NOMES_PLATAFORMA, type Plataforma } from "@/lib/types";

export function Cabecalho({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descricao && <p className="text-sm text-suave mt-1">{descricao}</p>}
      </div>
      {acoes && <div className="flex items-center gap-2 shrink-0">{acoes}</div>}
    </div>
  );
}

export function Kpi({ rotulo, valor, variacao, inverter, sub }: { rotulo: string; valor: string; variacao?: number | null; inverter?: boolean; sub?: string }) {
  let cor = "text-suave";
  let texto = "";
  if (variacao !== null && variacao !== undefined) {
    const bom = inverter ? variacao < 0 : variacao > 0;
    cor = variacao === 0 ? "text-suave" : bom ? "text-ok" : "text-critico";
    texto = `${variacao > 0 ? "▲" : variacao < 0 ? "▼" : "•"} ${Math.abs(variacao * 100).toFixed(1)}%`;
  }
  return (
    <div className="cartao p-4">
      <div className="text-xs font-medium text-suave uppercase tracking-wide">{rotulo}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{valor}</div>
      <div className={`text-xs mt-1 ${cor}`}>{texto || sub || " "}</div>
    </div>
  );
}

const COR_PLAT: Record<Plataforma, string> = {
  meta: "bg-blue-50 text-blue-700",
  google: "bg-emerald-50 text-emerald-700",
  tiktok: "bg-zinc-900 text-white",
  linkedin: "bg-sky-50 text-sky-800",
};

export function EtiquetaPlataforma({ p }: { p: Plataforma | string }) {
  const cls = COR_PLAT[p as Plataforma] ?? "bg-fundo text-texto";
  return <span className={`etiqueta ${cls}`}>{NOMES_PLATAFORMA[p as Plataforma] ?? p}</span>;
}

const COR_STATUS: Record<string, string> = {
  ativa: "bg-green-50 text-green-700",
  pausada: "bg-amber-50 text-amber-700",
  encerrada: "bg-zinc-100 text-zinc-600",
  rascunho: "bg-zinc-100 text-zinc-700",
  em_revisao: "bg-blue-50 text-blue-700",
  aprovado: "bg-violet-50 text-violet-700",
  publicado: "bg-green-50 text-green-700",
  erro: "bg-red-50 text-red-700",
  cancelado: "bg-zinc-100 text-zinc-500",
  desconhecido: "bg-zinc-100 text-zinc-500",
  ok: "bg-green-50 text-green-700",
  executando: "bg-blue-50 text-blue-700",
  pendente_claude: "bg-violet-50 text-violet-700",
  info: "bg-blue-50 text-blue-700",
  atencao: "bg-amber-50 text-amber-700",
  critico: "bg-red-50 text-red-700",
};

export function EtiquetaStatus({ s }: { s: string }) {
  return <span className={`etiqueta ${COR_STATUS[s] ?? "bg-fundo"}`}>{s.replace("_", " ")}</span>;
}

export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="cartao p-10 text-center">
      <p className="font-medium">{titulo}</p>
      <div className="text-sm text-suave mt-2 space-y-1">{children}</div>
    </div>
  );
}

export function Comando({ children }: { children: string }) {
  return <code className="block bg-lateral text-white text-xs rounded-md px-3 py-2 mt-2 text-left overflow-x-auto">{children}</code>;
}

export function LinkBotao({ href, children, primario }: { href: string; children: ReactNode; primario?: boolean }) {
  return (
    <Link href={href} className={primario ? "botao-primario" : "botao"}>
      {children}
    </Link>
  );
}
