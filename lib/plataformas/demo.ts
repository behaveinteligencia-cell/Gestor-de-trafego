import type { Conta, EspecificacaoCampanha, Plataforma } from "../types";
import {
  type AdaptadorPlataforma,
  type CampanhaRemota,
  type MetricaRemota,
  type ResultadoCriacao,
  validarSpecBasica,
} from "./types";

/**
 * Adaptador de demonstração: gera dados sintéticos determinísticos para que a
 * interface, a CLI e as rotinas funcionem sem credencial nenhuma. Usado quando
 * GESTOR_MODO=demo ou quando a conta tem config.demo = true.
 */

function semente(texto: string): () => number {
  let h = 2166136261;
  for (const c of texto) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const MODELOS: Record<Plataforma, Array<{ nome: string; objetivo: CampanhaRemota["objetivo"]; orc: number }>> = {
  meta: [
    { nome: "[LEADS] Formulário WhatsApp — Frio", objetivo: "leads", orc: 120 },
    { nome: "[VENDAS] Advantage+ Catálogo", objetivo: "vendas", orc: 250 },
    { nome: "[REMKT] Visitantes 30d", objetivo: "vendas", orc: 60 },
    { nome: "[ALCANCE] Lançamento Reels", objetivo: "reconhecimento", orc: 80 },
  ],
  google: [
    { nome: "Search — Marca", objetivo: "vendas", orc: 70 },
    { nome: "Search — Genérico Serviço", objetivo: "leads", orc: 180 },
    { nome: "PMax — Catálogo", objetivo: "vendas", orc: 200 },
  ],
  tiktok: [
    { nome: "Spark Ads — UGC Depoimentos", objetivo: "trafego", orc: 90 },
    { nome: "Conversão — Lead Form", objetivo: "leads", orc: 110 },
  ],
  linkedin: [
    { nome: "Lead Gen — Decisores B2B", objetivo: "leads", orc: 150 },
    { nome: "Awareness — Conteúdo Patrocinado", objetivo: "reconhecimento", orc: 60 },
  ],
};

export function adaptadorDemo(plataforma: Plataforma): AdaptadorPlataforma {
  return {
    plataforma,
    credenciais() {
      return { presentes: { DEMO: true }, completas: true };
    },
    validarSpec(spec: EspecificacaoCampanha) {
      return validarSpecBasica(spec);
    },
    async listarCampanhas(conta: Conta): Promise<CampanhaRemota[]> {
      return MODELOS[plataforma].map((m, i) => ({
        plataforma,
        external_id: `${plataforma}-${conta.account_id}-${i + 1}`,
        nome: m.nome,
        status: i === MODELOS[plataforma].length - 1 ? "pausada" : "ativa",
        objetivo: m.objetivo,
        orcamento_diario: m.orc,
        orcamento_total: null,
        inicio: "2026-09-01",
        fim: null,
        raw: { demo: true },
      }));
    },
    async metricasDiarias(conta: Conta, inicio: string, fim: string): Promise<MetricaRemota[]> {
      const saida: MetricaRemota[] = [];
      const campanhas = await this.listarCampanhas(conta);
      for (const c of campanhas) {
        const rnd = semente(c.external_id);
        const base = c.orcamento_diario ?? 100;
        let d = new Date(inicio + "T00:00:00Z");
        const limite = new Date(fim + "T00:00:00Z");
        let dia = 0;
        while (d <= limite) {
          const data = d.toISOString().slice(0, 10);
          // Simula fadiga: CTR cai e CPA sobe com o tempo numa das campanhas.
          // A fadiga acelera: quase nada nas primeiras semanas, forte nas últimas.
          const fadiga = c.nome.includes("Frio") ? 1 + Math.pow(dia / 30, 3) * 2 : 1;
          const gasto = c.status === "pausada" ? 0 : base * (0.85 + rnd() * 0.3);
          const cpm = (plataforma === "linkedin" ? 60 : plataforma === "google" ? 25 : 14) * (0.9 + rnd() * 0.2);
          const impressoes = Math.round((gasto / cpm) * 1000);
          const ctr = ((plataforma === "google" ? 0.04 : 0.012) * (0.85 + rnd() * 0.3)) / fadiga;
          const cliques = Math.round(impressoes * ctr);
          const txConv = (c.objetivo === "reconhecimento" ? 0.002 : 0.04) * (0.8 + rnd() * 0.4) / fadiga;
          const conversoes = Math.round(cliques * txConv * 10) / 10;
          saida.push({
            campanha_external_id: c.external_id,
            data,
            impressoes,
            cliques,
            gasto: Math.round(gasto * 100) / 100,
            conversoes,
            valor_conversao: Math.round(conversoes * (c.objetivo === "vendas" ? 180 : 0) * 100) / 100,
            alcance: Math.round(impressoes * 0.7),
            raw: { demo: true },
          });
          d = new Date(d.getTime() + 86_400_000);
          dia++;
        }
      }
      return saida;
    },
    async criarCampanha(conta, spec, idempotencia): Promise<ResultadoCriacao> {
      return {
        external_id: `${plataforma}-demo-${idempotencia.slice(0, 8)}`,
        status: "pausada",
        filhos: spec.anuncios.map((a, i) => ({
          tipo: "anuncio",
          external_id: `${plataforma}-demo-ad-${i + 1}`,
          nome: a.nome,
        })),
        raw: { demo: true, conta: conta.account_id },
      };
    },
    async alterarStatus() {
      /* demo: nada a fazer */
    },
    async alterarOrcamentoDiario() {
      /* demo: nada a fazer */
    },
  };
}
