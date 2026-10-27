import { campanhas, clientes, metricas, relatorios } from "../repos";
import { NOMES_PLATAFORMA, type MetricasAgregadas, type Relatorio } from "../types";

/**
 * Relatórios: a parte determinística (tabelas, totais, comparação com o período
 * anterior) é gerada aqui; a análise em prosa vem do Claude (`--analise`) e é
 * anexada ao markdown. Assim a interface e a CLI mostram o mesmo documento.
 */

export function fmtMoeda(v: number | null | undefined, moeda = "BRL"): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda, maximumFractionDigits: 2 }).format(v);
}
export function fmtNum(v: number | null | undefined, casas = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(v);
}
export function fmtPct(v: number | null | undefined, casas = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(v * 100)}%`;
}

export function variacao(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null || anterior === 0) return null;
  return atual / anterior - 1;
}

function fmtVar(v: number | null, inverter = false): string {
  if (v === null) return "";
  const sinal = v > 0 ? "▲" : v < 0 ? "▼" : "•";
  const bom = inverter ? v < 0 : v > 0;
  return ` (${sinal} ${fmtPct(Math.abs(v), 1)}${v === 0 ? "" : bom ? " melhor" : " pior"})`;
}

export function periodoAnterior(inicio: string, fim: string): { inicio: string; fim: string } {
  const i = new Date(inicio + "T00:00:00Z").getTime();
  const f = new Date(fim + "T00:00:00Z").getTime();
  const dias = Math.round((f - i) / 86_400_000) + 1;
  return {
    inicio: new Date(i - dias * 86_400_000).toISOString().slice(0, 10),
    fim: new Date(i - 86_400_000).toISOString().slice(0, 10),
  };
}

export interface DadosRelatorio {
  cliente: { id: number; nome: string; slug: string } | null;
  periodo: { inicio: string; fim: string };
  anterior: { inicio: string; fim: string };
  totais: MetricasAgregadas;
  totais_anteriores: MetricasAgregadas;
  por_plataforma: Array<{ plataforma: string } & MetricasAgregadas>;
  por_campanha: Array<{ id: number; nome: string; plataforma: string; status: string; orcamento_diario: number | null } & MetricasAgregadas>;
  por_dia: Array<{ data: string } & MetricasAgregadas>;
  moeda: string;
}

export function coletarDados(cliente_id: number | null, inicio: string, fim: string): DadosRelatorio {
  const cliente = cliente_id ? clientes.porId(cliente_id) : null;
  const ant = periodoAnterior(inicio, fim);
  const f = { cliente_id: cliente_id ?? undefined, inicio, fim };
  const moeda = campanhas.listar({ cliente_id: cliente_id ?? undefined })[0]?.moeda ?? "BRL";
  return {
    cliente: cliente ? { id: cliente.id, nome: cliente.nome, slug: cliente.slug } : null,
    periodo: { inicio, fim },
    anterior: ant,
    totais: metricas.totais(f),
    totais_anteriores: metricas.totais({ ...f, inicio: ant.inicio, fim: ant.fim }),
    por_plataforma: metricas.porPlataforma(f),
    por_campanha: metricas.porCampanha(f).map(({ campanha, ...m }) => ({
      id: campanha.id,
      nome: campanha.nome,
      plataforma: campanha.plataforma,
      status: campanha.status,
      orcamento_diario: campanha.orcamento_diario,
      ...m,
    })),
    por_dia: metricas.porDia(f),
    moeda,
  };
}

export function renderizarMarkdown(d: DadosRelatorio, titulo: string, analise?: string): string {
  const m = d.moeda;
  const t = d.totais;
  const a = d.totais_anteriores;
  const linhas: string[] = [];
  linhas.push(`# ${titulo}`);
  linhas.push("");
  linhas.push(`**Cliente:** ${d.cliente?.nome ?? "Todos"}  `);
  linhas.push(`**Período:** ${d.periodo.inicio} a ${d.periodo.fim} (comparado com ${d.anterior.inicio} a ${d.anterior.fim})`);
  linhas.push("");
  linhas.push("## Resumo do período");
  linhas.push("");
  linhas.push("| Métrica | Valor | vs. período anterior |");
  linhas.push("| --- | ---: | --- |");
  linhas.push(`| Investimento | ${fmtMoeda(t.gasto, m)} | ${fmtVar(variacao(t.gasto, a.gasto)).trim() || "—"} |`);
  linhas.push(`| Impressões | ${fmtNum(t.impressoes)} | ${fmtVar(variacao(t.impressoes, a.impressoes)).trim() || "—"} |`);
  linhas.push(`| Cliques | ${fmtNum(t.cliques)} | ${fmtVar(variacao(t.cliques, a.cliques)).trim() || "—"} |`);
  linhas.push(`| CTR | ${fmtPct(t.ctr)} | ${fmtVar(variacao(t.ctr, a.ctr)).trim() || "—"} |`);
  linhas.push(`| CPC | ${fmtMoeda(t.cpc, m)} | ${fmtVar(variacao(t.cpc, a.cpc), true).trim() || "—"} |`);
  linhas.push(`| Conversões | ${fmtNum(t.conversoes, 1)} | ${fmtVar(variacao(t.conversoes, a.conversoes)).trim() || "—"} |`);
  linhas.push(`| CPA | ${fmtMoeda(t.cpa, m)} | ${fmtVar(variacao(t.cpa, a.cpa), true).trim() || "—"} |`);
  if (t.valor_conversao > 0) {
    linhas.push(`| Receita atribuída | ${fmtMoeda(t.valor_conversao, m)} | ${fmtVar(variacao(t.valor_conversao, a.valor_conversao)).trim() || "—"} |`);
    linhas.push(`| ROAS | ${fmtNum(t.roas, 2)} | ${fmtVar(variacao(t.roas, a.roas)).trim() || "—"} |`);
  }
  linhas.push("");
  if (analise?.trim()) {
    linhas.push("## Análise");
    linhas.push("");
    linhas.push(analise.trim());
    linhas.push("");
  }
  linhas.push("## Por plataforma");
  linhas.push("");
  linhas.push("| Plataforma | Investimento | Impressões | Cliques | CTR | Conversões | CPA |");
  linhas.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const p of d.por_plataforma) {
    const nome = NOMES_PLATAFORMA[p.plataforma as keyof typeof NOMES_PLATAFORMA] ?? p.plataforma;
    linhas.push(
      `| ${nome} | ${fmtMoeda(p.gasto, m)} | ${fmtNum(p.impressoes)} | ${fmtNum(p.cliques)} | ${fmtPct(p.ctr)} | ${fmtNum(p.conversoes, 1)} | ${fmtMoeda(p.cpa, m)} |`,
    );
  }
  linhas.push("");
  linhas.push("## Por campanha");
  linhas.push("");
  linhas.push("| Campanha | Plataforma | Status | Investimento | Cliques | CTR | Conv. | CPA |");
  linhas.push("| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |");
  for (const c of d.por_campanha) {
    linhas.push(
      `| ${c.nome} | ${c.plataforma} | ${c.status} | ${fmtMoeda(c.gasto, m)} | ${fmtNum(c.cliques)} | ${fmtPct(c.ctr)} | ${fmtNum(c.conversoes, 1)} | ${fmtMoeda(c.cpa, m)} |`,
    );
  }
  linhas.push("");
  linhas.push(`_Gerado em ${new Date().toLocaleString("pt-BR")} pelo Gestor de Tráfego. Dados das APIs das plataformas; conversões conforme a atribuição de cada plataforma — não some conversões entre plataformas._`);
  return linhas.join("\n");
}

export function gerarRelatorio(opts: {
  cliente_id: number | null;
  inicio: string;
  fim: string;
  tipo?: Relatorio["tipo"];
  titulo?: string;
  analise?: string;
}): Relatorio {
  const dados = coletarDados(opts.cliente_id, opts.inicio, opts.fim);
  const tipo = opts.tipo ?? "desempenho";
  const titulo =
    opts.titulo ??
    `Relatório ${tipo === "semanal" ? "semanal" : tipo === "mensal" ? "mensal" : "de desempenho"} — ${dados.cliente?.nome ?? "Todos os clientes"} (${opts.inicio} a ${opts.fim})`;
  const md = renderizarMarkdown(dados, titulo, opts.analise);
  const resumo = `${fmtMoeda(dados.totais.gasto, dados.moeda)} investidos, ${fmtNum(dados.totais.conversoes, 1)} conversões, CPA ${fmtMoeda(dados.totais.cpa, dados.moeda)}`;
  return relatorios.criar({
    cliente_id: opts.cliente_id,
    titulo,
    tipo,
    periodo_inicio: opts.inicio,
    periodo_fim: opts.fim,
    resumo,
    conteudo_md: md,
    dados: dados as unknown as Record<string, unknown>,
  });
}
