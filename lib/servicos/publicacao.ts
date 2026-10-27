import { createHash } from "node:crypto";
import { agora } from "../db";
import { adaptador } from "../plataformas";
import { campanhas, contas, log, rascunhos, type RascunhoComContexto } from "../repos";
import type { EspecificacaoCampanha } from "../types";

/**
 * Portão de mutação. Um rascunho só vira campanha de verdade quando:
 *   1. a validação passa (spec coerente + limites da plataforma + teto),
 *   2. alguém aprovou explicitamente (nome registrado),
 *   3. as credenciais da plataforma estão presentes.
 * A campanha nasce PAUSADA. Ativar é outra ação, com motivo, registrada no log.
 */

export class ErroPublicacao extends Error {}

export function validarRascunho(id: number): RascunhoComContexto {
  const r = rascunhos.porId(id);
  if (!r) throw new ErroPublicacao(`Rascunho ${id} não existe.`);
  const conta = contas.porId(r.conta_id);
  if (!conta) throw new ErroPublicacao(`Conta ${r.conta_id} do rascunho não existe.`);
  const validacao = adaptador(r.plataforma, conta).validarSpec(r.spec, conta);
  const status = r.status === "rascunho" || r.status === "em_revisao" ? (validacao.ok ? "em_revisao" : "rascunho") : r.status;
  return rascunhos.atualizar(id, { validacao, status })!;
}

export function aprovarRascunho(id: number, aprovadoPor: string): RascunhoComContexto {
  if (!aprovadoPor?.trim()) throw new ErroPublicacao("Informe quem está aprovando (--por \"Nome\").");
  const r = validarRascunho(id);
  if (!r.validacao?.ok) {
    throw new ErroPublicacao(`Rascunho ${id} não passa na validação: ${r.validacao?.erros.join(" | ")}`);
  }
  if (r.status === "publicado") throw new ErroPublicacao(`Rascunho ${id} já foi publicado.`);
  const atualizado = rascunhos.atualizar(id, { status: "aprovado", aprovado_por: aprovadoPor.trim(), aprovado_em: agora() })!;
  log.registrar({ tipo: "rascunho.aprovar", alvo: `rascunho:${id}`, depois: { aprovado_por: aprovadoPor }, autor: aprovadoPor });
  return atualizado;
}

export function chaveIdempotencia(r: RascunhoComContexto): string {
  return createHash("sha256").update(`${r.id}:${r.conta_id}:${JSON.stringify(r.spec)}`).digest("hex");
}

export async function publicarRascunho(id: number): Promise<RascunhoComContexto> {
  const r = rascunhos.porId(id);
  if (!r) throw new ErroPublicacao(`Rascunho ${id} não existe.`);
  if (r.status === "publicado") throw new ErroPublicacao(`Rascunho ${id} já foi publicado (campanha ${r.external_id}).`);
  if (r.status !== "aprovado") {
    throw new ErroPublicacao(`Rascunho ${id} está em "${r.status}". Só rascunhos aprovados são publicados.`);
  }
  const conta = contas.porId(r.conta_id)!;
  const ad = adaptador(r.plataforma, conta);
  const cred = ad.credenciais(conta);
  if (!cred.completas) {
    const faltam = Object.entries(cred.presentes)
      .filter(([, ok]) => !ok)
      .map(([n]) => n);
    throw new ErroPublicacao(`Credenciais ausentes para ${r.plataforma}: ${faltam.join(", ")}. Defina em .env.local.`);
  }
  // Revalida na hora: a spec pode ter mudado depois da aprovação.
  const validacao = ad.validarSpec(r.spec, conta);
  if (!validacao.ok) {
    rascunhos.atualizar(id, { validacao, status: "rascunho", aprovado_por: null, aprovado_em: null });
    throw new ErroPublicacao(`Validação falhou na publicação; aprovação anulada: ${validacao.erros.join(" | ")}`);
  }
  try {
    const resultado = await ad.criarCampanha(conta, r.spec, chaveIdempotencia(r));
    campanhas.upsert(conta.id, {
      plataforma: r.plataforma,
      external_id: resultado.external_id,
      nome: r.spec.nome,
      status: resultado.status,
      objetivo: r.spec.objetivo,
      orcamento_diario: r.spec.orcamento_diario ?? null,
      orcamento_total: r.spec.orcamento_total ?? null,
      inicio: r.spec.inicio ?? null,
      fim: r.spec.fim ?? null,
      raw: { ...resultado.raw, filhos: resultado.filhos, rascunho_id: r.id },
    });
    const atualizado = rascunhos.atualizar(id, {
      status: "publicado",
      external_id: resultado.external_id,
      publicado_em: agora(),
      erro: null,
    })!;
    log.registrar({
      tipo: "rascunho.publicar",
      alvo: `rascunho:${id}`,
      depois: { external_id: resultado.external_id, status: resultado.status, filhos: resultado.filhos },
    });
    return atualizado;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    rascunhos.atualizar(id, { status: "erro", erro: msg });
    log.registrar({ tipo: "rascunho.publicar.erro", alvo: `rascunho:${id}`, depois: { erro: msg } });
    throw new ErroPublicacao(msg);
  }
}

export function cancelarRascunho(id: number): RascunhoComContexto {
  const r = rascunhos.porId(id);
  if (!r) throw new ErroPublicacao(`Rascunho ${id} não existe.`);
  if (r.status === "publicado") throw new ErroPublicacao("Rascunho publicado não pode ser cancelado; pause a campanha.");
  return rascunhos.atualizar(id, { status: "cancelado" })!;
}

export function criarRascunho(dados: { cliente_id: number; conta_id: number; spec: EspecificacaoCampanha }): RascunhoComContexto {
  const conta = contas.porId(dados.conta_id);
  if (!conta) throw new ErroPublicacao(`Conta ${dados.conta_id} não existe.`);
  if (conta.cliente_id !== dados.cliente_id) throw new ErroPublicacao("A conta não pertence a esse cliente.");
  const r = rascunhos.criar({ cliente_id: dados.cliente_id, conta_id: conta.id, plataforma: conta.plataforma, spec: dados.spec });
  log.registrar({ tipo: "rascunho.criar", alvo: `rascunho:${r.id}`, depois: { nome: dados.spec.nome, plataforma: conta.plataforma } });
  return validarRascunho(r.id);
}

// ---------- Ações diretas em campanhas existentes ----------

export async function alterarStatusCampanha(id: number, status: "ativa" | "pausada", motivo: string, autor?: string) {
  if (!motivo?.trim()) throw new ErroPublicacao("Toda mudança de status exige --motivo.");
  const c = campanhas.porId(id);
  if (!c) throw new ErroPublicacao(`Campanha ${id} não existe.`);
  const conta = contas.porId(c.conta_id)!;
  await adaptador(c.plataforma, conta).alterarStatus(conta, c.external_id, status);
  campanhas.atualizarStatusLocal(id, status);
  log.registrar({
    tipo: `campanha.${status === "ativa" ? "ativar" : "pausar"}`,
    alvo: `campanha:${id}`,
    antes: { status: c.status },
    depois: { status, motivo },
    autor,
  });
  return campanhas.porId(id)!;
}

export async function alterarOrcamentoCampanha(id: number, valor: number, motivo: string, autor?: string, forcar = false) {
  if (!motivo?.trim()) throw new ErroPublicacao("Toda mudança de orçamento exige --motivo.");
  if (!(valor > 0)) throw new ErroPublicacao("Orçamento deve ser maior que zero.");
  const c = campanhas.porId(id);
  if (!c) throw new ErroPublicacao(`Campanha ${id} não existe.`);
  const conta = contas.porId(c.conta_id)!;
  const teto = Number(conta.config.teto_gasto_diario ?? 0);
  if (teto > 0 && valor > teto) {
    throw new ErroPublicacao(`Valor ${valor} acima do teto diário da conta (${teto}). Ajuste o teto na conta antes.`);
  }
  const anterior = c.orcamento_diario;
  if (!forcar && anterior && valor > anterior * 1.5) {
    throw new ErroPublicacao(
      `Aumento de ${Math.round((valor / anterior - 1) * 100)}% de uma vez reinicia a fase de aprendizado. Faça em passos ≤ 50% ou confirme com --forcar.`,
    );
  }
  await adaptador(c.plataforma, conta).alterarOrcamentoDiario(conta, c.external_id, valor);
  campanhas.atualizarOrcamentoLocal(id, valor);
  log.registrar({
    tipo: "campanha.orcamento",
    alvo: `campanha:${id}`,
    antes: { orcamento_diario: anterior },
    depois: { orcamento_diario: valor, motivo },
    autor,
  });
  return campanhas.porId(id)!;
}
