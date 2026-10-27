import { alertas, campanhas, metricas, type CampanhaComContexto } from "../repos";
import type { Alerta } from "../types";

/**
 * Checagens determinísticas que viram alertas. Cada uma devolve o que viu;
 * quem interpreta e decide (pausar, escalar) é o humano ou o Claude, com motivo.
 * Nenhuma delas mexe em campanha.
 */

function dias(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

function ativas(cliente_id?: number): CampanhaComContexto[] {
  return campanhas.listar({ cliente_id, status: "ativa" });
}

/** Pacing: gasto dos últimos 7 dias vs. orçamento esperado (orçamento diário × 7). */
export function checarPacing(cliente_id?: number, tolerancia = 0.25): Alerta[] {
  const criados: Alerta[] = [];
  const fim = dias(1);
  const ini = dias(7);
  for (const c of ativas(cliente_id)) {
    if (!c.orcamento_diario) continue;
    const esperado = c.orcamento_diario * 7;
    const real = metricas.totais({ campanha_id: c.id, inicio: ini, fim }).gasto;
    if (real === 0 && esperado > 0) {
      const a = alertas.registrar({
        cliente_id: c.cliente_id,
        campanha_id: c.id,
        tipo: "sem_entrega",
        severidade: "critico",
        mensagem: `"${c.nome}" está ativa mas não gastou nada em 7 dias. Verifique aprovação, pagamento, público ou lance.`,
        dados: { esperado, real },
      });
      if (a) criados.push(a);
      continue;
    }
    const razao = real / esperado;
    if (razao < 1 - tolerancia) {
      const a = alertas.registrar({
        cliente_id: c.cliente_id,
        campanha_id: c.id,
        tipo: "subentrega",
        severidade: "atencao",
        mensagem: `"${c.nome}" entregou ${Math.round(razao * 100)}% do orçamento em 7 dias (${real.toFixed(2)} de ${esperado.toFixed(2)}).`,
        dados: { esperado, real, razao },
      });
      if (a) criados.push(a);
    } else if (razao > 1 + tolerancia) {
      const a = alertas.registrar({
        cliente_id: c.cliente_id,
        campanha_id: c.id,
        tipo: "sobreentrega",
        severidade: "atencao",
        mensagem: `"${c.nome}" gastou ${Math.round(razao * 100)}% do orçamento em 7 dias (${real.toFixed(2)} de ${esperado.toFixed(2)}).`,
        dados: { esperado, real, razao },
      });
      if (a) criados.push(a);
    }
  }
  return criados;
}

/** Fadiga criativa: CTR dos últimos 7 dias caiu ≥ 30% frente aos 7 anteriores, com volume mínimo. */
export function checarFadiga(cliente_id?: number, quedaMinima = 0.3, impressoesMinimas = 5000): Alerta[] {
  const criados: Alerta[] = [];
  for (const c of ativas(cliente_id)) {
    const atual = metricas.totais({ campanha_id: c.id, inicio: dias(7), fim: dias(1) });
    const anterior = metricas.totais({ campanha_id: c.id, inicio: dias(14), fim: dias(8) });
    if (atual.impressoes < impressoesMinimas || anterior.impressoes < impressoesMinimas) continue;
    if (atual.ctr === null || anterior.ctr === null || anterior.ctr === 0) continue;
    const queda = 1 - atual.ctr / anterior.ctr;
    if (queda >= quedaMinima) {
      const a = alertas.registrar({
        cliente_id: c.cliente_id,
        campanha_id: c.id,
        tipo: "fadiga_criativa",
        severidade: queda >= 0.5 ? "critico" : "atencao",
        mensagem: `CTR de "${c.nome}" caiu ${Math.round(queda * 100)}% (${(anterior.ctr * 100).toFixed(2)}% → ${(atual.ctr * 100).toFixed(2)}%) em 7 dias. Provável fadiga: planeje novos criativos.`,
        dados: { ctr_atual: atual.ctr, ctr_anterior: anterior.ctr, queda },
      });
      if (a) criados.push(a);
    }
  }
  return criados;
}

/**
 * CPA acima da meta. A meta vem de conta.config.cpa_meta ou do config da rotina;
 * sem meta, não há alerta (não inventamos limiar). Exige amostra mínima.
 */
export function checarCpa(cliente_id?: number, cpaMeta?: number, conversoesMinimas = 5): Alerta[] {
  const criados: Alerta[] = [];
  for (const c of ativas(cliente_id)) {
    const metaDaCampanha = Number((c.raw as Record<string, unknown>).cpa_meta ?? 0);
    const meta = cpaMeta ?? (metaDaCampanha > 0 ? metaDaCampanha : undefined);
    if (!meta) continue;
    const t = metricas.totais({ campanha_id: c.id, inicio: dias(7), fim: dias(1) });
    if (t.conversoes < conversoesMinimas || t.cpa === null) continue;
    if (t.cpa > meta * 1.3) {
      const a = alertas.registrar({
        cliente_id: c.cliente_id,
        campanha_id: c.id,
        tipo: "cpa_acima_meta",
        severidade: t.cpa > meta * 2 ? "critico" : "atencao",
        mensagem: `CPA de "${c.nome}" em 7 dias: ${t.cpa.toFixed(2)} (meta ${meta.toFixed(2)}, ${t.conversoes} conversões). Antes de pausar, cheque lag de conversão e rastreamento.`,
        dados: { cpa: t.cpa, meta, conversoes: t.conversoes },
      });
      if (a) criados.push(a);
    }
  }
  return criados;
}

/** Dados parados: nenhuma métrica nos últimos 2 dias para contas ativas. */
export function checarFrescor(): Alerta[] {
  const ultima = metricas.ultimaData();
  if (!ultima) return [];
  const atraso = Math.round((Date.now() - new Date(ultima + "T00:00:00Z").getTime()) / 86_400_000);
  if (atraso <= 2) return [];
  const a = alertas.registrar({
    cliente_id: null,
    campanha_id: null,
    tipo: "dados_desatualizados",
    severidade: atraso > 5 ? "critico" : "atencao",
    mensagem: `Última métrica sincronizada é de ${ultima} (${atraso} dias). Rode a sincronização.`,
    dados: { ultima, atraso },
  });
  return a ? [a] : [];
}

/** Resumo rápido para o dashboard e para o `status` da CLI. */
export function resumoGeral(diasJanela = 7) {
  const fim = dias(0);
  const ini = dias(diasJanela - 1);
  const anterior = { inicio: dias(diasJanela * 2 - 1), fim: dias(diasJanela) };
  const todas = campanhas.listar();
  return {
    janela: { inicio: ini, fim },
    totais: metricas.totais({ inicio: ini, fim }),
    anteriores: metricas.totais(anterior),
    por_dia: metricas.porDia({ inicio: ini, fim }),
    por_plataforma: metricas.porPlataforma({ inicio: ini, fim }),
    por_cliente: metricas.porCliente({ inicio: ini, fim }),
    campanhas: { total: todas.length, ativas: todas.filter((c) => c.status === "ativa").length },
    alertas: alertas.contarAbertos(),
    ultima_metrica: metricas.ultimaData(),
    vazio: todas.length === 0,
  };
}
