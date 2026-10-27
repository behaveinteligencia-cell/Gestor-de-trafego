import type { Conta, EspecificacaoCampanha, Objetivo, StatusCampanha } from "../types";
import {
  type AdaptadorPlataforma,
  type CampanhaRemota,
  type MetricaRemota,
  type ResultadoCriacao,
  type ResultadoValidacao,
  ErroPlataforma,
  env,
  presencas,
  requisicao,
  validarSpecBasica,
} from "./types";

/**
 * Adaptador real do LinkedIn Marketing API (REST versionado).
 *
 * Credenciais só por variável de ambiente:
 *   LINKEDIN_ACCESS_TOKEN (obrigatória) — token OAuth 2.0 com r_ads, rw_ads, r_ads_reporting.
 *   LINKEDIN_API_VERSION  (opcional)    — header LinkedIn-Version, padrão 202510.
 *
 * `conta.account_id` é o id numérico da ad account (URN urn:li:sponsoredAccount:{id}).
 * `conta.config.campaign_group_urn` é obrigatório para criar campanhas.
 * `conta.config.geo_urns` (lista de `urn:li:geo:NNN`) é usado na segmentação;
 * sem ele a localização vira pendência (não inventamos URNs).
 *
 * Valores monetários vêm como string na moeda da conta (`dailyBudget.amount`).
 */

const VARIAVEIS = ["LINKEDIN_ACCESS_TOKEN"];
const BASE = "https://api.linkedin.com/rest";

function versao(): string {
  return env("LINKEDIN_API_VERSION") ?? "202510";
}

function exigirToken(): string {
  const cred = presencas(VARIAVEIS);
  if (!cred.completas) {
    const faltam = Object.entries(cred.presentes)
      .filter(([, ok]) => !ok)
      .map(([n]) => n);
    throw new ErroPlataforma("linkedin", `Credenciais ausentes: defina ${faltam.join(", ")} no ambiente.`);
  }
  return env("LINKEDIN_ACCESS_TOKEN") as string;
}

function contaId(conta: Conta): string {
  const id = conta.account_id.replace(/^urn:li:sponsoredAccount:/, "").trim();
  if (!/^\d+$/.test(id)) {
    throw new ErroPlataforma("linkedin", `account_id inválido para LinkedIn: "${conta.account_id}" (esperado id numérico da ad account).`);
  }
  return id;
}

function contaUrn(conta: Conta): string {
  return `urn:li:sponsoredAccount:${contaId(conta)}`;
}

function campanhaId(external_id: string): string {
  return external_id.replace(/^urn:li:sponsoredCampaign:/, "").trim();
}

function campanhaUrn(external_id: string): string {
  return `urn:li:sponsoredCampaign:${campanhaId(external_id)}`;
}

// ---------- utilitários de narrowing ----------

function obj(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function lista(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function cabecalhos(extras: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${exigirToken()}`,
    "LinkedIn-Version": versao(),
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
    ...extras,
  };
}

function traduzirErro(e: unknown, contexto: string): never {
  if (e instanceof ErroPlataforma) {
    const corpo = obj(e.detalhes);
    const msg = str(corpo?.message);
    if (msg) {
      throw new ErroPlataforma(
        "linkedin",
        `LinkedIn recusou ${contexto} (${str(corpo?.status) ?? str(corpo?.code) ?? "?"}): ${msg}`,
        e.detalhes,
      );
    }
    throw e;
  }
  if (e instanceof Error) throw new ErroPlataforma("linkedin", e.message, e);
  throw new ErroPlataforma("linkedin", String(e));
}

// ---------- chamadas ----------

async function get(caminhoComQuery: string): Promise<Record<string, unknown>> {
  let resposta: unknown;
  try {
    resposta = await requisicao<unknown>("linkedin", `${BASE}/${caminhoComQuery.replace(/^\//, "")}`, {
      headers: cabecalhos(),
      timeoutMs: 60_000,
    });
  } catch (e) {
    traduzirErro(e, caminhoComQuery.split("?")[0]);
  }
  return obj(resposta) ?? {};
}

async function post(caminho: string, corpo: Record<string, unknown>, extras: Record<string, string> = {}): Promise<unknown> {
  try {
    return await requisicao<unknown>("linkedin", `${BASE}/${caminho.replace(/^\//, "")}`, {
      method: "POST",
      headers: cabecalhos(extras),
      body: JSON.stringify(corpo),
      timeoutMs: 60_000,
    });
  } catch (e) {
    traduzirErro(e, caminho);
  }
}

/**
 * POST de criação: o id do recurso criado vem no header `x-restli-id`
 * (ou `x-linkedin-id`), que `requisicao` não expõe — por isso usamos o fetch
 * nativo diretamente aqui, com o mesmo timeout e tratamento de erro.
 */
async function postCriar(caminho: string, corpo: Record<string, unknown>): Promise<{ id: string | null; corpo: unknown }> {
  const url = `${BASE}/${caminho.replace(/^\//, "")}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: cabecalhos(),
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
    });
    const texto = await resp.text();
    let parsed: unknown = texto;
    try {
      parsed = JSON.parse(texto);
    } catch {
      /* mantém texto */
    }
    if (!resp.ok) {
      traduzirErro(new ErroPlataforma("linkedin", `HTTP ${resp.status} em ${url}`, parsed), caminho);
    }
    const id = resp.headers.get("x-restli-id") ?? resp.headers.get("x-linkedin-id");
    return { id: id ? campanhaId(id) : null, corpo: parsed };
  } finally {
    clearTimeout(timer);
  }
}

/** Lista todas as campanhas da conta, seguindo `metadata.nextPageToken`. */
async function listarTodas(conta: Conta): Promise<Record<string, unknown>[]> {
  const saida: Record<string, unknown>[] = [];
  let token: string | null = null;
  for (let i = 0; i < 200; i++) {
    const query = new URLSearchParams({ q: "search", pageSize: "100" });
    if (token) query.set("pageToken", token);
    const data = await get(`adAccounts/${contaId(conta)}/adCampaigns?${query.toString()}`);
    const elementos = lista(data.elements);
    for (const el of elementos) {
      const o = obj(el);
      if (o) saida.push(o);
    }
    const proximo = str(obj(data.metadata)?.nextPageToken);
    if (!proximo || !elementos.length) break;
    token = proximo;
  }
  return saida;
}

// ---------- mapeamentos ----------

function mapearStatus(s: string | null): StatusCampanha {
  switch ((s ?? "").toUpperCase()) {
    case "ACTIVE":
      return "ativa";
    case "PAUSED":
      return "pausada";
    case "ARCHIVED":
    case "COMPLETED":
    case "CANCELED":
    case "CANCELLED":
    case "PENDING_DELETION":
    case "REMOVED":
      return "encerrada";
    case "DRAFT":
      return "rascunho";
    default:
      return "desconhecido";
  }
}

/** Objetivos sem equivalente em Sponsored Content ficam como null. */
const OBJETIVO_PARA_LINKEDIN: Record<Objetivo, string | null> = {
  reconhecimento: "BRAND_AWARENESS",
  trafego: "WEBSITE_VISIT",
  engajamento: "ENGAGEMENT",
  leads: "LEAD_GENERATION",
  vendas: "WEBSITE_CONVERSION",
  mensagens: null,
  instalacao_app: null,
  visualizacao_video: "VIDEO_VIEW",
};

function mapearObjetivo(nativo: string | null): Objetivo | null {
  switch ((nativo ?? "").toUpperCase()) {
    case "BRAND_AWARENESS":
      return "reconhecimento";
    case "WEBSITE_VISIT":
    case "WEBSITE_VISITS":
      return "trafego";
    case "ENGAGEMENT":
      return "engajamento";
    case "VIDEO_VIEW":
    case "VIDEO_VIEWS":
      return "visualizacao_video";
    case "LEAD_GENERATION":
      return "leads";
    case "WEBSITE_CONVERSION":
    case "WEBSITE_CONVERSIONS":
      return "vendas";
    default:
      return null;
  }
}

/** Tipo de custo e alvo de otimização por objetivo (lance automático). */
function planoLance(objetivo: Objetivo): { costType: string; optimizationTargetType: string } {
  switch (objetivo) {
    case "reconhecimento":
      return { costType: "CPM", optimizationTargetType: "MAX_IMPRESSION" };
    case "trafego":
    case "engajamento":
      return { costType: "CPC", optimizationTargetType: "MAX_CLICK" };
    case "leads":
      return { costType: "CPM", optimizationTargetType: "MAX_LEAD" };
    case "vendas":
      return { costType: "CPM", optimizationTargetType: "MAX_CONVERSION" };
    case "visualizacao_video":
      return { costType: "CPV", optimizationTargetType: "MAX_VIDEO_VIEW" };
    default:
      return { costType: "CPM", optimizationTargetType: "MAX_IMPRESSION" };
  }
}

function dataLinkedIn(d: string): string {
  // "2026-01-05" → "(year:2026,month:1,day:5)"
  const [a, m, dia] = d.slice(0, 10).split("-").map((x) => Number(x));
  return `(year:${a},month:${m},day:${dia})`;
}

function dataDeObjeto(v: unknown): string | null {
  const o = obj(v);
  if (!o) return null;
  const a = num(o.year);
  const m = num(o.month);
  const d = num(o.day);
  if (!a || !m || !d) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function epochParaData(v: unknown): string | null {
  const n = num(v);
  if (!n) return null;
  return new Date(n).toISOString().slice(0, 10);
}

function valorMoeda(v: unknown): number | null {
  const o = obj(v);
  if (!o) return null;
  const s = str(o.amount);
  if (s === null || s === "") return null;
  return num(s);
}

function dividir<T>(itens: T[], tamanho: number): T[][] {
  const saida: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) saida.push(itens.slice(i, i + tamanho));
  return saida;
}

// ---------- adaptador ----------

export const adaptadorLinkedIn: AdaptadorPlataforma = {
  plataforma: "linkedin",

  credenciais() {
    return presencas(VARIAVEIS);
  },

  validarSpec(spec: EspecificacaoCampanha, conta: Conta): ResultadoValidacao {
    const r = validarSpecBasica(spec);
    if (OBJETIVO_PARA_LINKEDIN[spec.objetivo] === null) {
      r.erros.push(`Objetivo '${spec.objetivo}' não tem equivalente em Sponsored Content no LinkedIn.`);
    }
    if (!spec.orcamento_diario) {
      r.erros.push("LinkedIn: este adaptador cria campanhas com dailyBudget; informe orcamento_diario.");
    } else if (spec.orcamento_diario < 10) {
      r.avisos.push(`Orçamento diário ${spec.orcamento_diario} abaixo do mínimo usual do LinkedIn (US$ 10/dia ou equivalente).`);
    }
    for (const [i, a] of spec.anuncios.entries()) {
      const rotulo = `Anúncio ${i + 1} (${a.nome})`;
      for (const t of ([] as string[]).concat(a.titulo ?? [])) {
        if (t.length > 70) r.avisos.push(`${rotulo}: título com ${t.length} caracteres (recomendado ≤ 70; acima disso é truncado).`);
      }
      for (const t of ([] as string[]).concat(a.texto_principal ?? [])) {
        if (t.length > 150) r.avisos.push(`${rotulo}: texto introdutório com ${t.length} caracteres (recomendado ≤ 150).`);
      }
      if (a.formato === "texto" || a.formato === "responsivo") {
        r.avisos.push(`${rotulo}: formato '${a.formato}' não existe em Sponsored Content; use imagem, vídeo ou carrossel.`);
      }
    }
    if (!str(conta.config.campaign_group_urn)) {
      r.erros.push("conta.config.campaign_group_urn ausente: o LinkedIn exige um grupo de campanhas (urn:li:sponsoredCampaignGroup:ID).");
    }
    if (!lista(conta.config.geo_urns).length) {
      r.avisos.push("conta.config.geo_urns ausente: a segmentação de localização ficará como pendência e a campanha será criada como DRAFT.");
    }
    r.avisos.push("Criativos (anúncios) não são criados via API neste adaptador; ficam como pendência.");
    r.ok = r.erros.length === 0;
    return r;
  },

  async listarCampanhas(conta: Conta): Promise<CampanhaRemota[]> {
    const linhas = await listarTodas(conta);
    return linhas.map((c) => {
      const agenda = obj(c.runSchedule);
      return {
        plataforma: "linkedin" as const,
        external_id: str(c.id) ?? "",
        nome: str(c.name) ?? "",
        status: mapearStatus(str(c.status)),
        objetivo: mapearObjetivo(str(c.objectiveType)),
        orcamento_diario: valorMoeda(c.dailyBudget),
        orcamento_total: valorMoeda(c.totalBudget),
        inicio: epochParaData(agenda?.start),
        fim: epochParaData(agenda?.end),
        raw: c,
      };
    });
  },

  async metricasDiarias(conta: Conta, inicio: string, fim: string): Promise<MetricaRemota[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
      throw new ErroPlataforma("linkedin", `Período inválido: ${inicio} → ${fim} (use YYYY-MM-DD).`);
    }
    const campanhas = await listarTodas(conta);
    const urns = campanhas.map((c) => str(c.id)).filter((id): id is string => Boolean(id)).map((id) => campanhaUrn(id));
    const saida: MetricaRemota[] = [];
    const campos = [
      "impressions",
      "clicks",
      "costInLocalCurrency",
      "externalWebsiteConversions",
      "conversionValueInLocalCurrency",
      "dateRange",
      "pivotValues",
    ].join(",");
    // O finder aceita um número limitado de campanhas por chamada; dividimos em lotes.
    for (const lote of dividir(urns, 20)) {
      const listaUrns = `List(${lote.map((u) => encodeURIComponent(u)).join(",")})`;
      const query =
        `q=analytics&pivot=CAMPAIGN&timeGranularity=DAILY` +
        `&dateRange=(start:${dataLinkedIn(inicio)},end:${dataLinkedIn(fim)})` +
        `&campaigns=${listaUrns}&fields=${campos}`;
      const data = await get(`adAnalytics?${query}`);
      for (const el of lista(data.elements)) {
        const e = obj(el);
        if (!e) continue;
        const pivo = lista(e.pivotValues).map((p) => str(p)).find((p) => p && p.startsWith("urn:li:sponsoredCampaign:"));
        if (!pivo) continue;
        saida.push({
          campanha_external_id: campanhaId(pivo),
          data: dataDeObjeto(obj(e.dateRange)?.start) ?? inicio,
          impressoes: num(e.impressions),
          cliques: num(e.clicks),
          gasto: num(e.costInLocalCurrency),
          conversoes: num(e.externalWebsiteConversions),
          valor_conversao: num(e.conversionValueInLocalCurrency),
          alcance: 0, // alcance aproximado não é devolvido com granularidade diária.
          raw: e,
        });
      }
    }
    return saida;
  },

  async criarCampanha(conta: Conta, spec: EspecificacaoCampanha, idempotencia: string): Promise<ResultadoCriacao> {
    exigirToken();
    const grupo = str(conta.config.campaign_group_urn);
    if (!grupo) {
      throw new ErroPlataforma(
        "linkedin",
        "O LinkedIn exige um grupo de campanhas para criar campanhas. Informe conta.config.campaign_group_urn (urn:li:sponsoredCampaignGroup:ID) — este adaptador não cria grupos nem inventa URNs.",
      );
    }
    const validacao = this.validarSpec(spec, conta);
    if (!validacao.ok) {
      throw new ErroPlataforma("linkedin", `Spec inválida: ${validacao.erros.join(" | ")}`);
    }
    const objetivo = OBJETIVO_PARA_LINKEDIN[spec.objetivo];
    if (!objetivo) throw new ErroPlataforma("linkedin", `Objetivo '${spec.objetivo}' não suportado no LinkedIn.`);

    // Idempotência: a API não tem chave; evitamos duplicar por nome.
    const existentes = await listarTodas(conta);
    const duplicada = existentes.find(
      (c) => str(c.name) === spec.nome && !["ARCHIVED", "CANCELED", "PENDING_DELETION"].includes((str(c.status) ?? "").toUpperCase()),
    );
    if (duplicada) {
      throw new ErroPlataforma(
        "linkedin",
        `Já existe campanha "${spec.nome}" nesta conta (id ${str(duplicada.id)}); não será duplicada.`,
        { existente: duplicada, idempotencia },
      );
    }

    const pendencias: string[] = [];
    const geoUrns = lista(conta.config.geo_urns).map((g) => str(g)).filter((g): g is string => Boolean(g && g.startsWith("urn:li:geo:")));
    const temTargeting = geoUrns.length > 0;
    const paises = (spec.publico.localizacoes ?? []).filter((l) => /^[A-Za-z]{2}$/.test(l.trim()));
    const pais = (paises[0] ?? "BR").toUpperCase();
    const idioma = str(conta.config.idioma) ?? (pais === "BR" || pais === "PT" ? "pt" : "en");
    const agora = Date.now();
    const inicioMs = spec.inicio ? new Date(`${spec.inicio}T00:00:00`).getTime() : agora;
    const runSchedule: Record<string, unknown> = { start: Math.max(inicioMs, agora + 60_000) };
    if (spec.fim) runSchedule.end = new Date(`${spec.fim}T23:59:59`).getTime();
    const lance = planoLance(spec.objetivo);

    const corpo: Record<string, unknown> = {
      account: contaUrn(conta),
      campaignGroup: grupo,
      name: spec.nome,
      type: "SPONSORED_UPDATES",
      objectiveType: objetivo,
      // Sem segmentação não há como ficar PAUSED válida: fica DRAFT até preencher a localização.
      status: temTargeting ? "PAUSED" : "DRAFT",
      dailyBudget: { amount: String(spec.orcamento_diario), currencyCode: (conta.moeda || "USD").toUpperCase() },
      locale: { country: pais, language: idioma },
      costType: lance.costType,
      optimizationTargetType: lance.optimizationTargetType,
      runSchedule,
      audienceExpansionEnabled: false,
      offsiteDeliveryEnabled: false,
    };
    if (spec.lance?.valor) {
      corpo.unitCost = { amount: String(spec.lance.valor), currencyCode: (conta.moeda || "USD").toUpperCase() };
    }
    if (temTargeting) {
      corpo.targetingCriteria = {
        include: { and: [{ or: { "urn:li:adTargetingFacet:locations": geoUrns } }] },
      };
    } else {
      pendencias.push(
        `Localização (${(spec.publico.localizacoes ?? []).join(", ") || "não informada"}) não aplicada: informe conta.config.geo_urns (urn:li:geo:NNN). A campanha foi criada como DRAFT.`,
      );
    }
    if (spec.publico.idade_min || spec.publico.idade_max || spec.publico.generos?.length || spec.publico.interesses?.length) {
      pendencias.push("Idade, gênero e interesses exigem facets/URNs específicos do LinkedIn e não foram aplicados.");
    }
    if (spec.orcamento_total) pendencias.push("Orçamento total (totalBudget) não aplicado: só o diário foi configurado.");

    const { id, corpo: resposta } = await postCriar(`adAccounts/${contaId(conta)}/adCampaigns`, corpo);
    let externalId = id;
    if (!externalId) {
      // Sem header de id: localiza pelo nome recém-criado.
      const depois = await listarTodas(conta);
      externalId = str(depois.find((c) => str(c.name) === spec.nome)?.id);
    }
    if (!externalId) throw new ErroPlataforma("linkedin", "Criação da campanha não devolveu id (header x-restli-id ausente).", resposta);

    const filhos: ResultadoCriacao["filhos"] = spec.anuncios.map((a) => ({
      tipo: "anuncio_pendente",
      external_id: "",
      nome: a.nome,
    }));
    pendencias.push("Criativos (posts patrocinados) precisam ser criados no Campaign Manager ou via API de creatives/posts.");

    return {
      external_id: externalId,
      status: temTargeting ? "pausada" : "rascunho",
      filhos,
      raw: {
        idempotencia,
        account: contaUrn(conta),
        campaign_group: grupo,
        objectiveType: objetivo,
        costType: lance.costType,
        optimizationTargetType: lance.optimizationTargetType,
        targeting: corpo.targetingCriteria ?? null,
        resposta,
        pendencias,
      },
    };
  },

  async alterarStatus(conta: Conta, external_id: string, status: "ativa" | "pausada"): Promise<void> {
    exigirToken();
    await post(
      `adAccounts/${contaId(conta)}/adCampaigns/${campanhaId(external_id)}`,
      { patch: { $set: { status: status === "ativa" ? "ACTIVE" : "PAUSED" } } },
      { "X-RestLi-Method": "PARTIAL_UPDATE" },
    );
  },

  async alterarOrcamentoDiario(conta: Conta, external_id: string, valor: number): Promise<void> {
    exigirToken();
    if (!Number.isFinite(valor) || valor <= 0) {
      throw new ErroPlataforma("linkedin", `Valor de orçamento inválido: ${valor}.`);
    }
    const atual = await get(`adAccounts/${contaId(conta)}/adCampaigns/${campanhaId(external_id)}`);
    const moeda = str(obj(atual.dailyBudget)?.currencyCode) ?? (conta.moeda || "USD").toUpperCase();
    await post(
      `adAccounts/${contaId(conta)}/adCampaigns/${campanhaId(external_id)}`,
      { patch: { $set: { dailyBudget: { amount: String(valor), currencyCode: moeda } } } },
      { "X-RestLi-Method": "PARTIAL_UPDATE" },
    );
  },
};
