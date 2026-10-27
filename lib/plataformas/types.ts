import type {
  Campanha,
  Conta,
  EspecificacaoCampanha,
  MetricaDiaria,
  Plataforma,
  StatusCampanha,
} from "../types";

/**
 * Contrato que todo adaptador de plataforma implementa.
 *
 * Leitura (listar campanhas, métricas) é sempre permitida quando há credencial.
 * Escrita (criar, pausar, ativar, alterar orçamento) só é chamada pelo serviço
 * de publicação depois do portão de aprovação — o adaptador nunca decide isso.
 * Exclusão permanente não existe neste contrato, de propósito.
 */

export type CampanhaRemota = Omit<Campanha, "id" | "conta_id" | "sincronizada_em">;

export type MetricaRemota = Omit<MetricaDiaria, "id" | "campanha_id"> & {
  campanha_external_id: string;
};

export interface Credenciais {
  /** Mapa variável-de-ambiente → presente?; nunca o valor. */
  presentes: Record<string, boolean>;
  completas: boolean;
}

export interface ResultadoCriacao {
  external_id: string;
  status: StatusCampanha;
  /** Objetos secundários criados (conjuntos, anúncios, grupos). */
  filhos: Array<{ tipo: string; external_id: string; nome: string }>;
  raw: Record<string, unknown>;
}

export interface ResultadoValidacao {
  ok: boolean;
  erros: string[];
  avisos: string[];
}

export interface AdaptadorPlataforma {
  plataforma: Plataforma;
  /** Diz quais variáveis de ambiente a plataforma exige e se estão presentes. */
  credenciais(conta?: Conta): Credenciais;
  /** Checa a spec contra os limites da plataforma (sem chamar a API). */
  validarSpec(spec: EspecificacaoCampanha, conta: Conta): ResultadoValidacao;

  listarCampanhas(conta: Conta): Promise<CampanhaRemota[]>;
  metricasDiarias(conta: Conta, inicio: string, fim: string): Promise<MetricaRemota[]>;

  criarCampanha(conta: Conta, spec: EspecificacaoCampanha, idempotencia: string): Promise<ResultadoCriacao>;
  alterarStatus(conta: Conta, external_id: string, status: "ativa" | "pausada"): Promise<void>;
  alterarOrcamentoDiario(conta: Conta, external_id: string, valor: number): Promise<void>;
}

export class ErroPlataforma extends Error {
  constructor(
    public plataforma: Plataforma,
    message: string,
    public detalhes?: unknown,
  ) {
    super(`[${plataforma}] ${message}`);
  }
}

/** Utilitário comum: fetch com timeout e erro legível. */
export async function requisicao<T>(
  plataforma: Plataforma,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 30_000);
  try {
    const resp = await fetch(url, { ...init, signal: ctrl.signal });
    const texto = await resp.text();
    let corpo: unknown = texto;
    try {
      corpo = JSON.parse(texto);
    } catch {
      /* mantém texto */
    }
    if (!resp.ok) {
      throw new ErroPlataforma(plataforma, `HTTP ${resp.status} em ${url.split("?")[0]}`, corpo);
    }
    return corpo as T;
  } finally {
    clearTimeout(timer);
  }
}

export function env(nome: string): string | undefined {
  const v = process.env[nome];
  return v && v.trim() ? v.trim() : undefined;
}

export function presencas(nomes: string[]): Credenciais {
  const presentes: Record<string, boolean> = {};
  for (const n of nomes) presentes[n] = Boolean(env(n));
  return { presentes, completas: nomes.every((n) => presentes[n]) };
}

/** Validações comuns a todas as plataformas. */
export function validarSpecBasica(spec: EspecificacaoCampanha): ResultadoValidacao {
  const erros: string[] = [];
  const avisos: string[] = [];
  if (!spec.nome?.trim()) erros.push("Campanha sem nome.");
  if (!spec.objetivo) erros.push("Campanha sem objetivo.");
  if (!spec.orcamento_diario && !spec.orcamento_total) erros.push("Defina orçamento diário ou total.");
  if (!spec.teto_gasto_diario || spec.teto_gasto_diario <= 0) {
    erros.push("teto_gasto_diario obrigatório: sem teto aprovado, nada é publicado.");
  } else if (spec.orcamento_diario && spec.orcamento_diario > spec.teto_gasto_diario) {
    erros.push(
      `Orçamento diário (${spec.orcamento_diario}) acima do teto aprovado (${spec.teto_gasto_diario}).`,
    );
  }
  if (!spec.anuncios?.length) erros.push("Campanha sem anúncios.");
  for (const [i, a] of (spec.anuncios ?? []).entries()) {
    if (!a.url_destino && a.formato !== "texto") avisos.push(`Anúncio ${i + 1} (${a.nome}) sem url_destino.`);
    if (!a.utm) avisos.push(`Anúncio ${i + 1} (${a.nome}) sem UTM — a atribuição no GA4 fica cega.`);
  }
  if (!spec.publico?.localizacoes?.length) avisos.push("Público sem localização definida.");
  if (!spec.conversao?.evento && ["leads", "vendas"].includes(spec.objetivo)) {
    avisos.push("Objetivo de conversão sem evento de conversão definido.");
  }
  if (spec.inicio && spec.fim && spec.fim < spec.inicio) erros.push("Data de fim anterior ao início.");
  return { ok: erros.length === 0, erros, avisos };
}
