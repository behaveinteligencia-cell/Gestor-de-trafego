import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

process.env.GESTOR_DB_PATH = ":memory:";
process.env.GESTOR_MODO = "demo";

import { resetarBancoParaTestes } from "../lib/db";
import { agregar, campanhas, clientes, contas, metricas, rascunhos } from "../lib/repos";
import { validarSpecBasica } from "../lib/plataformas/types";
import { aprovarRascunho, criarRascunho, ErroPublicacao, publicarRascunho, alterarOrcamentoCampanha } from "../lib/servicos/publicacao";
import { cronCasa, descreverCron, proximaOcorrencia } from "../lib/servicos/rotinas";
import { sincronizarConta } from "../lib/servicos/sync";
import { checarFadiga, checarPacing } from "../lib/servicos/analises";
import { coletarDados, periodoAnterior, renderizarMarkdown } from "../lib/servicos/relatorios";
import { markdownParaHtml } from "../lib/md";
import type { EspecificacaoCampanha } from "../lib/types";

const specValida = (): EspecificacaoCampanha => ({
  nome: "Teste leads",
  objetivo: "leads",
  orcamento_diario: 50,
  teto_gasto_diario: 100,
  publico: { localizacoes: ["BR"], idade_min: 25, idade_max: 55 },
  conversao: { evento: "Lead" },
  anuncios: [{ nome: "A1", formato: "imagem", titulo: "Título", texto_principal: "Texto", url_destino: "https://x.com", utm: "utm_source=meta" }],
});

describe("validação de spec", () => {
  it("aceita spec completa", () => {
    const r = validarSpecBasica(specValida());
    assert.equal(r.ok, true);
    assert.deepEqual(r.erros, []);
  });
  it("recusa sem teto e orçamento acima do teto", () => {
    const s = specValida();
    s.teto_gasto_diario = 0;
    assert.equal(validarSpecBasica(s).ok, false);
    s.teto_gasto_diario = 40;
    const r = validarSpecBasica(s);
    assert.ok(r.erros.some((e) => e.includes("acima do teto")));
  });
  it("recusa sem anúncios e datas invertidas", () => {
    const s = specValida();
    s.anuncios = [];
    s.inicio = "2026-12-01";
    s.fim = "2026-11-01";
    const r = validarSpecBasica(s);
    assert.equal(r.erros.length, 2);
  });
});

describe("portão de publicação (demo)", () => {
  let cliente_id: number;
  let conta_id: number;
  beforeEach(() => {
    resetarBancoParaTestes();
    cliente_id = clientes.criar({ nome: "Cliente Teste" }).id;
    conta_id = contas.criar({ cliente_id, plataforma: "meta", account_id: "act_t", nome: "Meta", config: { demo: true, teto_gasto_diario: 200 } }).id;
  });
  it("cria rascunho já validado em em_revisao", () => {
    const r = criarRascunho({ cliente_id, conta_id, spec: specValida() });
    assert.equal(r.status, "em_revisao");
    assert.equal(r.validacao?.ok, true);
  });
  it("não publica sem aprovação", async () => {
    const r = criarRascunho({ cliente_id, conta_id, spec: specValida() });
    await assert.rejects(() => publicarRascunho(r.id), ErroPublicacao);
  });
  it("não aprova sem nome nem rascunho inválido", () => {
    const r = criarRascunho({ cliente_id, conta_id, spec: specValida() });
    assert.throws(() => aprovarRascunho(r.id, ""), ErroPublicacao);
    const s = specValida();
    s.anuncios = [];
    const ruim = criarRascunho({ cliente_id, conta_id, spec: s });
    assert.throws(() => aprovarRascunho(ruim.id, "Alguém"), ErroPublicacao);
  });
  it("publica aprovado e a campanha nasce pausada", async () => {
    const r = criarRascunho({ cliente_id, conta_id, spec: specValida() });
    aprovarRascunho(r.id, "Ernandes");
    const pub = await publicarRascunho(r.id);
    assert.equal(pub.status, "publicado");
    assert.ok(pub.external_id);
    const c = campanhas.porExternalId(conta_id, pub.external_id!);
    assert.equal(c?.status, "pausada");
    await assert.rejects(() => publicarRascunho(r.id), /já foi publicado/);
  });
  it("orçamento respeita teto da conta e passo máximo", async () => {
    const r = criarRascunho({ cliente_id, conta_id, spec: specValida() });
    aprovarRascunho(r.id, "Ernandes");
    const pub = await publicarRascunho(r.id);
    const c = campanhas.porExternalId(conta_id, pub.external_id!)!;
    await assert.rejects(() => alterarOrcamentoCampanha(c.id, 60, ""), /motivo/);
    await assert.rejects(() => alterarOrcamentoCampanha(c.id, 300, "x"), /teto/);
    await assert.rejects(() => alterarOrcamentoCampanha(c.id, 120, "x"), /aprendizado/);
    const ok = await alterarOrcamentoCampanha(c.id, 70, "escala gradual");
    assert.equal(ok.orcamento_diario, 70);
    const forcado = await alterarOrcamentoCampanha(c.id, 150, "salto aprovado", undefined, true);
    assert.equal(forcado.orcamento_diario, 150);
  });
});

describe("sync demo, métricas e alertas", () => {
  beforeEach(() => resetarBancoParaTestes());
  it("sincroniza campanhas e métricas e agrega", async () => {
    const cliente_id = clientes.criar({ nome: "Demo" }).id;
    const conta = contas.criar({ cliente_id, plataforma: "meta", account_id: "act_d", nome: "Meta", config: { demo: true } });
    const r = await sincronizarConta(conta, 30);
    assert.equal(r.erro, null);
    assert.equal(r.campanhas, 4);
    assert.ok(r.metricas >= 4 * 30);
    const hoje = new Date().toISOString().slice(0, 10);
    const t = metricas.totais({ cliente_id, inicio: "2000-01-01", fim: hoje });
    assert.ok(t.gasto > 0 && t.ctr !== null && t.cpa !== null);
    const porPlat = metricas.porPlataforma({ inicio: "2000-01-01", fim: hoje });
    assert.equal(porPlat[0].plataforma, "meta");
    // fadiga sintética da campanha "Frio" dispara; pacing não (gasto ≈ orçamento)
    assert.ok(checarFadiga(cliente_id).length >= 1);
    assert.equal(checarPacing(cliente_id).length, 0);
    // o alerta não duplica
    assert.equal(checarFadiga(cliente_id).length, 0);
  });
  it("agregar calcula derivadas com divisão segura", () => {
    const a = agregar([{ impressoes: 1000, cliques: 20, gasto: 10, conversoes: 0, valor_conversao: 0, alcance: 0 }]);
    assert.equal(a.ctr, 0.02);
    assert.equal(a.cpc, 0.5);
    assert.equal(a.cpm, 10);
    assert.equal(a.cpa, null);
    assert.equal(a.roas, null);
  });
});

describe("relatórios", () => {
  beforeEach(() => resetarBancoParaTestes());
  it("período anterior tem o mesmo tamanho", () => {
    assert.deepEqual(periodoAnterior("2026-10-20", "2026-10-26"), { inicio: "2026-10-13", fim: "2026-10-19" });
  });
  it("renderiza markdown com tabelas e análise", async () => {
    const cliente_id = clientes.criar({ nome: "Demo" }).id;
    const conta = contas.criar({ cliente_id, plataforma: "google", account_id: "g", nome: "G", config: { demo: true } });
    await sincronizarConta(conta, 20);
    const hoje = new Date().toISOString().slice(0, 10);
    const d = coletarDados(cliente_id, "2000-01-01", hoje);
    const md = renderizarMarkdown(d, "Teste", "Análise do Claude aqui.");
    assert.ok(md.includes("## Análise"));
    assert.ok(md.includes("| Google Ads |"));
    const html = markdownParaHtml(md);
    assert.ok(html.includes("<table>") && html.includes("<h2>Análise</h2>"));
  });
});

describe("cron", () => {
  it("casa expressões comuns", () => {
    const seg8 = new Date(2026, 9, 26, 8, 30); // segunda-feira
    assert.equal(cronCasa("30 8 * * 1-5", seg8), true);
    assert.equal(cronCasa("30 8 * * 0,6", seg8), false);
    assert.equal(cronCasa("*/15 * * * *", new Date(2026, 0, 1, 0, 45)), true);
    assert.equal(cronCasa("0 7 * * 1", seg8), false);
  });
  it("calcula a próxima ocorrência", () => {
    const prox = proximaOcorrencia("0 7 * * 1", new Date(2026, 9, 26, 8, 0));
    assert.ok(prox);
    assert.equal(prox!.getDay(), 1);
    assert.equal(prox!.getHours(), 7);
    assert.ok(prox!.getTime() > new Date(2026, 9, 26, 8, 0).getTime());
  });
  it("descreve em português", () => {
    assert.equal(descreverCron("0 6 * * *"), "todo dia às 06:00");
    assert.equal(descreverCron("30 8 * * 1-5"), "dias úteis às 08:30");
    assert.equal(descreverCron("0 9 * * 1,4"), "seg, qui às 09:00");
  });
});

describe("rascunhos: listagem com contexto", () => {
  it("traz nome do cliente e da conta", () => {
    resetarBancoParaTestes();
    const cliente_id = clientes.criar({ nome: "Ctx" }).id;
    const conta_id = contas.criar({ cliente_id, plataforma: "tiktok", account_id: "t", nome: "TT", config: { demo: true } }).id;
    criarRascunho({ cliente_id, conta_id, spec: specValida() });
    const l = rascunhos.listar();
    assert.equal(l.length, 1);
    assert.equal(l[0].cliente_nome, "Ctx");
    assert.equal(l[0].conta_nome, "TT");
  });
});
