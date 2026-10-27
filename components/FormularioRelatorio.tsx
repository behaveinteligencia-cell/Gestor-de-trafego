"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Cliente } from "@/lib/types";
import { hojeMenos } from "@/lib/formato";

export function FormularioRelatorio({ clientes }: { clientes: Cliente[] }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    const fd = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/relatorios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cliente_id: fd.get("cliente") ? Number(fd.get("cliente")) : null,
          inicio: fd.get("inicio"),
          fim: fd.get("fim"),
          tipo: fd.get("tipo"),
          titulo: String(fd.get("titulo") ?? "").trim() || undefined,
        }),
      });
      const j = (await r.json()) as { id?: number; erro?: string };
      if (!r.ok || !j.id) throw new Error(j.erro ?? "Falha ao gerar.");
      router.push(`/relatorios/${j.id}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form onSubmit={enviar} className="cartao p-4 space-y-3">
      <h2 className="font-medium">Gerar relatório</h2>
      <div>
        <label className="rotulo">Cliente</label>
        <select name="cliente" className="campo">
          <option value="">Todos os clientes</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="rotulo">Início</label>
          <input name="inicio" type="date" className="campo" defaultValue={hojeMenos(7)} required />
        </div>
        <div>
          <label className="rotulo">Fim</label>
          <input name="fim" type="date" className="campo" defaultValue={hojeMenos(1)} required />
        </div>
      </div>
      <div>
        <label className="rotulo">Tipo</label>
        <select name="tipo" className="campo" defaultValue="desempenho">
          <option value="desempenho">Desempenho</option>
          <option value="semanal">Semanal</option>
          <option value="mensal">Mensal</option>
          <option value="auditoria">Auditoria</option>
          <option value="personalizado">Personalizado</option>
        </select>
      </div>
      <div>
        <label className="rotulo">Título (opcional)</label>
        <input name="titulo" className="campo" />
      </div>
      {erro && <p className="text-xs text-critico">{erro}</p>}
      <button className="botao-primario w-full justify-center" disabled={ocupado}>
        {ocupado ? "Gerando…" : "Gerar"}
      </button>
    </form>
  );
}
