"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { NOMES_PLATAFORMA, OBJETIVOS, type Cliente, type EspecificacaoCampanha, type Plataforma } from "@/lib/types";

interface ContaOpcao {
  id: number;
  cliente_id: number;
  plataforma: Plataforma;
  nome: string;
  moeda: string;
  teto: number | null;
}

const ROTULO_OBJETIVO: Record<string, string> = {
  reconhecimento: "Reconhecimento",
  trafego: "Tráfego",
  engajamento: "Engajamento",
  leads: "Leads",
  vendas: "Vendas",
  mensagens: "Mensagens",
  instalacao_app: "Instalação de app",
  visualizacao_video: "Visualização de vídeo",
};

export function FormularioCampanha({ clientes, contas }: { clientes: Cliente[]; contas: ContaOpcao[] }) {
  const router = useRouter();
  const [clienteId, setClienteId] = useState<number>(clientes[0]?.id ?? 0);
  const contasDoCliente = useMemo(() => contas.filter((c) => c.cliente_id === clienteId), [contas, clienteId]);
  const [contaId, setContaId] = useState<number>(contasDoCliente[0]?.id ?? 0);
  const conta = contas.find((c) => c.id === (contasDoCliente.some((x) => x.id === contaId) ? contaId : contasDoCliente[0]?.id));
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [anuncios, setAnuncios] = useState<EspecificacaoCampanha["anuncios"]>([
    { nome: "Anúncio 1", formato: "imagem", titulo: "", texto_principal: "", cta: "Saiba mais", url_destino: "", utm: "" },
  ]);

  const ehGoogle = conta?.plataforma === "google";

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const fd = new FormData(e.currentTarget);
    const g = (k: string) => String(fd.get(k) ?? "").trim();
    const n = (k: string) => (g(k) ? Number(g(k)) : undefined);
    const lista = (k: string) => g(k).split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
    if (!conta) return setErro("Escolha uma conta.");
    const spec: EspecificacaoCampanha = {
      nome: g("nome"),
      objetivo: g("objetivo") as EspecificacaoCampanha["objetivo"],
      orcamento_diario: n("orcamento_diario"),
      orcamento_total: n("orcamento_total"),
      teto_gasto_diario: n("teto") ?? 0,
      inicio: g("inicio") || undefined,
      fim: g("fim") || undefined,
      publico: {
        descricao: g("publico_descricao") || undefined,
        localizacoes: lista("localizacoes"),
        idade_min: n("idade_min"),
        idade_max: n("idade_max"),
        interesses: lista("interesses"),
        exclusoes: lista("exclusoes"),
      },
      posicionamentos: "automatico",
      lance: { estrategia: g("lance") || (ehGoogle ? "maximizar_conversoes" : "menor_custo") },
      conversao: { evento: g("evento") || undefined, destino: g("destino") || undefined },
      anuncios: anuncios.map((a) => ({ ...a, utm: a.utm || `utm_source=${conta.plataforma}&utm_medium=paid&utm_campaign=${g("nome").toLowerCase().replace(/[^a-z0-9]+/g, "-")}` })),
      palavras_chave: ehGoogle ? lista("palavras_chave").map((t) => ({ texto: t, correspondencia: "frase" as const })) : undefined,
      negativas: ehGoogle ? lista("negativas") : undefined,
      observacoes: g("observacoes") || undefined,
    };
    setOcupado(true);
    try {
      const r = await fetch("/api/rascunhos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cliente_id: clienteId, conta_id: conta.id, spec }),
      });
      const j = (await r.json()) as { id?: number; erro?: string };
      if (!r.ok || !j.id) throw new Error(j.erro ?? "Falha ao criar rascunho.");
      router.push(`/rascunhos/${j.id}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
      setOcupado(false);
    }
  }

  function atualizarAnuncio(i: number, campo: string, valor: string) {
    setAnuncios((lista) => lista.map((a, k) => (k === i ? { ...a, [campo]: valor } : a)));
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <section className="cartao p-5 space-y-4">
        <h2 className="font-medium">Onde</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="rotulo">Cliente</label>
            <select className="campo" value={clienteId} onChange={(e) => { setClienteId(Number(e.target.value)); setContaId(0); }}>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="rotulo">Conta / plataforma</label>
            <select className="campo" value={conta?.id ?? ""} onChange={(e) => setContaId(Number(e.target.value))}>
              {contasDoCliente.map((c) => (
                <option key={c.id} value={c.id}>
                  {NOMES_PLATAFORMA[c.plataforma]} — {c.nome}
                </option>
              ))}
            </select>
            {contasDoCliente.length === 0 && <p className="text-xs text-critico mt-1">Esse cliente não tem contas ativas.</p>}
          </div>
        </div>
      </section>

      <section className="cartao p-5 space-y-4">
        <h2 className="font-medium">O quê</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="rotulo">Nome da campanha</label>
            <input name="nome" required className="campo" placeholder="[LEADS] Avaliação gratuita — Frio" />
          </div>
          <div>
            <label className="rotulo">Objetivo</label>
            <select name="objetivo" className="campo" defaultValue="leads">
              {OBJETIVOS.map((o) => (
                <option key={o} value={o}>
                  {ROTULO_OBJETIVO[o]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="rotulo">Estratégia de lance</label>
            <input name="lance" className="campo" placeholder={ehGoogle ? "maximizar_conversoes" : "menor_custo"} />
          </div>
          <div>
            <label className="rotulo">Orçamento diário ({conta?.moeda ?? "BRL"})</label>
            <input name="orcamento_diario" type="number" step="0.01" min="0" className="campo" placeholder="80" />
          </div>
          <div>
            <label className="rotulo">Orçamento total (opcional)</label>
            <input name="orcamento_total" type="number" step="0.01" min="0" className="campo" />
          </div>
          <div>
            <label className="rotulo">Teto de gasto diário aprovado *</label>
            <input name="teto" type="number" step="0.01" min="0" required className="campo" defaultValue={conta?.teto ?? ""} placeholder="120" />
            <p className="text-xs text-suave mt-1">Sem teto, nada é publicado. Deve ser ≥ orçamento diário.</p>
          </div>
          <div>
            <label className="rotulo">Início</label>
            <input name="inicio" type="date" className="campo" />
          </div>
          <div>
            <label className="rotulo">Fim</label>
            <input name="fim" type="date" className="campo" />
          </div>
          <div>
            <label className="rotulo">Evento de conversão</label>
            <input name="evento" className="campo" placeholder="Lead, Purchase, Contact…" />
          </div>
          <div>
            <label className="rotulo">Destino</label>
            <input name="destino" className="campo" placeholder="site, whatsapp, formulario, loja" />
          </div>
        </div>
      </section>

      <section className="cartao p-5 space-y-4">
        <h2 className="font-medium">Para quem</h2>
        <div>
          <label className="rotulo">Descrição do público</label>
          <textarea name="publico_descricao" className="campo" rows={2} placeholder="Mulheres 30–55, interessadas em estética, num raio de 15 km da clínica." />
        </div>
        <div className="grid sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <label className="rotulo">Localizações (códigos, separados por vírgula)</label>
            <input name="localizacoes" className="campo" placeholder="BR, BR-SP" defaultValue="BR" />
          </div>
          <div>
            <label className="rotulo">Idade mín.</label>
            <input name="idade_min" type="number" className="campo" placeholder="25" />
          </div>
          <div>
            <label className="rotulo">Idade máx.</label>
            <input name="idade_max" type="number" className="campo" placeholder="60" />
          </div>
          <div className="sm:col-span-2">
            <label className="rotulo">Interesses</label>
            <input name="interesses" className="campo" placeholder="Odontologia, Estética" />
          </div>
          <div className="sm:col-span-2">
            <label className="rotulo">Exclusões</label>
            <input name="exclusoes" className="campo" placeholder="Clientes atuais, Funcionários" />
          </div>
        </div>
        {ehGoogle && (
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="rotulo">Palavras-chave (uma por linha, correspondência de frase)</label>
              <textarea name="palavras_chave" className="campo" rows={4} placeholder={"implante dentário preço\ndentista perto de mim"} />
            </div>
            <div>
              <label className="rotulo">Negativas (só com relatório de termos; evite inventar)</label>
              <textarea name="negativas" className="campo" rows={4} placeholder={"grátis\ncurso"} />
            </div>
          </div>
        )}
      </section>

      <section className="cartao p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Anúncios</h2>
          <button type="button" className="botao" onClick={() => setAnuncios((l) => [...l, { nome: `Anúncio ${l.length + 1}`, formato: "imagem", titulo: "", texto_principal: "", cta: "Saiba mais", url_destino: "", utm: "" }])}>
            + anúncio
          </button>
        </div>
        {anuncios.map((a, i) => (
          <div key={i} className="border border-borda rounded-lg p-3 grid sm:grid-cols-2 gap-3">
            <div>
              <label className="rotulo">Nome</label>
              <input className="campo" value={a.nome} onChange={(e) => atualizarAnuncio(i, "nome", e.target.value)} />
            </div>
            <div>
              <label className="rotulo">Formato</label>
              <select className="campo" value={a.formato} onChange={(e) => atualizarAnuncio(i, "formato", e.target.value)}>
                {["imagem", "video", "carrossel", "texto", "responsivo"].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="rotulo">Título {ehGoogle ? "(≤ 30)" : "(≤ 40)"}</label>
              <input className="campo" value={String(a.titulo ?? "")} onChange={(e) => atualizarAnuncio(i, "titulo", e.target.value)} />
            </div>
            <div>
              <label className="rotulo">CTA</label>
              <input className="campo" value={a.cta ?? ""} onChange={(e) => atualizarAnuncio(i, "cta", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="rotulo">Texto principal {ehGoogle ? "(descrição ≤ 90)" : "(≤ 125 recomendado)"}</label>
              <textarea className="campo" rows={3} value={String(a.texto_principal ?? "")} onChange={(e) => atualizarAnuncio(i, "texto_principal", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="rotulo">URL de destino</label>
              <input className="campo" value={a.url_destino ?? ""} onChange={(e) => atualizarAnuncio(i, "url_destino", e.target.value)} placeholder="https://" />
            </div>
            <div className="sm:col-span-2">
              <label className="rotulo">Mídia (caminhos em data/midias ou URLs, separados por vírgula)</label>
              <input className="campo" value={(a.midia ?? []).join(", ")} onChange={(e) => setAnuncios((l) => l.map((x, k) => (k === i ? { ...x, midia: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : x)))} />
            </div>
          </div>
        ))}
      </section>

      <section className="cartao p-5">
        <label className="rotulo">Observações para quem aprova</label>
        <textarea name="observacoes" className="campo" rows={2} />
      </section>

      {erro && <p className="text-sm text-critico">{erro}</p>}
      <div className="flex gap-2">
        <button type="submit" className="botao-primario" disabled={ocupado || !conta}>
          {ocupado ? "Criando…" : "Criar rascunho e validar"}
        </button>
      </div>
    </form>
  );
}
