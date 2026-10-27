import { agora, db, json } from "./db";
import type {
  Alerta,
  Campanha,
  Cliente,
  Conta,
  EspecificacaoCampanha,
  ExecucaoRotina,
  LogAcao,
  MetricaDiaria,
  MetricasAgregadas,
  Plataforma,
  Rascunho,
  Relatorio,
  Rotina,
  Severidade,
  StatusRascunho,
} from "./types";

// Camada fina de acesso a dados. Cada função converte linha SQLite → tipo de
// domínio (JSON em colunas TEXT, booleanos em INTEGER).

type Linha = Record<string, unknown>;

function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------- Clientes ----------

function paraCliente(l: Linha): Cliente {
  return l as unknown as Cliente;
}

export const clientes = {
  listar(): Cliente[] {
    return db().prepare("SELECT * FROM clientes ORDER BY nome").all().map((l) => paraCliente(l as Linha));
  },
  porId(id: number): Cliente | null {
    const l = db().prepare("SELECT * FROM clientes WHERE id = ?").get(id) as Linha | undefined;
    return l ? paraCliente(l) : null;
  },
  porSlug(slug: string): Cliente | null {
    const l = db().prepare("SELECT * FROM clientes WHERE slug = ?").get(slug) as Linha | undefined;
    return l ? paraCliente(l) : null;
  },
  /** Aceita id numérico ou slug. */
  resolver(ref: string | number): Cliente | null {
    if (typeof ref === "number" || /^\d+$/.test(String(ref))) return this.porId(Number(ref));
    return this.porSlug(String(ref));
  },
  criar(dados: { nome: string; segmento?: string | null; observacoes?: string | null; slug?: string }): Cliente {
    const slug = dados.slug ?? slugify(dados.nome);
    const r = db()
      .prepare("INSERT INTO clientes (nome, slug, segmento, observacoes) VALUES (?, ?, ?, ?)")
      .run(dados.nome, slug, dados.segmento ?? null, dados.observacoes ?? null);
    return this.porId(Number(r.lastInsertRowid))!;
  },
  atualizar(id: number, dados: Partial<Pick<Cliente, "nome" | "segmento" | "observacoes">>): Cliente | null {
    const atual = this.porId(id);
    if (!atual) return null;
    db()
      .prepare("UPDATE clientes SET nome = ?, segmento = ?, observacoes = ? WHERE id = ?")
      .run(dados.nome ?? atual.nome, dados.segmento ?? atual.segmento, dados.observacoes ?? atual.observacoes, id);
    return this.porId(id);
  },
  remover(id: number): void {
    db().prepare("DELETE FROM clientes WHERE id = ?").run(id);
  },
};

// ---------- Contas ----------

function paraConta(l: Linha): Conta {
  return {
    ...(l as unknown as Conta),
    ativa: Boolean(l.ativa),
    config: json(l.config as string, {}),
  };
}

export const contas = {
  listar(filtro: { cliente_id?: number; plataforma?: Plataforma; apenasAtivas?: boolean } = {}): Conta[] {
    const cond: string[] = [];
    const args: unknown[] = [];
    if (filtro.cliente_id) {
      cond.push("cliente_id = ?");
      args.push(filtro.cliente_id);
    }
    if (filtro.plataforma) {
      cond.push("plataforma = ?");
      args.push(filtro.plataforma);
    }
    if (filtro.apenasAtivas) cond.push("ativa = 1");
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    return db()
      .prepare(`SELECT * FROM contas ${where} ORDER BY plataforma, nome`)
      .all(...args)
      .map((l) => paraConta(l as Linha));
  },
  porId(id: number): Conta | null {
    const l = db().prepare("SELECT * FROM contas WHERE id = ?").get(id) as Linha | undefined;
    return l ? paraConta(l) : null;
  },
  criar(dados: {
    cliente_id: number;
    plataforma: Plataforma;
    account_id: string;
    nome: string;
    moeda?: string;
    fuso?: string;
    config?: Record<string, unknown>;
  }): Conta {
    const r = db()
      .prepare(
        `INSERT INTO contas (cliente_id, plataforma, account_id, nome, moeda, fuso, config)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dados.cliente_id,
        dados.plataforma,
        dados.account_id,
        dados.nome,
        dados.moeda ?? "BRL",
        dados.fuso ?? "America/Sao_Paulo",
        JSON.stringify(dados.config ?? {}),
      );
    return this.porId(Number(r.lastInsertRowid))!;
  },
  atualizar(id: number, dados: Partial<Pick<Conta, "nome" | "ativa" | "config" | "moeda" | "fuso">>): Conta | null {
    const atual = this.porId(id);
    if (!atual) return null;
    db()
      .prepare("UPDATE contas SET nome = ?, ativa = ?, config = ?, moeda = ?, fuso = ? WHERE id = ?")
      .run(
        dados.nome ?? atual.nome,
        (dados.ativa ?? atual.ativa) ? 1 : 0,
        JSON.stringify(dados.config ?? atual.config),
        dados.moeda ?? atual.moeda,
        dados.fuso ?? atual.fuso,
        id,
      );
    return this.porId(id);
  },
  marcarSincronizada(id: number): void {
    db().prepare("UPDATE contas SET sincronizada_em = ? WHERE id = ?").run(agora(), id);
  },
  remover(id: number): void {
    db().prepare("DELETE FROM contas WHERE id = ?").run(id);
  },
};

// ---------- Campanhas ----------

function paraCampanha(l: Linha): Campanha {
  return { ...(l as unknown as Campanha), raw: json(l.raw as string, {}) };
}

export interface CampanhaComContexto extends Campanha {
  conta_nome: string;
  cliente_id: number;
  cliente_nome: string;
  cliente_slug: string;
  moeda: string;
}

const SQL_CAMPANHA_CTX = `
  SELECT c.*, k.nome AS conta_nome, k.moeda, k.cliente_id, cl.nome AS cliente_nome, cl.slug AS cliente_slug
  FROM campanhas c
  JOIN contas k ON k.id = c.conta_id
  JOIN clientes cl ON cl.id = k.cliente_id`;

export const campanhas = {
  listar(filtro: { cliente_id?: number; conta_id?: number; plataforma?: Plataforma; status?: string } = {}): CampanhaComContexto[] {
    const cond: string[] = [];
    const args: unknown[] = [];
    if (filtro.cliente_id) {
      cond.push("k.cliente_id = ?");
      args.push(filtro.cliente_id);
    }
    if (filtro.conta_id) {
      cond.push("c.conta_id = ?");
      args.push(filtro.conta_id);
    }
    if (filtro.plataforma) {
      cond.push("c.plataforma = ?");
      args.push(filtro.plataforma);
    }
    if (filtro.status) {
      cond.push("c.status = ?");
      args.push(filtro.status);
    }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    return db()
      .prepare(`${SQL_CAMPANHA_CTX} ${where} ORDER BY cl.nome, c.plataforma, c.status, c.nome`)
      .all(...args)
      .map((l) => ({ ...paraCampanha(l as Linha), ...(l as Linha) }) as CampanhaComContexto)
      .map((c) => ({ ...c, raw: json(c.raw as unknown as string, c.raw) }));
  },
  porId(id: number): CampanhaComContexto | null {
    const l = db().prepare(`${SQL_CAMPANHA_CTX} WHERE c.id = ?`).get(id) as Linha | undefined;
    if (!l) return null;
    return { ...(l as unknown as CampanhaComContexto), raw: json(l.raw as string, {}) };
  },
  porExternalId(conta_id: number, external_id: string): Campanha | null {
    const l = db()
      .prepare("SELECT * FROM campanhas WHERE conta_id = ? AND external_id = ?")
      .get(conta_id, external_id) as Linha | undefined;
    return l ? paraCampanha(l) : null;
  },
  /** Insere ou atualiza pela chave (conta, external_id). Devolve o id local. */
  upsert(conta_id: number, c: Omit<Campanha, "id" | "conta_id" | "sincronizada_em">): number {
    db()
      .prepare(
        `INSERT INTO campanhas (conta_id, plataforma, external_id, nome, status, objetivo, orcamento_diario, orcamento_total, inicio, fim, raw, sincronizada_em)
         VALUES (@conta_id, @plataforma, @external_id, @nome, @status, @objetivo, @orcamento_diario, @orcamento_total, @inicio, @fim, @raw, @agora)
         ON CONFLICT(conta_id, external_id) DO UPDATE SET
           nome = excluded.nome, status = excluded.status, objetivo = excluded.objetivo,
           orcamento_diario = excluded.orcamento_diario, orcamento_total = excluded.orcamento_total,
           inicio = excluded.inicio, fim = excluded.fim, raw = excluded.raw, sincronizada_em = excluded.sincronizada_em`,
      )
      .run({
        conta_id,
        plataforma: c.plataforma,
        external_id: c.external_id,
        nome: c.nome,
        status: c.status,
        objetivo: c.objetivo,
        orcamento_diario: c.orcamento_diario,
        orcamento_total: c.orcamento_total,
        inicio: c.inicio,
        fim: c.fim,
        raw: JSON.stringify(c.raw ?? {}),
        agora: agora(),
      });
    return this.porExternalId(conta_id, c.external_id)!.id;
  },
  atualizarStatusLocal(id: number, status: Campanha["status"]): void {
    db().prepare("UPDATE campanhas SET status = ? WHERE id = ?").run(status, id);
  },
  atualizarOrcamentoLocal(id: number, orcamento_diario: number): void {
    db().prepare("UPDATE campanhas SET orcamento_diario = ? WHERE id = ?").run(orcamento_diario, id);
  },
};

// ---------- Métricas ----------

export function agregar(linhas: Array<Partial<MetricaDiaria>>): MetricasAgregadas {
  const s = { impressoes: 0, cliques: 0, gasto: 0, conversoes: 0, valor_conversao: 0, alcance: 0 };
  for (const l of linhas) {
    s.impressoes += l.impressoes ?? 0;
    s.cliques += l.cliques ?? 0;
    s.gasto += l.gasto ?? 0;
    s.conversoes += l.conversoes ?? 0;
    s.valor_conversao += l.valor_conversao ?? 0;
    s.alcance += l.alcance ?? 0;
  }
  const div = (a: number, b: number) => (b > 0 ? a / b : null);
  return {
    ...s,
    gasto: Math.round(s.gasto * 100) / 100,
    ctr: div(s.cliques, s.impressoes),
    cpc: div(s.gasto, s.cliques),
    cpm: s.impressoes > 0 ? (s.gasto / s.impressoes) * 1000 : null,
    cpa: div(s.gasto, s.conversoes),
    // ROAS só faz sentido quando há receita atribuída; sem ela fica nulo, não zero.
    roas: s.valor_conversao > 0 ? div(s.valor_conversao, s.gasto) : null,
  };
}

export interface FiltroMetricas {
  cliente_id?: number;
  conta_id?: number;
  campanha_id?: number;
  plataforma?: Plataforma;
  inicio: string;
  fim: string;
}

function whereMetricas(f: FiltroMetricas): { where: string; args: unknown[] } {
  const cond = ["m.data BETWEEN ? AND ?"];
  const args: unknown[] = [f.inicio, f.fim];
  if (f.cliente_id) {
    cond.push("k.cliente_id = ?");
    args.push(f.cliente_id);
  }
  if (f.conta_id) {
    cond.push("c.conta_id = ?");
    args.push(f.conta_id);
  }
  if (f.campanha_id) {
    cond.push("m.campanha_id = ?");
    args.push(f.campanha_id);
  }
  if (f.plataforma) {
    cond.push("c.plataforma = ?");
    args.push(f.plataforma);
  }
  return { where: `WHERE ${cond.join(" AND ")}`, args };
}

const SQL_METRICAS_BASE = `
  FROM metricas_diarias m
  JOIN campanhas c ON c.id = m.campanha_id
  JOIN contas k ON k.id = c.conta_id`;

export const metricas = {
  upsert(campanha_id: number, m: Omit<MetricaDiaria, "id" | "campanha_id">): void {
    db()
      .prepare(
        `INSERT INTO metricas_diarias (campanha_id, data, impressoes, cliques, gasto, conversoes, valor_conversao, alcance, raw)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(campanha_id, data) DO UPDATE SET
           impressoes = excluded.impressoes, cliques = excluded.cliques, gasto = excluded.gasto,
           conversoes = excluded.conversoes, valor_conversao = excluded.valor_conversao,
           alcance = excluded.alcance, raw = excluded.raw`,
      )
      .run(
        campanha_id,
        m.data,
        m.impressoes,
        m.cliques,
        m.gasto,
        m.conversoes,
        m.valor_conversao,
        m.alcance,
        JSON.stringify(m.raw ?? {}),
      );
  },
  totais(f: FiltroMetricas): MetricasAgregadas {
    const { where, args } = whereMetricas(f);
    const linhas = db()
      .prepare(`SELECT m.impressoes, m.cliques, m.gasto, m.conversoes, m.valor_conversao, m.alcance ${SQL_METRICAS_BASE} ${where}`)
      .all(...args) as Array<Partial<MetricaDiaria>>;
    return agregar(linhas);
  },
  porDia(f: FiltroMetricas): Array<{ data: string } & MetricasAgregadas> {
    const { where, args } = whereMetricas(f);
    const linhas = db()
      .prepare(
        `SELECT m.data, SUM(m.impressoes) impressoes, SUM(m.cliques) cliques, SUM(m.gasto) gasto,
                SUM(m.conversoes) conversoes, SUM(m.valor_conversao) valor_conversao, SUM(m.alcance) alcance
         ${SQL_METRICAS_BASE} ${where} GROUP BY m.data ORDER BY m.data`,
      )
      .all(...args) as Array<Partial<MetricaDiaria> & { data: string }>;
    return linhas.map((l) => ({ data: l.data, ...agregar([l]) }));
  },
  porCampanha(f: FiltroMetricas): Array<{ campanha: CampanhaComContexto } & MetricasAgregadas> {
    const { where, args } = whereMetricas(f);
    const linhas = db()
      .prepare(
        `SELECT m.campanha_id, SUM(m.impressoes) impressoes, SUM(m.cliques) cliques, SUM(m.gasto) gasto,
                SUM(m.conversoes) conversoes, SUM(m.valor_conversao) valor_conversao, SUM(m.alcance) alcance
         ${SQL_METRICAS_BASE} ${where} GROUP BY m.campanha_id ORDER BY gasto DESC`,
      )
      .all(...args) as Array<Partial<MetricaDiaria> & { campanha_id: number }>;
    return linhas
      .map((l) => ({ campanha: campanhas.porId(l.campanha_id), ...agregar([l]) }))
      .filter((x): x is { campanha: CampanhaComContexto } & MetricasAgregadas => Boolean(x.campanha));
  },
  porPlataforma(f: FiltroMetricas): Array<{ plataforma: Plataforma } & MetricasAgregadas> {
    const { where, args } = whereMetricas(f);
    const linhas = db()
      .prepare(
        `SELECT c.plataforma, SUM(m.impressoes) impressoes, SUM(m.cliques) cliques, SUM(m.gasto) gasto,
                SUM(m.conversoes) conversoes, SUM(m.valor_conversao) valor_conversao, SUM(m.alcance) alcance
         ${SQL_METRICAS_BASE} ${where} GROUP BY c.plataforma ORDER BY gasto DESC`,
      )
      .all(...args) as Array<Partial<MetricaDiaria> & { plataforma: Plataforma }>;
    return linhas.map((l) => ({ plataforma: l.plataforma, ...agregar([l]) }));
  },
  porCliente(f: FiltroMetricas): Array<{ cliente: Cliente } & MetricasAgregadas> {
    const { where, args } = whereMetricas(f);
    const linhas = db()
      .prepare(
        `SELECT k.cliente_id, SUM(m.impressoes) impressoes, SUM(m.cliques) cliques, SUM(m.gasto) gasto,
                SUM(m.conversoes) conversoes, SUM(m.valor_conversao) valor_conversao, SUM(m.alcance) alcance
         ${SQL_METRICAS_BASE} ${where} GROUP BY k.cliente_id ORDER BY gasto DESC`,
      )
      .all(...args) as Array<Partial<MetricaDiaria> & { cliente_id: number }>;
    return linhas
      .map((l) => ({ cliente: clientes.porId(l.cliente_id), ...agregar([l]) }))
      .filter((x): x is { cliente: Cliente } & MetricasAgregadas => Boolean(x.cliente));
  },
  diariasDaCampanha(campanha_id: number, inicio: string, fim: string): MetricaDiaria[] {
    return (
      db()
        .prepare("SELECT * FROM metricas_diarias WHERE campanha_id = ? AND data BETWEEN ? AND ? ORDER BY data")
        .all(campanha_id, inicio, fim) as Linha[]
    ).map((l) => ({ ...(l as unknown as MetricaDiaria), raw: json(l.raw as string, {}) }));
  },
  ultimaData(): string | null {
    const l = db().prepare("SELECT MAX(data) d FROM metricas_diarias").get() as { d: string | null };
    return l?.d ?? null;
  },
};

// ---------- Rascunhos ----------

function paraRascunho(l: Linha): Rascunho {
  return {
    ...(l as unknown as Rascunho),
    spec: json(l.spec as string, {} as EspecificacaoCampanha),
    validacao: json(l.validacao as string | null, null),
  };
}

export interface RascunhoComContexto extends Rascunho {
  cliente_nome: string;
  cliente_slug: string;
  conta_nome: string;
}

export const rascunhos = {
  listar(filtro: { cliente_id?: number; status?: StatusRascunho } = {}): RascunhoComContexto[] {
    const cond: string[] = [];
    const args: unknown[] = [];
    if (filtro.cliente_id) {
      cond.push("r.cliente_id = ?");
      args.push(filtro.cliente_id);
    }
    if (filtro.status) {
      cond.push("r.status = ?");
      args.push(filtro.status);
    }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    return (
      db()
        .prepare(
          `SELECT r.*, cl.nome cliente_nome, cl.slug cliente_slug, k.nome conta_nome
           FROM rascunhos r JOIN clientes cl ON cl.id = r.cliente_id JOIN contas k ON k.id = r.conta_id
           ${where} ORDER BY r.atualizado_em DESC`,
        )
        .all(...args) as Linha[]
    ).map((l) => paraRascunho(l) as RascunhoComContexto);
  },
  porId(id: number): RascunhoComContexto | null {
    const l = db()
      .prepare(
        `SELECT r.*, cl.nome cliente_nome, cl.slug cliente_slug, k.nome conta_nome
         FROM rascunhos r JOIN clientes cl ON cl.id = r.cliente_id JOIN contas k ON k.id = r.conta_id WHERE r.id = ?`,
      )
      .get(id) as Linha | undefined;
    return l ? (paraRascunho(l) as RascunhoComContexto) : null;
  },
  criar(dados: { cliente_id: number; conta_id: number; plataforma: Plataforma; spec: EspecificacaoCampanha }): RascunhoComContexto {
    const r = db()
      .prepare(
        `INSERT INTO rascunhos (cliente_id, conta_id, plataforma, nome, spec) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(dados.cliente_id, dados.conta_id, dados.plataforma, dados.spec.nome, JSON.stringify(dados.spec));
    return this.porId(Number(r.lastInsertRowid))!;
  },
  atualizar(
    id: number,
    dados: Partial<Pick<Rascunho, "spec" | "status" | "validacao" | "external_id" | "aprovado_por" | "aprovado_em" | "publicado_em" | "erro">>,
  ): RascunhoComContexto | null {
    const atual = this.porId(id);
    if (!atual) return null;
    const spec = dados.spec ?? atual.spec;
    db()
      .prepare(
        `UPDATE rascunhos SET nome = ?, spec = ?, status = ?, validacao = ?, external_id = ?, aprovado_por = ?,
         aprovado_em = ?, publicado_em = ?, erro = ?, atualizado_em = ? WHERE id = ?`,
      )
      .run(
        spec.nome,
        JSON.stringify(spec),
        dados.status ?? atual.status,
        JSON.stringify(dados.validacao === undefined ? atual.validacao : dados.validacao),
        dados.external_id === undefined ? atual.external_id : dados.external_id,
        dados.aprovado_por === undefined ? atual.aprovado_por : dados.aprovado_por,
        dados.aprovado_em === undefined ? atual.aprovado_em : dados.aprovado_em,
        dados.publicado_em === undefined ? atual.publicado_em : dados.publicado_em,
        dados.erro === undefined ? atual.erro : dados.erro,
        agora(),
        id,
      );
    return this.porId(id);
  },
};

// ---------- Relatórios ----------

function paraRelatorio(l: Linha): Relatorio {
  return { ...(l as unknown as Relatorio), dados: json(l.dados as string, {}) };
}

export const relatorios = {
  listar(filtro: { cliente_id?: number } = {}): Array<Relatorio & { cliente_nome: string | null }> {
    const where = filtro.cliente_id ? "WHERE r.cliente_id = ?" : "";
    const args = filtro.cliente_id ? [filtro.cliente_id] : [];
    return (
      db()
        .prepare(
          `SELECT r.*, cl.nome cliente_nome FROM relatorios r LEFT JOIN clientes cl ON cl.id = r.cliente_id ${where} ORDER BY r.criado_em DESC`,
        )
        .all(...args) as Linha[]
    ).map((l) => paraRelatorio(l) as Relatorio & { cliente_nome: string | null });
  },
  porId(id: number): (Relatorio & { cliente_nome: string | null }) | null {
    const l = db()
      .prepare("SELECT r.*, cl.nome cliente_nome FROM relatorios r LEFT JOIN clientes cl ON cl.id = r.cliente_id WHERE r.id = ?")
      .get(id) as Linha | undefined;
    return l ? (paraRelatorio(l) as Relatorio & { cliente_nome: string | null }) : null;
  },
  criar(dados: Omit<Relatorio, "id" | "criado_em">): Relatorio {
    const r = db()
      .prepare(
        `INSERT INTO relatorios (cliente_id, titulo, tipo, periodo_inicio, periodo_fim, resumo, conteudo_md, dados)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dados.cliente_id,
        dados.titulo,
        dados.tipo,
        dados.periodo_inicio,
        dados.periodo_fim,
        dados.resumo,
        dados.conteudo_md,
        JSON.stringify(dados.dados ?? {}),
      );
    return this.porId(Number(r.lastInsertRowid))!;
  },
  remover(id: number): void {
    db().prepare("DELETE FROM relatorios WHERE id = ?").run(id);
  },
};

// ---------- Rotinas ----------

function paraRotina(l: Linha): Rotina {
  return { ...(l as unknown as Rotina), ativa: Boolean(l.ativa), config: json(l.config as string, {}) };
}

export const rotinas = {
  listar(): Array<Rotina & { cliente_nome: string | null }> {
    return (
      db()
        .prepare("SELECT r.*, cl.nome cliente_nome FROM rotinas r LEFT JOIN clientes cl ON cl.id = r.cliente_id ORDER BY r.ativa DESC, r.nome")
        .all() as Linha[]
    ).map((l) => paraRotina(l) as Rotina & { cliente_nome: string | null });
  },
  porId(id: number): Rotina | null {
    const l = db().prepare("SELECT * FROM rotinas WHERE id = ?").get(id) as Linha | undefined;
    return l ? paraRotina(l) : null;
  },
  criar(dados: Omit<Rotina, "id" | "ultima_execucao" | "proxima_execucao">): Rotina {
    const r = db()
      .prepare(
        `INSERT INTO rotinas (nome, descricao, tipo, agenda, ativa, cliente_id, config, prompt_claude)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dados.nome,
        dados.descricao,
        dados.tipo,
        dados.agenda,
        dados.ativa ? 1 : 0,
        dados.cliente_id,
        JSON.stringify(dados.config ?? {}),
        dados.prompt_claude,
      );
    return this.porId(Number(r.lastInsertRowid))!;
  },
  atualizar(id: number, dados: Partial<Omit<Rotina, "id">>): Rotina | null {
    const atual = this.porId(id);
    if (!atual) return null;
    const novo = { ...atual, ...dados };
    db()
      .prepare(
        `UPDATE rotinas SET nome = ?, descricao = ?, tipo = ?, agenda = ?, ativa = ?, cliente_id = ?, config = ?,
         prompt_claude = ?, ultima_execucao = ?, proxima_execucao = ? WHERE id = ?`,
      )
      .run(
        novo.nome,
        novo.descricao,
        novo.tipo,
        novo.agenda,
        novo.ativa ? 1 : 0,
        novo.cliente_id,
        JSON.stringify(novo.config ?? {}),
        novo.prompt_claude,
        novo.ultima_execucao,
        novo.proxima_execucao,
        id,
      );
    return this.porId(id);
  },
  remover(id: number): void {
    db().prepare("DELETE FROM rotinas WHERE id = ?").run(id);
  },
};

function paraExecucao(l: Linha): ExecucaoRotina {
  return { ...(l as unknown as ExecucaoRotina), resultado: json(l.resultado as string, {}) };
}

export const execucoes = {
  listar(filtro: { rotina_id?: number; status?: ExecucaoRotina["status"]; limite?: number } = {}): Array<ExecucaoRotina & { rotina_nome: string }> {
    const cond: string[] = [];
    const args: unknown[] = [];
    if (filtro.rotina_id) {
      cond.push("e.rotina_id = ?");
      args.push(filtro.rotina_id);
    }
    if (filtro.status) {
      cond.push("e.status = ?");
      args.push(filtro.status);
    }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    return (
      db()
        .prepare(
          `SELECT e.*, r.nome rotina_nome FROM execucoes_rotina e JOIN rotinas r ON r.id = e.rotina_id ${where}
           ORDER BY e.iniciado_em DESC LIMIT ?`,
        )
        .all(...args, filtro.limite ?? 50) as Linha[]
    ).map((l) => paraExecucao(l) as ExecucaoRotina & { rotina_nome: string });
  },
  porId(id: number): ExecucaoRotina | null {
    const l = db().prepare("SELECT * FROM execucoes_rotina WHERE id = ?").get(id) as Linha | undefined;
    return l ? paraExecucao(l) : null;
  },
  iniciar(rotina_id: number): ExecucaoRotina {
    const r = db().prepare("INSERT INTO execucoes_rotina (rotina_id) VALUES (?)").run(rotina_id);
    return this.porId(Number(r.lastInsertRowid))!;
  },
  finalizar(id: number, status: ExecucaoRotina["status"], resultado: Record<string, unknown>, erro: string | null = null): ExecucaoRotina {
    db()
      .prepare("UPDATE execucoes_rotina SET finalizado_em = ?, status = ?, resultado = ?, erro = ? WHERE id = ?")
      .run(status === "pendente_claude" ? null : agora(), status, JSON.stringify(resultado), erro, id);
    return this.porId(id)!;
  },
};

// ---------- Alertas ----------

function paraAlerta(l: Linha): Alerta {
  return { ...(l as unknown as Alerta), dados: json(l.dados as string, {}) };
}

export const alertas = {
  listar(filtro: { apenasAbertos?: boolean; cliente_id?: number; limite?: number } = {}): Array<Alerta & { campanha_nome: string | null; cliente_nome: string | null }> {
    const cond: string[] = [];
    const args: unknown[] = [];
    if (filtro.apenasAbertos) cond.push("a.resolvido_em IS NULL");
    if (filtro.cliente_id) {
      cond.push("a.cliente_id = ?");
      args.push(filtro.cliente_id);
    }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    return (
      db()
        .prepare(
          `SELECT a.*, c.nome campanha_nome, cl.nome cliente_nome FROM alertas a
           LEFT JOIN campanhas c ON c.id = a.campanha_id LEFT JOIN clientes cl ON cl.id = a.cliente_id
           ${where} ORDER BY CASE a.severidade WHEN 'critico' THEN 0 WHEN 'atencao' THEN 1 ELSE 2 END, a.criado_em DESC LIMIT ?`,
        )
        .all(...args, filtro.limite ?? 200) as Linha[]
    ).map((l) => paraAlerta(l) as Alerta & { campanha_nome: string | null; cliente_nome: string | null });
  },
  /** Cria o alerta só se não houver um aberto igual (mesmo tipo e campanha). */
  registrar(dados: {
    cliente_id: number | null;
    campanha_id: number | null;
    tipo: string;
    severidade: Severidade;
    mensagem: string;
    dados?: Record<string, unknown>;
  }): Alerta | null {
    const existente = db()
      .prepare(
        "SELECT id FROM alertas WHERE tipo = ? AND resolvido_em IS NULL AND campanha_id IS ? AND cliente_id IS ?",
      )
      .get(dados.tipo, dados.campanha_id, dados.cliente_id) as { id: number } | undefined;
    if (existente) {
      db()
        .prepare("UPDATE alertas SET mensagem = ?, dados = ?, severidade = ? WHERE id = ?")
        .run(dados.mensagem, JSON.stringify(dados.dados ?? {}), dados.severidade, existente.id);
      return null;
    }
    const r = db()
      .prepare("INSERT INTO alertas (cliente_id, campanha_id, tipo, severidade, mensagem, dados) VALUES (?, ?, ?, ?, ?, ?)")
      .run(dados.cliente_id, dados.campanha_id, dados.tipo, dados.severidade, dados.mensagem, JSON.stringify(dados.dados ?? {}));
    const l = db().prepare("SELECT * FROM alertas WHERE id = ?").get(Number(r.lastInsertRowid)) as Linha;
    return paraAlerta(l);
  },
  resolver(id: number): void {
    db().prepare("UPDATE alertas SET resolvido_em = ? WHERE id = ?").run(agora(), id);
  },
  contarAbertos(): { total: number; criticos: number } {
    const l = db()
      .prepare("SELECT COUNT(*) total, SUM(severidade = 'critico') criticos FROM alertas WHERE resolvido_em IS NULL")
      .get() as { total: number; criticos: number | null };
    return { total: l.total, criticos: l.criticos ?? 0 };
  },
};

// ---------- Log de ações ----------

export const log = {
  registrar(dados: { tipo: string; alvo: string; antes?: Record<string, unknown> | null; depois?: Record<string, unknown> | null; autor?: string }): void {
    db()
      .prepare("INSERT INTO log_acoes (tipo, alvo, antes, depois, autor) VALUES (?, ?, ?, ?, ?)")
      .run(
        dados.tipo,
        dados.alvo,
        dados.antes ? JSON.stringify(dados.antes) : null,
        dados.depois ? JSON.stringify(dados.depois) : null,
        dados.autor ?? process.env.GESTOR_AUTOR ?? "claude",
      );
  },
  listar(limite = 50): LogAcao[] {
    return (db().prepare("SELECT * FROM log_acoes ORDER BY id DESC LIMIT ?").all(limite) as Linha[]).map((l) => ({
      ...(l as unknown as LogAcao),
      antes: json(l.antes as string | null, null),
      depois: json(l.depois as string | null, null),
    }));
  },
};
