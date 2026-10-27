"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TIPOS_ROTINA, type Cliente } from "@/lib/types";

const DESCRICAO: Record<string, string> = {
  sync: "Sincroniza campanhas e métricas",
  pacing: "Gasto real × orçamento esperado",
  fadiga_criativa: "Queda de CTR semana a semana",
  relatorio_semanal: "Relatório-base dos últimos 7 dias",
  relatorio_mensal: "Relatório-base dos últimos 30 dias",
  auditoria: "Auditoria pelo Claude (só prompt)",
  alerta_cpa: "CPA acima da meta (config.cpa_meta)",
  personalizada: "Qualquer tarefa descrita no prompt",
};

export function FormularioRotina({ clientes }: { clientes: Cliente[] }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    const fd = new FormData(e.currentTarget);
    let config: Record<string, unknown> = {};
    try {
      if (String(fd.get("config") ?? "").trim()) config = JSON.parse(String(fd.get("config")));
    } catch {
      setErro("Config precisa ser JSON válido.");
      setOcupado(false);
      return;
    }
    try {
      const r = await fetch("/api/rotinas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nome: fd.get("nome"),
          tipo: fd.get("tipo"),
          agenda: fd.get("agenda"),
          descricao: String(fd.get("descricao") ?? "").trim() || null,
          cliente_id: fd.get("cliente") ? Number(fd.get("cliente")) : null,
          prompt_claude: String(fd.get("prompt") ?? "").trim() || null,
          config,
        }),
      });
      const j = (await r.json()) as { erro?: string };
      if (!r.ok) throw new Error(j.erro ?? "Falha.");
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form onSubmit={enviar} className="cartao p-4 space-y-3 self-start">
      <h2 className="font-medium">Nova rotina</h2>
      <div>
        <label className="rotulo">Nome</label>
        <input name="nome" required className="campo" placeholder="Checagem de pacing — Clínica" />
      </div>
      <div>
        <label className="rotulo">Tipo</label>
        <select name="tipo" className="campo" defaultValue="pacing">
          {TIPOS_ROTINA.map((t) => (
            <option key={t} value={t}>
              {t} — {DESCRICAO[t]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="rotulo">Agenda (cron, 5 campos)</label>
        <input name="agenda" required className="campo font-mono" defaultValue="0 8 * * 1-5" />
        <p className="text-xs text-suave mt-1">min hora dia mês dia-semana · ex.: <code>0 7 * * 1</code> = segunda às 7h</p>
      </div>
      <div>
        <label className="rotulo">Cliente</label>
        <select name="cliente" className="campo">
          <option value="">Todos</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="rotulo">Descrição</label>
        <input name="descricao" className="campo" />
      </div>
      <div>
        <label className="rotulo">Prompt para o Claude (opcional)</label>
        <textarea name="prompt" className="campo" rows={3} placeholder="Depois de rodar, analise os alertas e proponha ações com motivo." />
      </div>
      <div>
        <label className="rotulo">Config (JSON, opcional)</label>
        <input name="config" className="campo font-mono" placeholder='{"tolerancia": 0.2}' />
      </div>
      {erro && <p className="text-xs text-critico">{erro}</p>}
      <button className="botao-primario w-full justify-center" disabled={ocupado}>
        {ocupado ? "Criando…" : "Criar rotina"}
      </button>
    </form>
  );
}
