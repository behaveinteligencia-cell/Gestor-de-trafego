// Tipos compartilhados entre banco, adaptadores, serviços, CLI e interface.
// Toda a nomenclatura de domínio fica em português; identificadores de API
// externas (campaign_id, adset etc.) ficam em `raw`.

export const PLATAFORMAS = ["meta", "google", "tiktok", "linkedin"] as const;
export type Plataforma = (typeof PLATAFORMAS)[number];

export const NOMES_PLATAFORMA: Record<Plataforma, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  tiktok: "TikTok Ads",
  linkedin: "LinkedIn Ads",
};

export const STATUS_CAMPANHA = ["ativa", "pausada", "encerrada", "rascunho", "em_revisao", "desconhecido"] as const;
export type StatusCampanha = (typeof STATUS_CAMPANHA)[number];

export const OBJETIVOS = [
  "reconhecimento",
  "trafego",
  "engajamento",
  "leads",
  "vendas",
  "mensagens",
  "instalacao_app",
  "visualizacao_video",
] as const;
export type Objetivo = (typeof OBJETIVOS)[number];

export interface Cliente {
  id: number;
  nome: string;
  slug: string;
  segmento: string | null;
  observacoes: string | null;
  criado_em: string;
}

export interface Conta {
  id: number;
  cliente_id: number;
  plataforma: Plataforma;
  account_id: string; // id na plataforma (ex.: act_123, customer id, advertiser_id)
  nome: string;
  moeda: string;
  fuso: string;
  ativa: boolean;
  config: Record<string, unknown>; // ex.: pixel_id, login_customer_id, page_id
  sincronizada_em: string | null;
}

export interface Campanha {
  id: number;
  conta_id: number;
  plataforma: Plataforma;
  external_id: string;
  nome: string;
  status: StatusCampanha;
  objetivo: Objetivo | null;
  orcamento_diario: number | null;
  orcamento_total: number | null;
  inicio: string | null;
  fim: string | null;
  raw: Record<string, unknown>;
  sincronizada_em: string;
}

export interface MetricaDiaria {
  id: number;
  campanha_id: number;
  data: string; // YYYY-MM-DD
  impressoes: number;
  cliques: number;
  gasto: number;
  conversoes: number;
  valor_conversao: number;
  alcance: number;
  raw: Record<string, unknown>;
}

export interface MetricasAgregadas {
  impressoes: number;
  cliques: number;
  gasto: number;
  conversoes: number;
  valor_conversao: number;
  alcance: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  cpa: number | null;
  roas: number | null;
}

export const STATUS_RASCUNHO = ["rascunho", "em_revisao", "aprovado", "publicado", "erro", "cancelado"] as const;
export type StatusRascunho = (typeof STATUS_RASCUNHO)[number];

/** Especificação de campanha independente de plataforma; o adaptador traduz. */
export interface EspecificacaoCampanha {
  nome: string;
  objetivo: Objetivo;
  orcamento_diario?: number;
  orcamento_total?: number;
  inicio?: string;
  fim?: string;
  publico: {
    descricao?: string;
    localizacoes?: string[]; // ex.: ["BR", "BR-SP"]
    idade_min?: number;
    idade_max?: number;
    generos?: ("todos" | "masculino" | "feminino")[];
    interesses?: string[];
    publicos_personalizados?: string[];
    exclusoes?: string[];
  };
  posicionamentos?: "automatico" | string[];
  lance?: { estrategia: string; valor?: number };
  conversao?: { evento?: string; pixel_id?: string; destino?: string };
  anuncios: Array<{
    nome: string;
    formato: "imagem" | "video" | "carrossel" | "texto" | "responsivo";
    titulo?: string | string[];
    texto_principal?: string | string[];
    descricao?: string | string[];
    cta?: string;
    url_destino?: string;
    utm?: string;
    midia?: string[]; // caminhos/urls dos arquivos
  }>;
  palavras_chave?: Array<{ texto: string; correspondencia: "ampla" | "frase" | "exata" }>;
  negativas?: string[];
  observacoes?: string;
  // Teto de segurança: nenhum rascunho é publicado se o orçamento ultrapassar.
  teto_gasto_diario: number;
}

export interface Rascunho {
  id: number;
  cliente_id: number;
  conta_id: number;
  plataforma: Plataforma;
  nome: string;
  spec: EspecificacaoCampanha;
  status: StatusRascunho;
  validacao: { ok: boolean; erros: string[]; avisos: string[] } | null;
  external_id: string | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  publicado_em: string | null;
  erro: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface Relatorio {
  id: number;
  cliente_id: number | null;
  titulo: string;
  tipo: "desempenho" | "auditoria" | "semanal" | "mensal" | "personalizado";
  periodo_inicio: string;
  periodo_fim: string;
  resumo: string | null;
  conteudo_md: string;
  dados: Record<string, unknown>;
  criado_em: string;
}

export const TIPOS_ROTINA = [
  "sync",
  "pacing",
  "fadiga_criativa",
  "relatorio_semanal",
  "relatorio_mensal",
  "auditoria",
  "alerta_cpa",
  "personalizada",
] as const;
export type TipoRotina = (typeof TIPOS_ROTINA)[number];

export interface Rotina {
  id: number;
  nome: string;
  descricao: string | null;
  tipo: TipoRotina;
  agenda: string; // cron de 5 campos
  ativa: boolean;
  cliente_id: number | null;
  config: Record<string, unknown>;
  // Prompt que o Claude executa quando a rotina é dele (tipo "personalizada"
  // ou pós-processamento de uma rotina determinística).
  prompt_claude: string | null;
  ultima_execucao: string | null;
  proxima_execucao: string | null;
}

export interface ExecucaoRotina {
  id: number;
  rotina_id: number;
  iniciado_em: string;
  finalizado_em: string | null;
  status: "executando" | "ok" | "erro" | "pendente_claude";
  resultado: Record<string, unknown>;
  erro: string | null;
}

export const SEVERIDADES = ["info", "atencao", "critico"] as const;
export type Severidade = (typeof SEVERIDADES)[number];

export interface Alerta {
  id: number;
  cliente_id: number | null;
  campanha_id: number | null;
  tipo: string;
  severidade: Severidade;
  mensagem: string;
  dados: Record<string, unknown>;
  criado_em: string;
  resolvido_em: string | null;
}

export interface LogAcao {
  id: number;
  tipo: string; // ex.: "campanha.pausar", "rascunho.publicar"
  alvo: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  autor: string;
  criado_em: string;
}

export interface AgenteEspecializado {
  nome: string; // slug do arquivo
  titulo: string;
  descricao: string;
  ferramentas: string[];
  arquivo: string;
  corpo: string;
}

export interface SkillClaude {
  nome: string;
  descricao: string;
  comando: string;
  arquivo: string;
}
