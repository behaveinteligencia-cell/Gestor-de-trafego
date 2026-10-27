"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

/**
 * Botão que chama uma rota de API (POST) e recarrega a página. Pode pedir um
 * texto (motivo, nome de quem aprova) antes de executar — ações que mudam
 * campanha exigem isso, como na CLI.
 */
export function AcaoBotao({
  url,
  corpo,
  children,
  pedir,
  campo = "motivo",
  confirmar,
  variante = "normal",
  irPara,
}: {
  url: string;
  corpo?: Record<string, unknown>;
  children: ReactNode;
  pedir?: string;
  campo?: string;
  confirmar?: string;
  variante?: "normal" | "primario" | "perigo";
  irPara?: string;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function executar() {
    setErro(null);
    const extra: Record<string, unknown> = {};
    if (pedir) {
      const v = window.prompt(pedir);
      if (v === null) return;
      if (!v.trim()) return setErro("Campo obrigatório.");
      extra[campo] = v.trim();
    }
    if (confirmar && !window.confirm(confirmar)) return;
    setOcupado(true);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(corpo ?? {}), ...extra }),
      });
      const j = (await r.json().catch(() => ({}))) as { erro?: string; id?: number };
      if (!r.ok) throw new Error(j.erro ?? `Falha (${r.status})`);
      if (irPara) router.push(irPara.replace(":id", String(j.id ?? "")));
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  const cls = variante === "primario" ? "botao-primario" : variante === "perigo" ? "botao-perigo" : "botao";
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" className={cls} disabled={ocupado} onClick={executar}>
        {ocupado ? "…" : children}
      </button>
      {erro && <span className="text-xs text-critico max-w-xs">{erro}</span>}
    </span>
  );
}
