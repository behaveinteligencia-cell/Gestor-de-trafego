import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// Banco SQLite local em data/gestor.db (ou GESTOR_DB_PATH). Um arquivo só,
// sem servidor: o app Next e a CLI abrem a mesma conexão.

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  segmento TEXT,
  observacoes TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  plataforma TEXT NOT NULL,
  account_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  moeda TEXT NOT NULL DEFAULT 'BRL',
  fuso TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  ativa INTEGER NOT NULL DEFAULT 1,
  config TEXT NOT NULL DEFAULT '{}',
  sincronizada_em TEXT,
  UNIQUE (plataforma, account_id)
);

CREATE TABLE IF NOT EXISTS campanhas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conta_id INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  plataforma TEXT NOT NULL,
  external_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'desconhecido',
  objetivo TEXT,
  orcamento_diario REAL,
  orcamento_total REAL,
  inicio TEXT,
  fim TEXT,
  raw TEXT NOT NULL DEFAULT '{}',
  sincronizada_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (conta_id, external_id)
);

CREATE TABLE IF NOT EXISTS metricas_diarias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campanha_id INTEGER NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  impressoes INTEGER NOT NULL DEFAULT 0,
  cliques INTEGER NOT NULL DEFAULT 0,
  gasto REAL NOT NULL DEFAULT 0,
  conversoes REAL NOT NULL DEFAULT 0,
  valor_conversao REAL NOT NULL DEFAULT 0,
  alcance INTEGER NOT NULL DEFAULT 0,
  raw TEXT NOT NULL DEFAULT '{}',
  UNIQUE (campanha_id, data)
);
CREATE INDEX IF NOT EXISTS idx_metricas_data ON metricas_diarias(data);

CREATE TABLE IF NOT EXISTS rascunhos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  conta_id INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  plataforma TEXT NOT NULL,
  nome TEXT NOT NULL,
  spec TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho',
  validacao TEXT,
  external_id TEXT,
  aprovado_por TEXT,
  aprovado_em TEXT,
  publicado_em TEXT,
  erro TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS relatorios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'desempenho',
  periodo_inicio TEXT NOT NULL,
  periodo_fim TEXT NOT NULL,
  resumo TEXT,
  conteudo_md TEXT NOT NULL,
  dados TEXT NOT NULL DEFAULT '{}',
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rotinas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT NOT NULL,
  agenda TEXT NOT NULL,
  ativa INTEGER NOT NULL DEFAULT 1,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  config TEXT NOT NULL DEFAULT '{}',
  prompt_claude TEXT,
  ultima_execucao TEXT,
  proxima_execucao TEXT
);

CREATE TABLE IF NOT EXISTS execucoes_rotina (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rotina_id INTEGER NOT NULL REFERENCES rotinas(id) ON DELETE CASCADE,
  iniciado_em TEXT NOT NULL DEFAULT (datetime('now')),
  finalizado_em TEXT,
  status TEXT NOT NULL DEFAULT 'executando',
  resultado TEXT NOT NULL DEFAULT '{}',
  erro TEXT
);

CREATE TABLE IF NOT EXISTS alertas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  campanha_id INTEGER REFERENCES campanhas(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,
  severidade TEXT NOT NULL DEFAULT 'info',
  mensagem TEXT NOT NULL,
  dados TEXT NOT NULL DEFAULT '{}',
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  resolvido_em TEXT
);

CREATE TABLE IF NOT EXISTS log_acoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  alvo TEXT NOT NULL,
  antes TEXT,
  depois TEXT,
  autor TEXT NOT NULL DEFAULT 'claude',
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export function caminhoBanco(): string {
  if (process.env.GESTOR_DB_PATH) return process.env.GESTOR_DB_PATH;
  return path.join(process.cwd(), "data", "gestor.db");
}

let instancia: Database.Database | null = null;

export function db(): Database.Database {
  if (instancia) return instancia;
  const caminho = caminhoBanco();
  if (caminho !== ":memory:") fs.mkdirSync(path.dirname(caminho), { recursive: true });
  instancia = new Database(caminho);
  instancia.exec(SCHEMA);
  return instancia;
}

/** Usado em testes: abre um banco novo em memória. */
export function resetarBancoParaTestes(): Database.Database {
  instancia?.close();
  instancia = new Database(":memory:");
  instancia.exec(SCHEMA);
  return instancia;
}

export function agora(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

export function json<T>(valor: string | null | undefined, padrao: T): T {
  if (!valor) return padrao;
  try {
    return JSON.parse(valor) as T;
  } catch {
    return padrao;
  }
}
