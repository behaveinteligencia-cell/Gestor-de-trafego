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
 * Adaptador real do TikTok Ads (Business API v1.3).
 *
 * Credenciais só por variável de ambiente:
 *   TIKTOK_ACCESS_TOKEN (obrigatória) — enviado no header `Access-Token`.
 *   TIKTOK_API_BASE     (opcional)    — padrão https://business-api.tiktok.com/open_api/v1.3
 *
 * `conta.account_id` é o `advertiser_id`.
 * Toda resposta vem como `{ code, message, request_id, data }`; `code !== 0` é erro.
 * Orçamentos já vêm na unidade da moeda da conta.
 */

const VARIAVEIS = ["TIKTOK_ACCESS_TOKEN"];

function base(): string {
  return (env("TIKTOK_API_BASE") ?? "https://business-api.tiktok.com/open_api/v1.3").replace(/\/$/, "");
}

function exigirToken(): string {
  const cred = presencas(VARIAVEIS);
  if (!cred.completas) {
    const faltam = Object.entries(cred.presentes)
      .filter(([, ok]) => !ok)
      .map(([n]) => n);
    throw new ErroPlataforma("tiktok", `Credenciais ausentes: defina ${faltam.join(", ")} no ambiente.`);
  }
  return env("TIKTOK_ACCESS_TOKEN") as string;
}

function advertiserId(conta: Conta): string {
  const id = conta.account_id.trim();
  if (!id) throw new ErroPlataforma("tiktok", "account_id (advertiser_id) vazio.");
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

// ---------- chamadas ----------

/** Desembrulha o envelope TikTok: devolve `data` ou lança quando `code !== 0`. */
function desembrulhar(resposta: unknown, contexto: string): Record<string, unknown> {
  const corpo = obj(resposta);
  if (!corpo) throw new ErroPlataforma("tiktok", `Resposta inesperada em ${contexto}.`, resposta);
  const code = num(corpo.code);
  if (code !== 0) {
    throw new ErroPlataforma(
      "tiktok",
      `TikTok recusou ${contexto} (code ${code}): ${str(corpo.message) ?? "sem mensagem"}`,
      resposta,
    );
  }
  return obj(corpo.data) ?? {};
}

function traduzirErro(e: unknown, contexto: string): never {
  if (e instanceof ErroPlataforma) {
    const corpo = obj(e.detalhes);
    if (corpo && str(corpo.message)) {
      throw new ErroPlataforma(
        "tiktok",
        `TikTok recusou ${contexto} (HTTP, code ${str(corpo.code) ?? "?"}): ${str(corpo.message)}`,
        e.detalhes,
      );
    }
    throw e;
  }
  if (e instanceof Error) throw new ErroPlataforma("tiktok", e.message, e);
  throw new ErroPlataforma("tiktok", String(e));
}

async function get(caminho: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const token = exigirToken();
  const url = new URL(`${base()}/${caminho.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let resposta: unknown;
  try {
    resposta = await requisicao<unknown>("tiktok", url.toString(), {
      headers: { "Access-Token": token },
      timeoutMs: 60_000,
    });
  } catch (e) {
    traduzirErro(e, caminho);
  }
  return desembrulhar(resposta, caminho);
}

async function post(caminho: string, corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = exigirToken();
  let resposta: unknown;
  try {
    resposta = await requisicao<unknown>("tiktok", `${base()}/${caminho.replace(/^\//, "")}`, {
      method: "POST",
      headers: { "Access-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      timeoutMs: 60_000,
    });
  } catch (e) {
    traduzirErro(e, caminho);
  }
  return desembrulhar(resposta, caminho);
}

/** Percorre `data.list` com `page`/`page_size` até `page_info.total_page`. */
async function paginar(caminho: string, params: Record<string, string>): Promise<Record<string, unknown>[]> {
  const saida: Record<string, unknown>[] = [];
  const tamanho = 200;
  for (let pagina = 1; pagina <= 500; pagina++) {
    const data = await get(caminho, { ...params, page: String(pagina), page_size: String(tamanho) });
    const itens = lista(data.list);
    for (const item of itens) {
      const o = obj(item);
      if (o) saida.push(o);
    }
    const info = obj(data.page_info);
    const totalPaginas = num(info?.total_page);
    if (!itens.length || (totalPaginas && pagina >= totalPaginas) || itens.length < tamanho) break;
  }
  return saida;
}

// ---------- mapeamentos ----------

function mapearStatus(operacao: string | null, secundario: string | null): StatusCampanha {
  const s = (secundario ?? "").toUpperCase();
  const op = (operacao ?? "").toUpperCase();
  if (s.includes("DELETE")) return "encerrada";
  if (s.includes("TIME_DONE") || s.includes("CAMPAIGN_STATUS_DONE")) return "encerrada";
  if (s.includes("AUDIT") || s.includes("REVIEW") || s.includes("CONTRACT_PENDING")) return "em_revisao";
  if (s === "CAMPAIGN_STATUS_DISABLE") return "pausada";
  if (s === "CAMPAIGN_STATUS_ENABLE") return "ativa";
  if (op === "DISABLE") return "pausada";
  if (op === "ENABLE") return s.includes("NOT_START") || s.includes("BUDGET_EXCEED") ? "ativa" : s ? "desconhecido" : "ativa";
  return "desconhecido";
}

const OBJETIVO_PARA_TIKTOK: Record<Objetivo, string> = {
  reconhecimento: "REACH",
  trafego: "TRAFFIC",
  engajamento: "ENGAGEMENT",
  leads: "LEAD_GENERATION",
  vendas: "WEB_CONVERSIONS",
  mensagens: "LEAD_GENERATION",
  instalacao_app: "APP_PROMOTION",
  visualizacao_video: "VIDEO_VIEWS",
};

function mapearObjetivo(nativo: string | null): Objetivo | null {
  switch ((nativo ?? "").toUpperCase()) {
    case "REACH":
    case "RF_REACH":
      return "reconhecimento";
    case "TRAFFIC":
      return "trafego";
    case "ENGAGEMENT":
      return "engajamento";
    case "LEAD_GENERATION":
      return "leads";
    case "WEB_CONVERSIONS":
    case "CONVERSIONS":
    case "PRODUCT_SALES":
    case "SHOP_PURCHASES":
    case "CATALOG_SALES":
      return "vendas";
    case "APP_PROMOTION":
    case "APP_INSTALL":
    case "APP_INSTALLS":
      return "instalacao_app";
    case "VIDEO_VIEWS":
      return "visualizacao_video";
    default:
      return null;
  }
}

/** "2026-01-05 00:00:00" → "2026-01-05". */
function soData(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : null;
}

// ---------- adaptador ----------

export const adaptadorTikTok: AdaptadorPlataforma = {
  plataforma: "tiktok",

  credenciais() {
    return presencas(VARIAVEIS);
  },

  validarSpec(spec: EspecificacaoCampanha, conta: Conta): ResultadoValidacao {
    const r = validarSpecBasica(spec);
    void conta;
    if (!spec.orcamento_diario) {
      r.erros.push("TikTok: este adaptador cria campanhas com BUDGET_MODE_DAY; informe orcamento_diario.");
    } else if (spec.orcamento_diario < 50) {
      r.avisos.push(
        `Orçamento diário ${spec.orcamento_diario} pode ficar abaixo do mínimo de campanha do TikTok (≈ US$ 50/dia ou equivalente).`,
      );
    }
    for (const [i, a] of spec.anuncios.entries()) {
      const rotulo = `Anúncio ${i + 1} (${a.nome})`;
      for (const t of ([] as string[]).concat(a.texto_principal ?? [])) {
        if (t.length > 100) r.erros.push(`${rotulo}: texto com ${t.length} caracteres (máximo 100 no TikTok).`);
      }
      if (a.formato !== "video") r.avisos.push(`${rotulo}: TikTok prioriza vídeo; formato '${a.formato}' pode não ser aceito em todos os posicionamentos.`);
    }
    if (spec.objetivo === "mensagens") {
      r.avisos.push("Objetivo 'mensagens' será criado como LEAD_GENERATION; configure o destino de mensagens no grupo de anúncios.");
    }
    r.avisos.push("Grupos de anúncios e anúncios não são criados via API neste adaptador (ficam como pendência).");
    r.ok = r.erros.length === 0;
    return r;
  },

  async listarCampanhas(conta: Conta): Promise<CampanhaRemota[]> {
    const linhas = await paginar("campaign/get/", { advertiser_id: advertiserId(conta) });
    return linhas.map((c) => {
      const modo = str(c.budget_mode) ?? "";
      const orcamento = c.budget === undefined || c.budget === null ? null : num(c.budget);
      return {
        plataforma: "tiktok" as const,
        external_id: str(c.campaign_id) ?? "",
        nome: str(c.campaign_name) ?? "",
        status: mapearStatus(str(c.operation_status), str(c.secondary_status)),
        objetivo: mapearObjetivo(str(c.objective_type)),
        orcamento_diario: modo === "BUDGET_MODE_DAY" ? orcamento : null,
        orcamento_total: modo === "BUDGET_MODE_TOTAL" ? orcamento : null,
        inicio: soData(c.create_time),
        fim: null,
        raw: c,
      };
    });
  },

  async metricasDiarias(conta: Conta, inicio: string, fim: string): Promise<MetricaRemota[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
      throw new ErroPlataforma("tiktok", `Período inválido: ${inicio} → ${fim} (use YYYY-MM-DD).`);
    }
    const linhas = await paginar("report/integrated/get/", {
      advertiser_id: advertiserId(conta),
      report_type: "BASIC",
      data_level: "AUCTION_CAMPAIGN",
      dimensions: JSON.stringify(["campaign_id", "stat_time_day"]),
      metrics: JSON.stringify([
        "campaign_name",
        "spend",
        "impressions",
        "clicks",
        "reach",
        "conversion",
        "total_complete_payment_rate", // "Total complete payment value" (receita de pagamentos concluídos)
        "total_purchase_value",
      ]),
      start_date: inicio,
      end_date: fim,
      lifetime: "false",
    });
    return linhas
      .map((l) => {
        const d = obj(l.dimensions) ?? {};
        const m = obj(l.metrics) ?? {};
        const id = str(d.campaign_id);
        if (!id) return null;
        const valorPagamento = num(m.total_complete_payment_rate);
        const valorCompra = num(m.total_purchase_value);
        return {
          campanha_external_id: id,
          data: soData(d.stat_time_day) ?? inicio,
          impressoes: num(m.impressions),
          cliques: num(m.clicks),
          gasto: num(m.spend),
          conversoes: num(m.conversion),
          valor_conversao: valorPagamento || valorCompra,
          alcance: num(m.reach),
          raw: l,
        } satisfies MetricaRemota;
      })
      .filter((m): m is MetricaRemota => m !== null);
  },

  async criarCampanha(conta: Conta, spec: EspecificacaoCampanha, idempotencia: string): Promise<ResultadoCriacao> {
    exigirToken();
    const validacao = this.validarSpec(spec, conta);
    if (!validacao.ok) {
      throw new ErroPlataforma("tiktok", `Spec inválida: ${validacao.erros.join(" | ")}`);
    }
    const adv = advertiserId(conta);

    // Idempotência: a API não tem chave; evitamos duplicar por nome.
    const existentes = await paginar("campaign/get/", {
      advertiser_id: adv,
      filtering: JSON.stringify({ campaign_name: spec.nome }),
    });
    const duplicada = existentes.find(
      (c) => str(c.campaign_name) === spec.nome && !(str(c.secondary_status) ?? "").includes("DELETE"),
    );
    if (duplicada) {
      throw new ErroPlataforma(
        "tiktok",
        `Já existe campanha "${spec.nome}" neste anunciante (id ${str(duplicada.campaign_id)}); não será duplicada.`,
        { existente: duplicada, idempotencia },
      );
    }

    const pendencias: string[] = [];
    const objetivo = OBJETIVO_PARA_TIKTOK[spec.objetivo];
    const corpo: Record<string, unknown> = {
      advertiser_id: adv,
      campaign_name: spec.nome,
      objective_type: objetivo,
      budget_mode: "BUDGET_MODE_DAY",
      budget: spec.orcamento_diario,
      // Criada desativada: a ativação é ação humana separada.
      operation_status: "DISABLE",
    };
    if (spec.objetivo === "instalacao_app") {
      pendencias.push("APP_PROMOTION exige app_id (app cadastrado no TikTok); informe-o no grupo de anúncios.");
    }
    if (spec.objetivo === "mensagens") {
      pendencias.push("Objetivo 'mensagens' criado como LEAD_GENERATION; configure o destino de mensagens no grupo de anúncios.");
    }
    const data = await post("campaign/create/", corpo);
    const campanhaId = str(data.campaign_id);
    if (!campanhaId) throw new ErroPlataforma("tiktok", "campaign/create/ não devolveu campaign_id.", data);

    // Garante o estado pausado mesmo se operation_status for ignorado na criação.
    try {
      await post("campaign/status/update/", { advertiser_id: adv, campaign_ids: [campanhaId], operation_status: "DISABLE" });
    } catch (e) {
      pendencias.push(`Não foi possível confirmar a pausa da campanha ${campanhaId}: ${e instanceof Error ? e.message : String(e)}. Verifique no Ads Manager.`);
    }

    const filhos: ResultadoCriacao["filhos"] = spec.anuncios.map((a) => ({
      tipo: "anuncio_pendente",
      external_id: "",
      nome: a.nome,
    }));
    pendencias.push(
      "Grupo de anúncios (segmentação, posicionamento, identidade, pixel) e anúncios precisam ser criados no TikTok Ads Manager.",
    );
    if (spec.publico.localizacoes?.length) {
      pendencias.push(`Localizações (${spec.publico.localizacoes.join(", ")}) exigem location_ids do TikTok e ficam para o grupo de anúncios.`);
    }
    if (spec.palavras_chave?.length) pendencias.push("TikTok não usa palavras-chave de busca; ignoradas.");

    return {
      external_id: campanhaId,
      status: "pausada",
      filhos,
      raw: { idempotencia, advertiser_id: adv, objective_type: objetivo, budget_mode: "BUDGET_MODE_DAY", resposta: data, pendencias },
    };
  },

  async alterarStatus(conta: Conta, external_id: string, status: "ativa" | "pausada"): Promise<void> {
    exigirToken();
    await post("campaign/status/update/", {
      advertiser_id: advertiserId(conta),
      campaign_ids: [external_id],
      operation_status: status === "ativa" ? "ENABLE" : "DISABLE",
    });
  },

  async alterarOrcamentoDiario(conta: Conta, external_id: string, valor: number): Promise<void> {
    exigirToken();
    if (!Number.isFinite(valor) || valor <= 0) {
      throw new ErroPlataforma("tiktok", `Valor de orçamento inválido: ${valor}.`);
    }
    const adv = advertiserId(conta);
    // Confere o modo de orçamento antes de alterar: não convertemos total → diário em silêncio.
    const atual = await get("campaign/get/", {
      advertiser_id: adv,
      filtering: JSON.stringify({ campaign_ids: [external_id] }),
      page: "1",
      page_size: "10",
    });
    const campanha = lista(atual.list)
      .map((c) => obj(c))
      .find((c) => c && str(c.campaign_id) === external_id);
    if (!campanha) throw new ErroPlataforma("tiktok", `Campanha ${external_id} não encontrada no anunciante ${adv}.`);
    const modo = str(campanha.budget_mode) ?? "";
    if (modo && modo !== "BUDGET_MODE_DAY") {
      throw new ErroPlataforma(
        "tiktok",
        `Campanha ${external_id} usa ${modo}, não orçamento diário; altere manualmente no Ads Manager.`,
      );
    }
    await post("campaign/update/", {
      advertiser_id: adv,
      campaign_id: external_id,
      budget_mode: "BUDGET_MODE_DAY",
      budget: valor,
    });
  },
};
