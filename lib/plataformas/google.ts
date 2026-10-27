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
 * Adaptador real do Google Ads (REST, GAQL via searchStream).
 *
 * Credenciais só por variável de ambiente:
 *   GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET,
 *   GOOGLE_ADS_REFRESH_TOKEN  (obrigatórias)
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID (opcional; também aceito em conta.config.login_customer_id)
 *   GOOGLE_ADS_API_VERSION       (opcional; padrão v21)
 *
 * `conta.account_id` é o customer id (hífens são removidos).
 * `conta.config.geo_target_constants` (opcional) é uma lista de resource names
 * `geoTargetConstants/NNNN` usada na segmentação geográfica da campanha criada;
 * sem ela a localização vira pendência (não inventamos ids).
 *
 * Valores monetários na API vêm em micros (÷ 1.000.000).
 */

const VARIAVEIS = [
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_REFRESH_TOKEN",
];

function versao(): string {
  return env("GOOGLE_ADS_API_VERSION") ?? "v21";
}

function base(): string {
  return `https://googleads.googleapis.com/${versao()}`;
}

function exigirCredenciais(): void {
  const cred = presencas(VARIAVEIS);
  if (!cred.completas) {
    const faltam = Object.entries(cred.presentes)
      .filter(([, ok]) => !ok)
      .map(([n]) => n);
    throw new ErroPlataforma("google", `Credenciais ausentes: defina ${faltam.join(", ")} no ambiente.`);
  }
}

function customerId(conta: Conta): string {
  const id = conta.account_id.replace(/[^0-9]/g, "");
  if (!id) throw new ErroPlataforma("google", `account_id inválido para Google Ads: "${conta.account_id}".`);
  return id;
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

function deMicros(v: unknown): number | null {
  const s = str(v);
  if (s === null || s === "") return null;
  return Math.round(num(s)) / 1_000_000;
}

function paraMicros(v: number): string {
  // int64 vai como string no JSON da API.
  return String(Math.round(v * 1_000_000));
}

function escaparGaql(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Extrai a mensagem de erro da API Google Ads (google.rpc.Status + GoogleAdsFailure). */
function traduzirErro(e: unknown): never {
  if (e instanceof ErroPlataforma) {
    // searchStream devolve um array de erros; mutate devolve um objeto.
    const corpo = Array.isArray(e.detalhes) ? obj(e.detalhes[0]) : obj(e.detalhes);
    const erro = corpo ? obj(corpo.error) : null;
    if (erro) {
      const mensagens: string[] = [];
      for (const d of lista(erro.details)) {
        for (const item of lista(obj(d)?.errors)) {
          const m = str(obj(item)?.message);
          if (m) mensagens.push(m);
        }
      }
      const principal = str(erro.message) ?? "erro desconhecido";
      throw new ErroPlataforma(
        "google",
        `Google Ads recusou a chamada (${str(erro.status) ?? str(erro.code) ?? "?"}): ${mensagens.length ? mensagens.join(" | ") : principal}`,
        e.detalhes,
      );
    }
    throw e;
  }
  if (e instanceof Error) throw new ErroPlataforma("google", e.message, e);
  throw new ErroPlataforma("google", String(e));
}

// ---------- OAuth: refresh token → access token (cache em memória) ----------

let cacheToken: { valor: string; expiraEm: number } | null = null;

async function accessToken(): Promise<string> {
  exigirCredenciais();
  const agora = Date.now();
  if (cacheToken && cacheToken.expiraEm > agora + 60_000) return cacheToken.valor;
  const corpo = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env("GOOGLE_ADS_CLIENT_ID") as string,
    client_secret: env("GOOGLE_ADS_CLIENT_SECRET") as string,
    refresh_token: env("GOOGLE_ADS_REFRESH_TOKEN") as string,
  });
  let resposta: unknown;
  try {
    resposta = await requisicao<unknown>("google", "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: corpo.toString(),
    });
  } catch (e) {
    if (e instanceof ErroPlataforma) {
      const d = obj(e.detalhes);
      throw new ErroPlataforma(
        "google",
        `Falha ao trocar o refresh token por access token: ${str(d?.error_description) ?? str(d?.error) ?? e.message}`,
        e.detalhes,
      );
    }
    throw e;
  }
  const token = str(obj(resposta)?.access_token);
  if (!token) throw new ErroPlataforma("google", "Resposta do OAuth sem access_token.", resposta);
  const expiraSeg = num(obj(resposta)?.expires_in) || 3600;
  cacheToken = { valor: token, expiraEm: agora + expiraSeg * 1000 };
  return token;
}

async function cabecalhos(conta: Conta): Promise<Record<string, string>> {
  const token = await accessToken();
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": env("GOOGLE_ADS_DEVELOPER_TOKEN") as string,
    "Content-Type": "application/json",
  };
  const login = env("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? str(conta.config.login_customer_id);
  if (login) h["login-customer-id"] = login.replace(/[^0-9]/g, "");
  return h;
}

// ---------- chamadas ----------

/** Executa GAQL via searchStream e concatena os `results` de todos os blocos. */
async function gaql(conta: Conta, query: string): Promise<Record<string, unknown>[]> {
  const url = `${base()}/customers/${customerId(conta)}/googleAds:searchStream`;
  let resposta: unknown;
  try {
    resposta = await requisicao<unknown>("google", url, {
      method: "POST",
      headers: await cabecalhos(conta),
      body: JSON.stringify({ query }),
      timeoutMs: 120_000,
    });
  } catch (e) {
    traduzirErro(e);
  }
  const saida: Record<string, unknown>[] = [];
  // searchStream devolve um ARRAY de blocos {results:[...]}.
  const blocos = Array.isArray(resposta) ? resposta : [resposta];
  for (const b of blocos) {
    for (const r of lista(obj(b)?.results)) {
      const o = obj(r);
      if (o) saida.push(o);
    }
  }
  return saida;
}

async function mutate(conta: Conta, recurso: "campaignBudgets" | "campaigns" | "campaignCriteria", operations: unknown[]): Promise<string[]> {
  const url = `${base()}/customers/${customerId(conta)}/${recurso}:mutate`;
  let resposta: unknown;
  try {
    resposta = await requisicao<unknown>("google", url, {
      method: "POST",
      headers: await cabecalhos(conta),
      body: JSON.stringify({ operations, partialFailure: false }),
      timeoutMs: 60_000,
    });
  } catch (e) {
    traduzirErro(e);
  }
  const nomes: string[] = [];
  for (const r of lista(obj(resposta)?.results)) {
    const rn = str(obj(r)?.resourceName);
    if (rn) nomes.push(rn);
  }
  if (!nomes.length) throw new ErroPlataforma("google", `Mutação em ${recurso} não devolveu resourceName.`, resposta);
  return nomes;
}

// ---------- mapeamentos ----------

function mapearStatus(s: string | null): StatusCampanha {
  switch ((s ?? "").toUpperCase()) {
    case "ENABLED":
      return "ativa";
    case "PAUSED":
      return "pausada";
    case "REMOVED":
      return "encerrada";
    default:
      return "desconhecido";
  }
}

function mapearObjetivo(canal: string | null, bidding: string | null): Objetivo | null {
  const c = (canal ?? "").toUpperCase();
  const b = (bidding ?? "").toUpperCase();
  const porConversao = ["MAXIMIZE_CONVERSIONS", "TARGET_CPA"].includes(b);
  const porValor = ["MAXIMIZE_CONVERSION_VALUE", "TARGET_ROAS"].includes(b);
  const porCliques = ["MAXIMIZE_CLICKS", "TARGET_SPEND", "MANUAL_CPC", "ENHANCED_CPC", "TARGET_IMPRESSION_SHARE", "PERCENT_CPC"].includes(b);
  const porImpressao = ["TARGET_CPM", "MANUAL_CPM", "MANUAL_CPV", "TARGET_CPV"].includes(b);
  switch (c) {
    case "SEARCH":
      if (porValor) return "vendas";
      if (porConversao) return "leads";
      if (porCliques) return "trafego";
      return "leads";
    case "SHOPPING":
    case "PERFORMANCE_MAX":
      if (porConversao && c === "PERFORMANCE_MAX") return "leads";
      return "vendas";
    case "DISPLAY":
      if (porValor) return "vendas";
      if (porConversao) return "leads";
      if (porImpressao) return "reconhecimento";
      if (porCliques) return "trafego";
      return "reconhecimento";
    case "VIDEO":
      if (porValor) return "vendas";
      if (porConversao) return "leads";
      return "visualizacao_video";
    case "MULTI_CHANNEL":
      return "instalacao_app";
    case "DEMAND_GEN":
    case "DISCOVERY":
      if (porValor) return "vendas";
      if (porConversao) return "leads";
      return "engajamento";
    case "LOCAL":
    case "LOCAL_SERVICES":
      return "leads";
    case "SMART":
      return "leads";
    default:
      return null;
  }
}

/** Bidding da campanha nova a partir de spec.lance.estrategia (padrão: maximizar conversões). */
function montarBidding(spec: EspecificacaoCampanha): { campo: Record<string, unknown>; descricao: string } {
  const estrategia = (spec.lance?.estrategia ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const valor = spec.lance?.valor;
  if (["maximize_conversion_value", "maximizar_valor", "maximizar_valor_conversao", "roas", "target_roas", "roas_alvo"].includes(estrategia)) {
    const campo: Record<string, unknown> = { maximizeConversionValue: valor ? { targetRoas: valor } : {} };
    return { campo, descricao: `MAXIMIZE_CONVERSION_VALUE${valor ? ` (ROAS alvo ${valor})` : ""}` };
  }
  if (["target_cpa", "cpa", "cpa_alvo"].includes(estrategia)) {
    const campo: Record<string, unknown> = { maximizeConversions: valor ? { targetCpaMicros: paraMicros(valor) } : {} };
    return { campo, descricao: `MAXIMIZE_CONVERSIONS${valor ? ` (CPA alvo ${valor})` : ""}` };
  }
  if (["maximize_clicks", "maximizar_cliques", "cliques", "clicks", "target_spend"].includes(estrategia)) {
    const campo: Record<string, unknown> = { targetSpend: valor ? { cpcBidCeilingMicros: paraMicros(valor) } : {} };
    return { campo, descricao: `MAXIMIZE_CLICKS${valor ? ` (CPC máx. ${valor})` : ""}` };
  }
  if (["manual_cpc", "cpc_manual", "cpc"].includes(estrategia)) {
    return { campo: { manualCpc: { enhancedCpcEnabled: false } }, descricao: "MANUAL_CPC" };
  }
  if (["target_impression_share", "parcela_impressoes", "impressoes"].includes(estrategia)) {
    return {
      campo: { targetImpressionShare: { location: "ANYWHERE_ON_PAGE", locationFractionMicros: "1000000" } },
      descricao: "TARGET_IMPRESSION_SHARE",
    };
  }
  const campo: Record<string, unknown> = { maximizeConversions: valor ? { targetCpaMicros: paraMicros(valor) } : {} };
  return { campo, descricao: "MAXIMIZE_CONVERSIONS" };
}

function dataGoogle(d: string): string {
  // A API aceita "YYYY-MM-DD" em startDate/endDate.
  return d.slice(0, 10);
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------- adaptador ----------

export const adaptadorGoogle: AdaptadorPlataforma = {
  plataforma: "google",

  credenciais() {
    return presencas(VARIAVEIS);
  },

  validarSpec(spec: EspecificacaoCampanha, conta: Conta): ResultadoValidacao {
    const r = validarSpecBasica(spec);
    void conta;
    if (!spec.orcamento_diario) {
      r.erros.push("Google Ads exige orçamento diário na campanha (orcamento_total sozinho não é aceito).");
    }
    const temPalavras = Boolean(spec.palavras_chave?.length);
    for (const [i, a] of spec.anuncios.entries()) {
      const rotulo = `Anúncio ${i + 1} (${a.nome})`;
      const titulos = ([] as string[]).concat(a.titulo ?? []);
      const descricoes = ([] as string[]).concat(a.descricao ?? []);
      if (a.formato === "responsivo" || a.formato === "texto") {
        if (titulos.length > 15) r.erros.push(`${rotulo}: ${titulos.length} títulos (máximo 15 no anúncio responsivo).`);
        if (descricoes.length > 4) r.erros.push(`${rotulo}: ${descricoes.length} descrições (máximo 4 no anúncio responsivo).`);
        if (titulos.length < 3) r.avisos.push(`${rotulo}: anúncio responsivo pede ao menos 3 títulos (tem ${titulos.length}).`);
        if (descricoes.length < 2) r.avisos.push(`${rotulo}: anúncio responsivo pede ao menos 2 descrições (tem ${descricoes.length}).`);
      }
      for (const t of titulos) {
        if (t.length > 30) r.erros.push(`${rotulo}: título "${t.slice(0, 20)}…" com ${t.length} caracteres (máximo 30).`);
      }
      for (const d of descricoes) {
        if (d.length > 90) r.erros.push(`${rotulo}: descrição com ${d.length} caracteres (máximo 90).`);
      }
      if (a.formato === "carrossel") r.erros.push(`${rotulo}: formato 'carrossel' não existe no Google Ads.`);
    }
    for (const [i, p] of (spec.palavras_chave ?? []).entries()) {
      if (!p.texto?.trim()) r.erros.push(`Palavra-chave ${i + 1} vazia.`);
      else if (p.texto.length > 80) r.erros.push(`Palavra-chave "${p.texto.slice(0, 20)}…" com mais de 80 caracteres.`);
    }
    if (!temPalavras) {
      r.avisos.push("Sem palavras-chave: a campanha será criada como Performance Max (precisa de grupo de recursos depois).");
    } else {
      r.avisos.push("Palavras-chave e anúncios não são criados via API neste adaptador (ficam como pendência): crie o grupo de anúncios manualmente.");
    }
    if (!Array.isArray(conta.config.geo_target_constants) || !conta.config.geo_target_constants.length) {
      r.avisos.push("conta.config.geo_target_constants ausente: a segmentação geográfica ficará como pendência.");
    }
    r.ok = r.erros.length === 0;
    return r;
  },

  async listarCampanhas(conta: Conta): Promise<CampanhaRemota[]> {
    const linhas = await gaql(
      conta,
      `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
              campaign.bidding_strategy_type, campaign.start_date, campaign.end_date,
              campaign.campaign_budget, campaign_budget.amount_micros, campaign_budget.total_amount_micros,
              campaign_budget.explicitly_shared, campaign.serving_status, campaign.primary_status
       FROM campaign
       ORDER BY campaign.id`,
    );
    return linhas.map((l) => {
      const c = obj(l.campaign) ?? {};
      const b = obj(l.campaignBudget) ?? {};
      const fim = str(c.endDate);
      return {
        plataforma: "google" as const,
        external_id: str(c.id) ?? "",
        nome: str(c.name) ?? "",
        status: mapearStatus(str(c.status)),
        objetivo: mapearObjetivo(str(c.advertisingChannelType), str(c.biddingStrategyType)),
        orcamento_diario: deMicros(b.amountMicros),
        orcamento_total: deMicros(b.totalAmountMicros),
        inicio: str(c.startDate),
        // 2037-12-30 é o sentinela de "sem fim" da API.
        fim: fim && !fim.startsWith("2037-12-30") ? fim : null,
        raw: l,
      };
    });
  },

  async metricasDiarias(conta: Conta, inicio: string, fim: string): Promise<MetricaRemota[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
      throw new ErroPlataforma("google", `Período inválido: ${inicio} → ${fim} (use YYYY-MM-DD).`);
    }
    const linhas = await gaql(
      conta,
      `SELECT campaign.id, campaign.name, segments.date,
              metrics.impressions, metrics.clicks, metrics.cost_micros,
              metrics.conversions, metrics.conversions_value
       FROM campaign
       WHERE segments.date BETWEEN '${inicio}' AND '${fim}'
         AND metrics.impressions > 0
       ORDER BY segments.date`,
    );
    return linhas
      .filter((l) => str(obj(l.campaign)?.id))
      .map((l) => {
        const c = obj(l.campaign) ?? {};
        const m = obj(l.metrics) ?? {};
        const s = obj(l.segments) ?? {};
        return {
          campanha_external_id: str(c.id) as string,
          data: str(s.date) ?? inicio,
          impressoes: num(m.impressions),
          cliques: num(m.clicks),
          gasto: Math.round(num(m.costMicros)) / 1_000_000,
          conversoes: num(m.conversions),
          valor_conversao: num(m.conversionsValue),
          alcance: 0, // Google Ads não expõe alcance por campanha no relatório padrão.
          raw: l,
        };
      });
  },

  async criarCampanha(conta: Conta, spec: EspecificacaoCampanha, idempotencia: string): Promise<ResultadoCriacao> {
    exigirCredenciais();
    const validacao = this.validarSpec(spec, conta);
    if (!validacao.ok) {
      throw new ErroPlataforma("google", `Spec inválida: ${validacao.erros.join(" | ")}`);
    }

    // Idempotência: a API não tem chave; evitamos duplicar por nome.
    const existentes = await gaql(
      conta,
      `SELECT campaign.id, campaign.name, campaign.status FROM campaign
       WHERE campaign.name = '${escaparGaql(spec.nome)}' AND campaign.status != 'REMOVED'`,
    );
    if (existentes.length) {
      throw new ErroPlataforma(
        "google",
        `Já existe campanha "${spec.nome}" nesta conta (id ${str(obj(existentes[0].campaign)?.id)}); não será duplicada.`,
        { existente: existentes[0], idempotencia },
      );
    }

    const pendencias: string[] = [];
    const filhos: ResultadoCriacao["filhos"] = [];
    const cid = customerId(conta);

    // 1) Orçamento (não compartilhado).
    const [orcamentoRn] = await mutate(conta, "campaignBudgets", [
      {
        create: {
          name: `${spec.nome} — Orçamento`,
          amountMicros: paraMicros(spec.orcamento_diario as number),
          deliveryMethod: "STANDARD",
          explicitlyShared: false,
        },
      },
    ]);
    filhos.push({ tipo: "orcamento", external_id: orcamentoRn, nome: `${spec.nome} — Orçamento` });

    // 2) Campanha — SEARCH com palavras-chave, senão PERFORMANCE_MAX; sempre PAUSED.
    const temPalavras = Boolean(spec.palavras_chave?.length);
    const bidding = montarBidding(spec);
    const campanha: Record<string, unknown> = {
      name: spec.nome,
      status: "PAUSED",
      advertisingChannelType: temPalavras ? "SEARCH" : "PERFORMANCE_MAX",
      campaignBudget: orcamentoRn,
      ...bidding.campo,
    };
    if (temPalavras) {
      campanha.networkSettings = {
        targetGoogleSearch: true,
        targetSearchNetwork: true,
        targetContentNetwork: false,
        targetPartnerSearchNetwork: false,
      };
    }
    if (!temPalavras && !["maximizeConversions", "maximizeConversionValue"].some((k) => k in bidding.campo)) {
      // PMax só aceita maximizar conversões/valor.
      delete campanha.targetSpend;
      delete campanha.manualCpc;
      delete campanha.targetImpressionShare;
      campanha.maximizeConversions = {};
      pendencias.push(`Performance Max não aceita a estratégia ${bidding.descricao}; usada MAXIMIZE_CONVERSIONS.`);
    }
    if (spec.inicio && spec.inicio >= hoje()) campanha.startDate = dataGoogle(spec.inicio);
    if (spec.fim) campanha.endDate = dataGoogle(spec.fim);

    const [campanhaRn] = await mutate(conta, "campaigns", [{ create: campanha }]);
    const campanhaId = campanhaRn.split("/").pop() ?? campanhaRn;

    // 3) Segmentação geográfica — só com resource names fornecidos na conta.
    const geos = lista(conta.config.geo_target_constants).map((g) => str(g)).filter((g): g is string => Boolean(g));
    if (geos.length) {
      try {
        const criterios = await mutate(
          conta,
          "campaignCriteria",
          geos.map((g) => ({
            create: {
              campaign: campanhaRn,
              location: { geoTargetConstant: g.startsWith("geoTargetConstants/") ? g : `geoTargetConstants/${g}` },
            },
          })),
        );
        for (const [i, rn] of criterios.entries()) filhos.push({ tipo: "criterio_localizacao", external_id: rn, nome: geos[i] ?? rn });
      } catch (e) {
        pendencias.push(`Segmentação geográfica não aplicada: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      pendencias.push(
        `Localização (${(spec.publico.localizacoes ?? []).join(", ") || "não informada"}) não aplicada: informe conta.config.geo_target_constants com os resource names geoTargetConstants/NNNN.`,
      );
    }

    // 4) Grupo de anúncios, palavras-chave e anúncios ficam como pendência (criação manual).
    if (temPalavras) {
      pendencias.push(
        `Palavras-chave não registradas (sem grupo de anúncios): ${(spec.palavras_chave ?? [])
          .map((p) => `${p.texto} [${p.correspondencia}]`)
          .join("; ")}.`,
      );
    } else {
      pendencias.push("Performance Max exige um grupo de recursos (asset group) com títulos, descrições, imagens e logo antes de ativar.");
    }
    if (spec.negativas?.length) pendencias.push(`Palavras-chave negativas não registradas: ${spec.negativas.join("; ")}.`);
    for (const a of spec.anuncios) {
      filhos.push({ tipo: "anuncio_pendente", external_id: "", nome: a.nome });
    }
    if (spec.anuncios.length) pendencias.push(`Anúncios (${spec.anuncios.map((a) => a.nome).join(", ")}) precisam de grupo de anúncios: crie-os no Google Ads.`);
    if (spec.publico.idade_min || spec.publico.idade_max || spec.publico.generos?.length) {
      pendencias.push("Faixa etária e gênero são critérios de grupo de anúncios no Google Ads e não foram aplicados.");
    }

    return {
      external_id: campanhaId,
      status: "pausada",
      filhos,
      raw: {
        idempotencia,
        customer_id: cid,
        resource_name: campanhaRn,
        campaign_budget: orcamentoRn,
        advertising_channel_type: campanha.advertisingChannelType,
        bidding: bidding.descricao,
        pendencias,
      },
    };
  },

  async alterarStatus(conta: Conta, external_id: string, status: "ativa" | "pausada"): Promise<void> {
    exigirCredenciais();
    const rn = external_id.includes("/") ? external_id : `customers/${customerId(conta)}/campaigns/${external_id}`;
    await mutate(conta, "campaigns", [
      { update: { resourceName: rn, status: status === "ativa" ? "ENABLED" : "PAUSED" }, updateMask: "status" },
    ]);
  },

  async alterarOrcamentoDiario(conta: Conta, external_id: string, valor: number): Promise<void> {
    exigirCredenciais();
    if (!Number.isFinite(valor) || valor <= 0) {
      throw new ErroPlataforma("google", `Valor de orçamento inválido: ${valor}.`);
    }
    const id = external_id.split("/").pop() ?? external_id;
    const linhas = await gaql(
      conta,
      `SELECT campaign.id, campaign.campaign_budget, campaign_budget.resource_name, campaign_budget.explicitly_shared
       FROM campaign WHERE campaign.id = ${id.replace(/[^0-9]/g, "")}`,
    );
    const linha = linhas[0];
    const orcamentoRn = str(obj(linha?.campaignBudget)?.resourceName) ?? str(obj(linha?.campaign)?.campaignBudget);
    if (!orcamentoRn) throw new ErroPlataforma("google", `Campanha ${external_id} não encontrada ou sem orçamento.`);
    if (obj(linha?.campaignBudget)?.explicitlyShared === true) {
      throw new ErroPlataforma(
        "google",
        `Campanha ${external_id} usa orçamento compartilhado (${orcamentoRn}); alterar afetaria outras campanhas. Altere manualmente.`,
      );
    }
    await mutate(conta, "campaignBudgets", [
      { update: { resourceName: orcamentoRn, amountMicros: paraMicros(valor) }, updateMask: "amount_micros" },
    ]);
  },
};
