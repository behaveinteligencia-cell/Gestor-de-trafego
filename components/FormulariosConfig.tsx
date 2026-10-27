"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Cliente } from "@/lib/types";

function usarEnvio(url: string) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function enviar(e: React.FormEvent<HTMLFormElement>, montar: (fd: FormData) => unknown) {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    const form = e.currentTarget;
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(montar(new FormData(form))) });
      const j = (await r.json()) as { erro?: string };
      if (!r.ok) throw new Error(j.erro ?? "Falha.");
      form.reset();
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setOcupado(false);
    }
  }
  return { enviar, erro, ocupado };
}

export function FormularioCliente() {
  const { enviar, erro, ocupado } = usarEnvio("/api/clientes");
  return (
    <form className="cartao p-4 space-y-3" onSubmit={(e) => enviar(e, (fd) => ({ nome: fd.get("nome"), segmento: fd.get("segmento") || null, observacoes: fd.get("observacoes") || null }))}>
      <h2 className="font-medium">Novo cliente</h2>
      <div>
        <label className="rotulo">Nome</label>
        <input name="nome" required className="campo" />
      </div>
      <div>
        <label className="rotulo">Segmento</label>
        <input name="segmento" className="campo" placeholder="clínica, e-commerce, B2B…" />
      </div>
      <div>
        <label className="rotulo">Observações</label>
        <textarea name="observacoes" className="campo" rows={2} placeholder="Metas, restrições, quem aprova…" />
      </div>
      {erro && <p className="text-xs text-critico">{erro}</p>}
      <button className="botao-primario w-full justify-center" disabled={ocupado}>
        Criar cliente
      </button>
    </form>
  );
}

export function FormularioConta({ clientes, plataformas }: { clientes: Cliente[]; plataformas: Array<{ valor: string; rotulo: string }> }) {
  const { enviar, erro, ocupado } = usarEnvio("/api/contas");
  return (
    <form
      className="cartao p-4 space-y-3"
      onSubmit={(e) =>
        enviar(e, (fd) => ({
          cliente_id: Number(fd.get("cliente")),
          plataforma: fd.get("plataforma"),
          account_id: fd.get("account_id"),
          nome: fd.get("nome"),
          moeda: fd.get("moeda") || "BRL",
          config: {
            demo: fd.get("demo") === "on",
            teto_gasto_diario: fd.get("teto") ? Number(fd.get("teto")) : undefined,
            ...(fd.get("page_id") ? { page_id: fd.get("page_id") } : {}),
            ...(fd.get("pixel_id") ? { pixel_id: fd.get("pixel_id") } : {}),
          },
        }))
      }
    >
      <h2 className="font-medium">Nova conta de anúncios</h2>
      <div>
        <label className="rotulo">Cliente</label>
        <select name="cliente" className="campo" required>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="rotulo">Plataforma</label>
          <select name="plataforma" className="campo">
            {plataformas.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="rotulo">Moeda</label>
          <input name="moeda" className="campo" defaultValue="BRL" />
        </div>
      </div>
      <div>
        <label className="rotulo">ID da conta na plataforma</label>
        <input name="account_id" required className="campo font-mono" placeholder="act_123… / 123-456-7890 / advertiser_id / 5xxxxx" />
      </div>
      <div>
        <label className="rotulo">Nome</label>
        <input name="nome" required className="campo" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="rotulo">Teto gasto/dia</label>
          <input name="teto" type="number" step="0.01" className="campo" placeholder="300" />
        </div>
        <div>
          <label className="rotulo">Page ID (Meta)</label>
          <input name="page_id" className="campo font-mono" />
        </div>
        <div className="col-span-2">
          <label className="rotulo">Pixel ID (Meta)</label>
          <input name="pixel_id" className="campo font-mono" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="demo" /> Conta de demonstração (dados sintéticos, sem credencial)
      </label>
      {erro && <p className="text-xs text-critico">{erro}</p>}
      <button className="botao-primario w-full justify-center" disabled={ocupado || clientes.length === 0}>
        Adicionar conta
      </button>
    </form>
  );
}
