import { readFile } from "node:fs/promises";
import path from "node:path";
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
 * Adaptador real do Meta Ads (Graph API / Marketing API).
 *
 * Credenciais só por variável de ambiente:
 *   META_ACCESS_TOKEN  (obrigatória) — token de sistema ou de usuário com ads_management.
 *   META_API_VERSION   (opcional)    — versão da Graph API, padrão v24.0.
 *
 * `conta.account_id` é o id da conta de anúncios no formato `act_XXXX`.
 * `conta.config` pode trazer `page_id` (necessário para criar anúncios) e
 * `pixel_id` (necessário para otimizar por conversão).
 *
 * Orçamentos na Graph API são informados na unidade mínima da moeda
 * (centavos); aqui convertemos sempre para a unidade da moeda (÷ 100).
 */

const VARIAVEIS = ["META_ACCESS_TOKEN"];

function versao(): string {
  return env("META_API_VERSION") ?? "v24.0";
}

function base(): string {
  return `https://graph.facebook.com/${versao()}`;
}

function exigirToken(): string {
  const cred = presencas(VARIAVEIS);
  if (!cred.completas) {
    const faltam = Object.entries(cred.presentes)
      .filter(([, ok]) => !ok)
      .map(([n]) => n);
    throw new ErroPlataforma("meta", `Credenciais ausentes: defina ${faltam.join(", ")} no ambiente.`);
  }
  return env("META_ACCESS_TOKEN") as string;
}

function contaId(conta: Conta): string {
  const id = conta.account_id.trim();
  return id.startsWith("act_") ? id : `act_${id}`;
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

/** Extrai a mensagem de erro da Graph API quando ela existe. */
function traduzirErro(e: unknown): never {
  if (e instanceof ErroPlataforma) {
    const corpo = obj(e.detalhes);
    const erro = corpo ? obj(corpo.error) : null;
    if (erro) {
      const msg = str(erro.error_user_msg) ?? str(erro.message) ?? "erro desconhecido";
      const codigo = str(erro.code);
      const sub = str(erro.error_subcode);
      throw new ErroPlataforma(
        "meta",
        `Graph API recusou a chamada${codigo ? ` (código ${codigo}${sub ? `/${sub}` : ""})` : ""}: ${msg}`,
        e.detalhes,
      );
    }
    throw e;
  }
  if (e instanceof Error) throw new ErroPlataforma("meta", e.message, e);
  throw new ErroPlataforma("meta", String(e));
}

// ---------- chamadas HTTP ----------

async function get<T>(caminho: string, params: Record<string, string>): Promise<T> {
  const token = exigirToken();
  const url = new URL(`${base()}/${caminho.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  try {
    return await requisicao<T>("meta", url.toString());
  } catch (e) {
    return traduzirErro(e);
  }
}

/** GET de uma URL completa já montada pela paginação (`paging.next`). */
async function getUrl<T>(url: string): Promise<T> {
  exigirToken();
  try {
    return await requisicao<T>("meta", url);
  } catch (e) {
    return traduzirErro(e);
  }
}

async function post<T>(caminho: string, campos: Record<string, unknown>): Promise<T> {
  const token = exigirToken();
  const corpo = new URLSearchParams();
  for (const [k, v] of Object.entries(campos)) {
    if (v === undefined || v === null) continue;
    corpo.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  corpo.set("access_token", token);
  try {
    return await requisicao<T>("meta", `${base()}/${caminho.replace(/^\//, "")}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: corpo.toString(),
      timeoutMs: 60_000,
    });
  } catch (e) {
    return traduzirErro(e);
  }
}

/** Percorre todas as páginas de uma listagem (`data` + `paging.next`). */
async function paginar(caminho: string, params: Record<string, string>): Promise<Record<string, unknown>[]> {
  const saida: Record<string, unknown>[] = [];
  let pagina = await get<unknown>(caminho, params);
  for (let i = 0; i < 200; i++) {
    const corpo = obj(pagina);
    for (const item of lista(corpo?.data)) {
      const o = obj(item);
      if (o) saida.push(o);
    }
    const proxima = str(obj(corpo?.paging)?.next);
    if (!proxima) break;
    pagina = await getUrl<unknown>(proxima);
  }
  return saida;
}

// ---------- mapeamentos ----------

function mapearStatus(effective: string | null, configurado: string | null): StatusCampanha {
  const s = (effective ?? configurado ?? "").toUpperCase();
  switch (s) {
    case "ACTIVE":
      return "ativa";
    case "PAUSED":
    case "CAMPAIGN_PAUSED":
    case "ADSET_PAUSED":
      return "pausada";
    case "DELETED":
    case "ARCHIVED":
      return "encerrada";
    case "IN_PROCESS":
    case "PENDING_REVIEW":
    case "PREAPPROVED":
    case "PENDING_BILLING_INFO":
    case "WITH_ISSUES":
    case "DISAPPROVED":
      return "em_revisao";
    default:
      return "desconhecido";
  }
}

const OBJETIVO_PARA_META: Record<Objetivo, string> = {
  reconhecimento: "OUTCOME_AWARENESS",
  trafego: "OUTCOME_TRAFFIC",
  engajamento: "OUTCOME_ENGAGEMENT",
  leads: "OUTCOME_LEADS",
  vendas: "OUTCOME_SALES",
  mensagens: "OUTCOME_ENGAGEMENT",
  instalacao_app: "OUTCOME_APP_PROMOTION",
  visualizacao_video: "OUTCOME_ENGAGEMENT",
};

function mapearObjetivo(nativo: string | null): Objetivo | null {
  switch ((nativo ?? "").toUpperCase()) {
    case "OUTCOME_LEADS":
    case "LEAD_GENERATION":
      return "leads";
    case "OUTCOME_SALES":
    case "CONVERSIONS":
    case "PRODUCT_CATALOG_SALES":
    case "STORE_VISITS":
      return "vendas";
    case "OUTCOME_TRAFFIC":
    case "LINK_CLICKS":
      return "trafego";
    case "OUTCOME_AWARENESS":
    case "REACH":
    case "BRAND_AWARENESS":
      return "reconhecimento";
    case "OUTCOME_ENGAGEMENT":
    case "POST_ENGAGEMENT":
    case "PAGE_LIKES":
    case "EVENT_RESPONSES":
      return "engajamento";
    case "OUTCOME_APP_PROMOTION":
    case "APP_INSTALLS":
      return "instalacao_app";
    case "VIDEO_VIEWS":
      return "visualizacao_video";
    case "MESSAGES":
      return "mensagens";
    default:
      return null;
  }
}

/** Centavos (unidade mínima) → unidade da moeda. */
function deCentavos(v: unknown): number | null {
  const s = str(v);
  if (s === null || s === "") return null;
  return Math.round(num(s)) / 100;
}

function paraCentavos(v: number): number {
  return Math.round(v * 100);
}

/** Converte "2026-01-05T00:00:00-0300" → "2026-01-05" (mantém a data informada). */
function soData(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : null;
}

function mapearCta(cta: string | undefined): string {
  const c = (cta ?? "").trim().toLowerCase();
  const tabela: Record<string, string> = {
    "saiba mais": "LEARN_MORE",
    learn_more: "LEARN_MORE",
    "fale conosco": "CONTACT_US",
    contact_us: "CONTACT_US",
    "comprar agora": "SHOP_NOW",
    shop_now: "SHOP_NOW",
    "cadastre-se": "SIGN_UP",
    "cadastrar": "SIGN_UP",
    sign_up: "SIGN_UP",
    "enviar mensagem": "MESSAGE_PAGE",
    whatsapp: "WHATSAPP_MESSAGE",
    "baixar": "DOWNLOAD",
    download: "DOWNLOAD",
    "inscrever-se": "SUBSCRIBE",
    subscribe: "SUBSCRIBE",
    "agendar": "BOOK_TRAVEL",
    "obter oferta": "GET_OFFER",
    "solicitar orçamento": "GET_QUOTE",
    get_quote: "GET_QUOTE",
    "ligar": "CALL_NOW",
    "assistir": "WATCH_MORE",
  };
  if (c && tabela[c]) return tabela[c];
  if (/^[A-Z_]+$/.test(cta ?? "")) return cta as string;
  return "LEARN_MORE";
}

function primeiro(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function eUrl(caminho: string): boolean {
  return /^https?:\/\//i.test(caminho);
}

// ---------- métricas ----------

function somarAcoes(acoes: unknown, tipos: string[]): number | null {
  let total = 0;
  let achou = false;
  for (const item of lista(acoes)) {
    const a = obj(item);
    const tipo = str(a?.action_type);
    if (tipo && tipos.includes(tipo)) {
      total += num(a?.value);
      achou = true;
    }
  }
  return achou ? total : null;
}

/**
 * Conversões principais sem duplicar: `purchase` e `lead` já agregam as
 * variantes on-site/off-site; só caímos nas variantes quando o agregado não vem.
 */
function conversoesPrincipais(acoes: unknown): number {
  const compras = somarAcoes(acoes, ["purchase"]) ?? somarAcoes(acoes, ["offsite_conversion.fb_pixel_purchase"]) ?? 0;
  const leads =
    somarAcoes(acoes, ["lead"]) ??
    somarAcoes(acoes, ["onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]) ??
    0;
  return compras + leads;
}

function valorConversao(valores: unknown): number {
  return somarAcoes(valores, ["purchase"]) ?? somarAcoes(valores, ["offsite_conversion.fb_pixel_purchase"]) ?? 0;
}

// ---------- criação ----------

interface PlanoConjunto {
  optimization_goal: string;
  billing_event: string;
  promoted_object?: Record<string, unknown>;
  destination_type?: string;
  pendencias: string[];
}

function eventoPixel(spec: EspecificacaoCampanha): string {
  const ev = (spec.conversao?.evento ?? "").trim();
  const mapa: Record<string, string> = {
    lead: "LEAD",
    cadastro: "COMPLETE_REGISTRATION",
    complete_registration: "COMPLETE_REGISTRATION",
    purchase: "PURCHASE",
    compra: "PURCHASE",
    add_to_cart: "ADD_TO_CART",
    carrinho: "ADD_TO_CART",
    initiate_checkout: "INITIATE_CHECKOUT",
    contact: "CONTACT",
    contato: "CONTACT",
    schedule: "SCHEDULE",
    agendamento: "SCHEDULE",
    subscribe: "SUBSCRIBE",
    view_content: "CONTENT_VIEW",
  };
  if (ev && mapa[ev.toLowerCase()]) return mapa[ev.toLowerCase()];
  if (/^[A-Z_]+$/.test(ev)) return ev;
  return spec.objetivo === "vendas" ? "PURCHASE" : "LEAD";
}

function planejarConjunto(conta: Conta, spec: EspecificacaoCampanha): PlanoConjunto {
  const pixel = spec.conversao?.pixel_id ?? str(conta.config.pixel_id);
  const pendencias: string[] = [];
  switch (spec.objetivo) {
    case "leads":
    case "vendas":
      if (pixel) {
        return {
          optimization_goal: "OFFSITE_CONVERSIONS",
          billing_event: "IMPRESSIONS",
          promoted_object: { pixel_id: pixel, custom_event_type: eventoPixel(spec) },
          pendencias,
        };
      }
      pendencias.push(
        "Sem pixel_id (spec.conversao.pixel_id ou conta.config.pixel_id): o conjunto foi criado otimizando por cliques no link; ajuste a otimização para conversões no Gerenciador.",
      );
      return { optimization_goal: "LINK_CLICKS", billing_event: "IMPRESSIONS", pendencias };
    case "trafego":
      return { optimization_goal: "LINK_CLICKS", billing_event: "IMPRESSIONS", pendencias };
    case "reconhecimento":
      return { optimization_goal: "REACH", billing_event: "IMPRESSIONS", pendencias };
    case "engajamento":
      return { optimization_goal: "POST_ENGAGEMENT", billing_event: "IMPRESSIONS", pendencias };
    case "visualizacao_video":
      return { optimization_goal: "THRUPLAY", billing_event: "IMPRESSIONS", pendencias };
    case "mensagens":
      pendencias.push(
        "Objetivo 'mensagens' exige destino (WhatsApp/Messenger/Instagram) vinculado à página; o conjunto foi criado otimizando por cliques no link. Configure o destino de mensagens no Gerenciador.",
      );
      return { optimization_goal: "LINK_CLICKS", billing_event: "IMPRESSIONS", pendencias };
    case "instalacao_app":
      pendencias.push(
        "Objetivo 'instalacao_app' exige application_id e object_store_url do app; o conjunto foi criado otimizando por cliques no link. Vincule o app no Gerenciador.",
      );
      return { optimization_goal: "LINK_CLICKS", billing_event: "IMPRESSIONS", pendencias };
    default:
      return { optimization_goal: "LINK_CLICKS", billing_event: "IMPRESSIONS", pendencias };
  }
}

function montarTargeting(spec: EspecificacaoCampanha, pendencias: string[]): Record<string, unknown> {
  const locs = spec.publico.localizacoes ?? [];
  const paises = locs.filter((l) => /^[A-Za-z]{2}$/.test(l.trim())).map((l) => l.trim().toUpperCase());
  const outras = locs.filter((l) => !/^[A-Za-z]{2}$/.test(l.trim()));
  if (outras.length) {
    pendencias.push(
      `Localizações que não são país (${outras.join(", ")}) exigem chaves de região/cidade da Graph API e não foram aplicadas; ajuste a segmentação geográfica no Gerenciador.`,
    );
  }
  const targeting: Record<string, unknown> = {
    geo_locations: { countries: paises.length ? paises : ["BR"] },
    // Evita rejeição por público Advantage+ obrigatório nas versões novas.
    targeting_automation: { advantage_audience: 0 },
  };
  if (!paises.length) pendencias.push("Público sem país definido: segmentação criada para BR por padrão.");
  if (spec.publico.idade_min) targeting.age_min = Math.max(13, Math.min(65, Math.round(spec.publico.idade_min)));
  if (spec.publico.idade_max) targeting.age_max = Math.max(13, Math.min(65, Math.round(spec.publico.idade_max)));
  const generos = spec.publico.generos ?? [];
  if (generos.length && !generos.includes("todos")) {
    const codigos: number[] = [];
    if (generos.includes("masculino")) codigos.push(1);
    if (generos.includes("feminino")) codigos.push(2);
    if (codigos.length === 1) targeting.genders = codigos;
  }
  if (Array.isArray(spec.posicionamentos) && spec.posicionamentos.length) {
    pendencias.push(
      `Posicionamentos manuais (${spec.posicionamentos.join(", ")}) não foram traduzidos para publisher_platforms; o conjunto ficou com posicionamento automático.`,
    );
  }
  if (spec.publico.interesses?.length) {
    pendencias.push(
      `Interesses (${spec.publico.interesses.join(", ")}) exigem busca de ids via targetingsearch e não foram aplicados.`,
    );
  }
  if (spec.publico.publicos_personalizados?.length) {
    pendencias.push(
      `Públicos personalizados (${spec.publico.publicos_personalizados.join(", ")}) não foram aplicados: informe os ids de custom_audiences manualmente.`,
    );
  }
  return targeting;
}

/** Envia uma imagem (URL ou arquivo local) e devolve o image_hash. */
async function enviarImagem(conta: Conta, caminho: string): Promise<string> {
  const token = exigirToken();
  const endpoint = `${base()}/${contaId(conta)}/adimages`;
  let resposta: unknown;
  if (eUrl(caminho)) {
    resposta = await post<unknown>(`${contaId(conta)}/adimages`, { url: caminho });
  } else {
    const bytes = await readFile(caminho);
    const form = new FormData();
    form.set("access_token", token);
    form.set("filename", new Blob([bytes]), path.basename(caminho));
    try {
      resposta = await requisicao<unknown>("meta", endpoint, { method: "POST", body: form, timeoutMs: 120_000 });
    } catch (e) {
      traduzirErro(e);
    }
  }
  const imagens = obj(obj(resposta)?.images);
  for (const v of Object.values(imagens ?? {})) {
    const hash = str(obj(v)?.hash);
    if (hash) return hash;
  }
  throw new ErroPlataforma("meta", `Upload da imagem ${caminho} não devolveu image_hash.`, resposta);
}

// ---------- adaptador ----------

export const adaptadorMeta: AdaptadorPlataforma = {
  plataforma: "meta",

  credenciais() {
    return presencas(VARIAVEIS);
  },

  validarSpec(spec: EspecificacaoCampanha, conta: Conta): ResultadoValidacao {
    const r = validarSpecBasica(spec);
    const moeda = (conta.moeda || "BRL").toUpperCase();
    if (spec.orcamento_diario !== undefined) {
      if (moeda === "BRL" && spec.orcamento_diario < 6) {
        r.erros.push(`Orçamento diário de R$ ${spec.orcamento_diario} abaixo do mínimo do Meta (~R$ 6).`);
      } else if (moeda !== "BRL" && spec.orcamento_diario < 1) {
        r.avisos.push(`Orçamento diário ${spec.orcamento_diario} ${moeda} parece abaixo do mínimo do Meta.`);
      }
    }
    if (spec.orcamento_total && !spec.orcamento_diario && !spec.fim) {
      r.erros.push("Orçamento total (lifetime) no Meta exige data de fim.");
    }
    for (const [i, a] of spec.anuncios.entries()) {
      const rotulo = `Anúncio ${i + 1} (${a.nome})`;
      for (const t of ([] as string[]).concat(a.titulo ?? [])) {
        if (t.length > 40) r.avisos.push(`${rotulo}: título com ${t.length} caracteres (recomendado ≤ 40).`);
      }
      for (const t of ([] as string[]).concat(a.texto_principal ?? [])) {
        if (t.length > 125) r.avisos.push(`${rotulo}: texto principal com ${t.length} caracteres (recomendado ≤ 125).`);
      }
      if (a.formato === "texto") r.erros.push(`${rotulo}: formato 'texto' não existe no Meta.`);
      if (!a.midia?.length && a.formato !== "texto") {
        r.avisos.push(`${rotulo}: sem mídia — será registrado como pendência, não criado.`);
      } else if (a.formato !== "imagem") {
        r.avisos.push(`${rotulo}: formato '${a.formato}' só é criado manualmente (pendência); apenas 'imagem' é criado via API.`);
      }
    }
    if (!str(conta.config.page_id)) {
      r.avisos.push("conta.config.page_id ausente: anúncios não serão criados, só a campanha e o conjunto.");
    }
    if (["leads", "vendas"].includes(spec.objetivo) && !spec.conversao?.pixel_id && !str(conta.config.pixel_id)) {
      r.avisos.push("Sem pixel_id: o conjunto será otimizado por cliques, não por conversões.");
    }
    const naoPais = (spec.publico.localizacoes ?? []).filter((l) => !/^[A-Za-z]{2}$/.test(l.trim()));
    if (naoPais.length) r.avisos.push(`Localizações regionais (${naoPais.join(", ")}) não serão aplicadas automaticamente.`);
    r.ok = r.erros.length === 0;
    return r;
  },

  async listarCampanhas(conta: Conta): Promise<CampanhaRemota[]> {
    const linhas = await paginar(`${contaId(conta)}/campaigns`, {
      fields:
        "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time,bid_strategy,buying_type,special_ad_categories",
      limit: "200",
    });
    return linhas.map((c) => ({
      plataforma: "meta" as const,
      external_id: str(c.id) ?? "",
      nome: str(c.name) ?? "",
      status: mapearStatus(str(c.effective_status), str(c.status)),
      objetivo: mapearObjetivo(str(c.objective)),
      orcamento_diario: deCentavos(c.daily_budget),
      orcamento_total: deCentavos(c.lifetime_budget),
      inicio: soData(c.start_time),
      fim: soData(c.stop_time),
      raw: c,
    }));
  },

  async metricasDiarias(conta: Conta, inicio: string, fim: string): Promise<MetricaRemota[]> {
    const linhas = await paginar(`${contaId(conta)}/insights`, {
      level: "campaign",
      time_increment: "1",
      time_range: JSON.stringify({ since: inicio, until: fim }),
      fields: "campaign_id,campaign_name,impressions,clicks,spend,reach,actions,action_values",
      limit: "500",
    });
    return linhas
      .filter((l) => str(l.campaign_id))
      .map((l) => ({
        campanha_external_id: str(l.campaign_id) as string,
        data: str(l.date_start) ?? inicio,
        impressoes: num(l.impressions),
        cliques: num(l.clicks),
        gasto: num(l.spend),
        conversoes: conversoesPrincipais(l.actions),
        valor_conversao: valorConversao(l.action_values),
        alcance: num(l.reach),
        raw: l,
      }));
  },

  async criarCampanha(conta: Conta, spec: EspecificacaoCampanha, idempotencia: string): Promise<ResultadoCriacao> {
    exigirToken();
    const validacao = this.validarSpec(spec, conta);
    if (!validacao.ok) {
      throw new ErroPlataforma("meta", `Spec inválida: ${validacao.erros.join(" | ")}`);
    }

    // Idempotência: a Graph API não aceita chave; evitamos duplicar por nome.
    const existentes = await paginar(`${contaId(conta)}/campaigns`, {
      fields: "id,name,effective_status",
      filtering: JSON.stringify([{ field: "name", operator: "EQUAL", value: spec.nome }]),
      limit: "50",
    });
    const duplicada = existentes.find((c) => str(c.name) === spec.nome && str(c.effective_status) !== "DELETED");
    if (duplicada) {
      throw new ErroPlataforma(
        "meta",
        `Já existe campanha "${spec.nome}" nesta conta (id ${str(duplicada.id)}); não será duplicada. Renomeie a spec ou use a campanha existente.`,
        { existente: duplicada, idempotencia },
      );
    }

    const pendencias: string[] = [];
    const filhos: ResultadoCriacao["filhos"] = [];

    // 1) Campanha — sempre pausada; orçamento no nível da campanha (Advantage campaign budget).
    const campanha: Record<string, unknown> = {
      name: spec.nome,
      objective: OBJETIVO_PARA_META[spec.objetivo],
      status: "PAUSED",
      special_ad_categories: [],
      buying_type: "AUCTION",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    };
    if (spec.orcamento_diario) campanha.daily_budget = paraCentavos(spec.orcamento_diario);
    else if (spec.orcamento_total) campanha.lifetime_budget = paraCentavos(spec.orcamento_total);
    if (spec.lance?.valor && spec.lance.estrategia) {
      pendencias.push(
        `Estratégia de lance "${spec.lance.estrategia}" com valor ${spec.lance.valor} não foi aplicada (campanha criada com menor custo sem teto). Ajuste no Gerenciador.`,
      );
    }
    const respCampanha = await post<unknown>(`${contaId(conta)}/campaigns`, campanha);
    const campanhaId = str(obj(respCampanha)?.id);
    if (!campanhaId) throw new ErroPlataforma("meta", "Criação da campanha não devolveu id.", respCampanha);

    // 2) Conjunto de anúncios — targeting básico a partir de spec.publico.
    const plano = planejarConjunto(conta, spec);
    pendencias.push(...plano.pendencias);
    const targeting = montarTargeting(spec, pendencias);
    const conjunto: Record<string, unknown> = {
      name: `${spec.nome} — Conjunto 1`,
      campaign_id: campanhaId,
      status: "PAUSED",
      optimization_goal: plano.optimization_goal,
      billing_event: plano.billing_event,
      targeting,
    };
    if (plano.promoted_object) conjunto.promoted_object = plano.promoted_object;
    if (plano.destination_type) conjunto.destination_type = plano.destination_type;
    const agora = Date.now();
    if (spec.inicio) {
      const inicioMs = new Date(`${spec.inicio}T00:00:00`).getTime();
      if (inicioMs > agora) conjunto.start_time = new Date(inicioMs).toISOString();
    }
    if (spec.fim) conjunto.end_time = new Date(`${spec.fim}T23:59:59`).toISOString();
    else if (campanha.lifetime_budget) {
      throw new ErroPlataforma("meta", "Orçamento total exige data de fim no conjunto de anúncios.");
    }

    let conjuntoId: string | null = null;
    try {
      const respConjunto = await post<unknown>(`${contaId(conta)}/adsets`, conjunto);
      conjuntoId = str(obj(respConjunto)?.id);
      if (conjuntoId) filhos.push({ tipo: "conjunto", external_id: conjuntoId, nome: String(conjunto.name) });
    } catch (e) {
      // Campanha já existe; não a apagamos (sem exclusão neste contrato). Registramos a falha.
      pendencias.push(
        `Conjunto de anúncios não foi criado: ${e instanceof Error ? e.message : String(e)}. A campanha ${campanhaId} ficou pausada e sem conjunto.`,
      );
    }

    // 3) Anúncios — só com mídia e page_id; o resto vira pendência.
    const pageId = str(conta.config.page_id);
    for (const [i, a] of spec.anuncios.entries()) {
      const midia = a.midia?.[0];
      const podeCriar = Boolean(conjuntoId && pageId && midia && a.formato === "imagem");
      if (!podeCriar) {
        filhos.push({ tipo: "anuncio_pendente", external_id: "", nome: a.nome });
        const motivos: string[] = [];
        if (!conjuntoId) motivos.push("conjunto não criado");
        if (!pageId) motivos.push("conta.config.page_id ausente");
        if (!midia) motivos.push("sem mídia");
        if (a.formato !== "imagem") motivos.push(`formato '${a.formato}' só via Gerenciador`);
        pendencias.push(`Anúncio ${i + 1} (${a.nome}) não criado: ${motivos.join(", ")}.`);
        continue;
      }
      try {
        const hash = await enviarImagem(conta, midia as string);
        const link = a.url_destino ? (a.utm ? `${a.url_destino}${a.url_destino.includes("?") ? "&" : "?"}${a.utm.replace(/^[?&]/, "")}` : a.url_destino) : undefined;
        const linkData: Record<string, unknown> = {
          image_hash: hash,
          message: primeiro(a.texto_principal) ?? "",
        };
        if (link) {
          linkData.link = link;
          linkData.call_to_action = { type: mapearCta(a.cta), value: { link } };
        }
        if (primeiro(a.titulo)) linkData.name = primeiro(a.titulo);
        if (primeiro(a.descricao)) linkData.description = primeiro(a.descricao);
        const respCriativo = await post<unknown>(`${contaId(conta)}/adcreatives`, {
          name: `${a.nome} — Criativo`,
          object_story_spec: { page_id: pageId, link_data: linkData },
        });
        const criativoId = str(obj(respCriativo)?.id);
        if (!criativoId) throw new ErroPlataforma("meta", "Criação do criativo não devolveu id.", respCriativo);
        const respAnuncio = await post<unknown>(`${contaId(conta)}/ads`, {
          name: a.nome,
          adset_id: conjuntoId,
          creative: { creative_id: criativoId },
          status: "PAUSED",
        });
        const anuncioId = str(obj(respAnuncio)?.id);
        if (!anuncioId) throw new ErroPlataforma("meta", "Criação do anúncio não devolveu id.", respAnuncio);
        filhos.push({ tipo: "criativo", external_id: criativoId, nome: `${a.nome} — Criativo` });
        filhos.push({ tipo: "anuncio", external_id: anuncioId, nome: a.nome });
      } catch (e) {
        filhos.push({ tipo: "anuncio_pendente", external_id: "", nome: a.nome });
        pendencias.push(`Anúncio ${i + 1} (${a.nome}) falhou: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return {
      external_id: campanhaId,
      status: "pausada",
      filhos,
      raw: {
        idempotencia,
        campanha: respCampanha,
        conjunto_id: conjuntoId,
        objective: campanha.objective,
        optimization_goal: plano.optimization_goal,
        targeting,
        pendencias,
      },
    };
  },

  async alterarStatus(conta: Conta, external_id: string, status: "ativa" | "pausada"): Promise<void> {
    exigirToken();
    void conta;
    const resp = await post<unknown>(external_id, { status: status === "ativa" ? "ACTIVE" : "PAUSED" });
    if (obj(resp)?.success === false) {
      throw new ErroPlataforma("meta", `Alteração de status da campanha ${external_id} não confirmada.`, resp);
    }
  },

  async alterarOrcamentoDiario(conta: Conta, external_id: string, valor: number): Promise<void> {
    exigirToken();
    if (!Number.isFinite(valor) || valor <= 0) {
      throw new ErroPlataforma("meta", `Valor de orçamento inválido: ${valor}.`);
    }
    const centavos = paraCentavos(valor);
    const campanha = obj(await get<unknown>(external_id, { fields: "id,daily_budget,lifetime_budget" }));
    if (campanha && str(campanha.daily_budget)) {
      await post<unknown>(external_id, { daily_budget: centavos });
      return;
    }
    if (campanha && str(campanha.lifetime_budget)) {
      throw new ErroPlataforma(
        "meta",
        `Campanha ${external_id} usa orçamento total (lifetime), não diário; altere o lifetime_budget manualmente.`,
      );
    }
    // Sem orçamento na campanha: o orçamento está nos conjuntos.
    const conjuntos = await paginar(`${external_id}/adsets`, { fields: "id,name,daily_budget,effective_status", limit: "100" });
    const comOrcamento = conjuntos.filter((c) => str(c.daily_budget) && str(c.effective_status) !== "DELETED");
    if (comOrcamento.length === 1) {
      await post<unknown>(str(comOrcamento[0].id) as string, { daily_budget: centavos });
      return;
    }
    void conta;
    throw new ErroPlataforma(
      "meta",
      `Campanha ${external_id} não tem orçamento próprio e possui ${comOrcamento.length} conjuntos com orçamento diário; altere conjunto a conjunto.`,
      { conjuntos: comOrcamento.map((c) => ({ id: c.id, nome: c.name, daily_budget: c.daily_budget })) },
    );
  },
};
