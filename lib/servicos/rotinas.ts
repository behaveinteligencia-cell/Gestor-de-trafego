import { agora } from "../db";
import { execucoes, rotinas } from "../repos";
import type { ExecucaoRotina, Rotina, TipoRotina } from "../types";
import { checarCpa, checarFadiga, checarFrescor, checarPacing } from "./analises";
import { gerarRelatorio } from "./relatorios";
import { sincronizar } from "./sync";

/**
 * Rotinas = tarefas recorrentes. A parte determinística roda aqui (sync,
 * checagens, relatório-base). Quando a rotina tem `prompt_claude`, a execução
 * fica "pendente_claude": o Claude Code lê `rotinas devidas`/`execucoes
 * pendentes`, faz a parte dele (análise, texto, decisão) e conclui.
 */

// ---------- cron mínimo (5 campos: min hora dia mês dia-semana) ----------

function casa(campo: string, valor: number, min: number, max: number): boolean {
  return campo.split(",").some((parte) => {
    const [faixa, passoStr] = parte.split("/");
    const passo = passoStr ? Number(passoStr) : 1;
    let ini = min;
    let fim = max;
    if (faixa !== "*") {
      if (faixa.includes("-")) {
        const [a, b] = faixa.split("-").map(Number);
        ini = a;
        fim = b;
      } else {
        ini = fim = Number(faixa);
        if (!passoStr) return valor === ini;
      }
    }
    if (valor < ini || valor > fim) return false;
    return (valor - ini) % passo === 0;
  });
}

export function cronCasa(expr: string, data: Date): boolean {
  const partes = expr.trim().split(/\s+/);
  if (partes.length !== 5) return false;
  const [min, hora, dia, mes, dsem] = partes;
  return (
    casa(min, data.getMinutes(), 0, 59) &&
    casa(hora, data.getHours(), 0, 23) &&
    casa(dia, data.getDate(), 1, 31) &&
    casa(mes, data.getMonth() + 1, 1, 12) &&
    casa(dsem, data.getDay(), 0, 6)
  );
}

/** Próxima ocorrência a partir de `apos` (procura minuto a minuto até 366 dias). */
export function proximaOcorrencia(expr: string, apos = new Date()): Date | null {
  const d = new Date(apos);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  const limite = apos.getTime() + 366 * 86_400_000;
  while (d.getTime() < limite) {
    if (cronCasa(expr, d)) return new Date(d);
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}

export function descreverCron(expr: string): string {
  const [min, hora, dia, mes, dsem] = expr.trim().split(/\s+/);
  const semana: Record<string, string> = { "0": "dom", "1": "seg", "2": "ter", "3": "qua", "4": "qui", "5": "sex", "6": "sáb" };
  const hh = hora.includes("*") ? null : `${hora.padStart(2, "0")}:${min.padStart(2, "0")}`;
  if (hh && dsem === "*" && dia === "*" && mes === "*") return `todo dia às ${hh}`;
  if (hh && dsem === "1-5" && dia === "*") return `dias úteis às ${hh}`;
  if (hh && dia === "*" && dsem !== "*") return `${dsem.split(",").map((d) => semana[d] ?? d).join(", ")} às ${hh}`;
  if (hh && dia !== "*" && dsem === "*") return `dia ${dia} de cada mês às ${hh}`;
  if (hora.startsWith("*/")) return `a cada ${hora.slice(2)}h`;
  return expr;
}

// ---------- execução ----------

export function rotinasDevidas(agoraData = new Date()): Rotina[] {
  return rotinas.listar().filter((r) => {
    if (!r.ativa) return false;
    if (!r.proxima_execucao) return true; // nunca rodou: deve rodar
    return new Date(r.proxima_execucao.replace(" ", "T")).getTime() <= agoraData.getTime();
  });
}

export async function executarRotina(rotina: Rotina): Promise<ExecucaoRotina> {
  const exec = execucoes.iniciar(rotina.id);
  const resultado: Record<string, unknown> = { tipo: rotina.tipo };
  let status: ExecucaoRotina["status"] = "ok";
  let erro: string | null = null;
  const cliente_id = rotina.cliente_id ?? undefined;
  const cfg = rotina.config;
  try {
    switch (rotina.tipo as TipoRotina) {
      case "sync": {
        const r = await sincronizar({ cliente_id, dias: Number(cfg.dias ?? 7) });
        resultado.contas = r.map((x) => ({ conta: x.conta.nome, campanhas: x.campanhas, metricas: x.metricas, erro: x.erro }));
        if (r.some((x) => x.erro)) status = "erro";
        break;
      }
      case "pacing":
        resultado.alertas = checarPacing(cliente_id, Number(cfg.tolerancia ?? 0.25)).map((a) => a.mensagem);
        resultado.frescor = checarFrescor().map((a) => a.mensagem);
        break;
      case "fadiga_criativa":
        resultado.alertas = checarFadiga(cliente_id, Number(cfg.queda_minima ?? 0.3)).map((a) => a.mensagem);
        break;
      case "alerta_cpa":
        resultado.alertas = checarCpa(cliente_id, cfg.cpa_meta ? Number(cfg.cpa_meta) : undefined).map((a) => a.mensagem);
        break;
      case "relatorio_semanal":
      case "relatorio_mensal": {
        const hoje = new Date();
        const fim = new Date(hoje.getTime() - 86_400_000).toISOString().slice(0, 10);
        const dias = rotina.tipo === "relatorio_semanal" ? 7 : 30;
        const inicio = new Date(hoje.getTime() - dias * 86_400_000).toISOString().slice(0, 10);
        const rel = gerarRelatorio({
          cliente_id: rotina.cliente_id,
          inicio,
          fim,
          tipo: rotina.tipo === "relatorio_semanal" ? "semanal" : "mensal",
        });
        resultado.relatorio_id = rel.id;
        resultado.titulo = rel.titulo;
        break;
      }
      case "auditoria":
      case "personalizada":
        // Inteiramente do Claude: fica pendente com o prompt.
        break;
    }
    if (rotina.prompt_claude?.trim()) {
      status = status === "erro" ? "erro" : "pendente_claude";
      resultado.prompt_claude = rotina.prompt_claude;
    }
  } catch (e) {
    status = "erro";
    erro = e instanceof Error ? e.message : String(e);
  }
  const prox = proximaOcorrencia(rotina.agenda);
  rotinas.atualizar(rotina.id, {
    ultima_execucao: agora(),
    proxima_execucao: prox ? prox.toISOString().replace("T", " ").slice(0, 19) : null,
  });
  return execucoes.finalizar(exec.id, status, resultado, erro);
}

export async function executarDevidas(): Promise<ExecucaoRotina[]> {
  const saida: ExecucaoRotina[] = [];
  for (const r of rotinasDevidas()) saida.push(await executarRotina(r));
  return saida;
}

export function concluirExecucaoClaude(id: number, resumo: string): ExecucaoRotina {
  const e = execucoes.porId(id);
  if (!e) throw new Error(`Execução ${id} não existe.`);
  return execucoes.finalizar(id, "ok", { ...e.resultado, conclusao_claude: resumo });
}

/** Rotinas sugeridas no primeiro uso. */
export const ROTINAS_PADRAO: Array<Omit<Rotina, "id" | "ultima_execucao" | "proxima_execucao">> = [
  {
    nome: "Sincronização diária",
    descricao: "Puxa campanhas e métricas dos últimos 7 dias de todas as contas ativas.",
    tipo: "sync",
    agenda: "0 6 * * *",
    ativa: true,
    cliente_id: null,
    config: { dias: 7 },
    prompt_claude: null,
  },
  {
    nome: "Pacing e entrega",
    descricao: "Compara gasto real dos últimos 7 dias com o orçamento esperado e marca sub/sobreentrega.",
    tipo: "pacing",
    agenda: "30 8 * * 1-5",
    ativa: true,
    cliente_id: null,
    config: { tolerancia: 0.25 },
    prompt_claude: "Leia os alertas abertos de pacing (npm run gestor -- alertas listar --abertos --json) e, para cada um, explique a causa provável e proponha a ação com motivo. Não pause nada sem aprovação.",
  },
  {
    nome: "Fadiga criativa",
    descricao: "Detecta queda de CTR ≥ 30% semana contra semana.",
    tipo: "fadiga_criativa",
    agenda: "0 9 * * 1,4",
    ativa: true,
    cliente_id: null,
    config: { queda_minima: 0.3 },
    prompt_claude: "Para cada alerta de fadiga, use a skill trafego-criativos e proponha 3 novos ângulos de criativo para a campanha afetada.",
  },
  {
    nome: "Relatório semanal",
    descricao: "Gera o relatório-base dos últimos 7 dias; o Claude escreve a análise.",
    tipo: "relatorio_semanal",
    agenda: "0 7 * * 1",
    ativa: true,
    cliente_id: null,
    config: {},
    prompt_claude: "Abra o relatório gerado (relatorios ver <id> --md), escreva a análise executiva com a skill trafego-relatorio e regenere com --analise.",
  },
];
