#!/usr/bin/env tsx
/**
 * CLI do Gestor de Tráfego — a interface que o Claude Code usa para operar.
 *
 *   npm run gestor -- <grupo> [subcomando] [args] [--opcao valor] [--json]
 *
 * Toda saída tem versão humana e `--json` para o Claude ler sem ambiguidade.
 * Carrega .env.local automaticamente (sem dependência externa).
 */
import fs from "node:fs";
import path from "node:path";
import { campanhas, clientes, contas, execucoes, log, rascunhos, relatorios, rotinas, alertas, metricas } from "../lib/repos";
import { adaptador, adaptadorReal, modoDemo } from "../lib/plataformas";
import { NOMES_PLATAFORMA, PLATAFORMAS, TIPOS_ROTINA, type Plataforma, type TipoRotina, type EspecificacaoCampanha } from "../lib/types";
import { sincronizar } from "../lib/servicos/sync";
import {
  alterarOrcamentoCampanha,
  alterarStatusCampanha,
  aprovarRascunho,
  cancelarRascunho,
  criarRascunho,
  publicarRascunho,
  validarRascunho,
} from "../lib/servicos/publicacao";
import { coletarDados, fmtMoeda, fmtNum, fmtPct, gerarRelatorio } from "../lib/servicos/relatorios";
import { checarCpa, checarFadiga, checarFrescor, checarPacing, resumoGeral } from "../lib/servicos/analises";
import { concluirExecucaoClaude, descreverCron, executarDevidas, executarRotina, rotinasDevidas, ROTINAS_PADRAO } from "../lib/servicos/rotinas";
import { listarAgentes, listarSkills } from "../lib/servicos/agentes";
import { semearDemo } from "../lib/servicos/demo";
import { caminhoBanco } from "../lib/db";

// ---------- .env.local ----------
for (const arq of [".env", ".env.local"]) {
  const p = path.join(process.cwd(), arq);
  if (!fs.existsSync(p)) continue;
  for (const linha of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || linha.trim().startsWith("#")) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// ---------- parser de argumentos ----------
interface Args {
  pos: string[];
  op: Record<string, string | boolean>;
}
function parse(argv: string[]): Args {
  const pos: string[] = [];
  const op: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=", 2);
      if (v !== undefined) op[k] = v;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) op[k] = argv[++i];
      else op[k] = true;
    } else pos.push(a);
  }
  return { pos, op };
}
const args = parse(process.argv.slice(2));
const JSON_OUT = args.op.json === true;
const str = (k: string): string | undefined => (typeof args.op[k] === "string" ? (args.op[k] as string) : undefined);
const num = (k: string): number | undefined => (str(k) !== undefined ? Number(str(k)) : undefined);

function saida(humano: () => void, dados: unknown) {
  if (JSON_OUT) console.log(JSON.stringify(dados, null, 2));
  else humano();
}
function falha(msg: string, codigo = 1): never {
  if (JSON_OUT) console.log(JSON.stringify({ erro: msg }));
  else console.error(`Erro: ${msg}`);
  process.exit(codigo);
}
function tabela(linhas: Array<Record<string, string | number | null | undefined>>) {
  if (!linhas.length) return console.log("(nada)");
  const cols = Object.keys(linhas[0]);
  const larg = cols.map((c) => Math.max(c.length, ...linhas.map((l) => String(l[c] ?? "").length)));
  console.log(cols.map((c, i) => c.padEnd(larg[i])).join("  "));
  console.log(larg.map((n) => "-".repeat(n)).join("  "));
  for (const l of linhas) console.log(cols.map((c, i) => String(l[c] ?? "").padEnd(larg[i])).join("  "));
}
function hojeMenos(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}
function resolverCliente(ref: string | undefined, obrigatorio = false) {
  if (!ref) {
    if (obrigatorio) falha("Informe --cliente <slug|id>.");
    return null;
  }
  const c = clientes.resolver(ref);
  if (!c) falha(`Cliente "${ref}" não encontrado. Veja: clientes listar`);
  return c;
}
function plataformaOp(): Plataforma | undefined {
  const p = str("plataforma");
  if (!p) return undefined;
  if (!(PLATAFORMAS as readonly string[]).includes(p)) falha(`Plataforma inválida: ${p}. Use ${PLATAFORMAS.join("|")}.`);
  return p as Plataforma;
}

// ---------- comandos ----------
const [grupo, sub, ...resto] = args.pos;

async function main() {
  switch (grupo) {
    case undefined:
    case "ajuda":
    case "help":
      return ajuda();
    case "status":
      return status();
    case "clientes":
      return cmdClientes();
    case "contas":
      return cmdContas();
    case "sync":
      return cmdSync();
    case "campanhas":
      return cmdCampanhas();
    case "metricas":
      return cmdMetricas();
    case "rascunhos":
      return cmdRascunhos();
    case "relatorios":
      return cmdRelatorios();
    case "rotinas":
      return cmdRotinas();
    case "alertas":
      return cmdAlertas();
    case "agentes":
      return cmdAgentes();
    case "log":
      return cmdLog();
    case "demo":
      return cmdDemo();
    default:
      falha(`Comando desconhecido: ${grupo}. Rode sem argumentos para ver a ajuda.`);
  }
}

function ajuda() {
  console.log(`Gestor de Tráfego — CLI

  status                                    visão geral: clientes, contas, credenciais, alertas
  clientes listar | criar --nome "X" [--segmento "..."]
  contas listar [--cliente slug] | adicionar --cliente slug --plataforma meta|google|tiktok|linkedin --account-id ID --nome "X" [--moeda BRL] [--demo] [--teto 500]
  sync [--cliente slug] [--plataforma p] [--dias 30]
  campanhas listar [--cliente] [--plataforma] [--status] | ver <id> [--dias 7]
  campanhas pausar <id> --motivo "..." | ativar <id> --motivo "..." | orcamento <id> --valor N --motivo "..." [--forcar]
  metricas [--cliente] [--plataforma] [--inicio AAAA-MM-DD] [--fim AAAA-MM-DD] [--por campanha|dia|plataforma|cliente]
  rascunhos listar | criar --cliente slug --conta ID --spec arquivo.json | ver <id> | validar <id> | aprovar <id> --por "Nome" | publicar <id> | cancelar <id>
  relatorios gerar --cliente slug --inicio D --fim D [--tipo semanal|mensal|desempenho|auditoria] [--titulo "..."] [--analise arquivo.md]
  relatorios listar | ver <id> [--md] | dados --cliente slug --inicio D --fim D
  rotinas listar | devidas [--executar] | executar <id|tipo> | ativar <id> | desativar <id> | padrao
  rotinas criar --nome "..." --tipo ${TIPOS_ROTINA.join("|")} --agenda "0 8 * * 1-5" [--cliente slug] [--prompt "..."] [--config '{}']
  rotinas pendentes | concluir <execucao_id> --resumo "..."
  checar pacing|fadiga|cpa|frescor [--cliente slug]      (atalho: rotinas executar <tipo>)
  alertas listar [--abertos] [--cliente] | resolver <id>
  agentes listar
  log [--n 50]
  demo seed

  Toda saída aceita --json.`);
}

function status() {
  const cls = clientes.listar();
  const cts = contas.listar();
  const credenciais = Object.fromEntries(
    PLATAFORMAS.map((p) => {
      const c = adaptadorReal(p).credenciais();
      return [p, { completas: c.completas, variaveis: c.presentes }];
    }),
  );
  const resumo = resumoGeral(7);
  const dados = {
    banco: caminhoBanco(),
    modo_demo_global: modoDemo(),
    clientes: cls.length,
    contas: cts.map((c) => ({ id: c.id, cliente_id: c.cliente_id, plataforma: c.plataforma, nome: c.nome, demo: c.config.demo === true, sincronizada_em: c.sincronizada_em })),
    credenciais,
    campanhas: resumo.campanhas,
    ultimos_7_dias: resumo.totais,
    alertas_abertos: resumo.alertas,
    ultima_metrica: resumo.ultima_metrica,
    rotinas_devidas: rotinasDevidas().map((r) => ({ id: r.id, nome: r.nome })),
    execucoes_pendentes_claude: execucoes.listar({ status: "pendente_claude" }).length,
  };
  saida(() => {
    console.log(`Banco: ${dados.banco}${dados.modo_demo_global ? "  (GESTOR_MODO=demo)" : ""}`);
    console.log(`Clientes: ${dados.clientes}   Contas: ${cts.length}   Campanhas: ${resumo.campanhas.ativas} ativas de ${resumo.campanhas.total}`);
    console.log(`Últimos 7 dias: ${fmtMoeda(resumo.totais.gasto)} | ${fmtNum(resumo.totais.conversoes, 1)} conv. | CPA ${fmtMoeda(resumo.totais.cpa)} | última métrica ${resumo.ultima_metrica ?? "—"}`);
    console.log(`Alertas abertos: ${resumo.alertas.total} (${resumo.alertas.criticos} críticos)   Rotinas devidas: ${dados.rotinas_devidas.length}   Execuções aguardando o Claude: ${dados.execucoes_pendentes_claude}`);
    console.log("\nCredenciais (presença, nunca valores):");
    for (const p of PLATAFORMAS) {
      const c = credenciais[p];
      const faltam = Object.entries(c.variaveis).filter(([, ok]) => !ok).map(([n]) => n);
      console.log(`  ${NOMES_PLATAFORMA[p].padEnd(13)} ${c.completas ? "ok" : `faltam: ${faltam.join(", ")}`}`);
    }
    if (cts.length) {
      console.log("\nContas:");
      tabela(cts.map((c) => ({ id: c.id, cliente: clientes.porId(c.cliente_id)?.nome, plataforma: c.plataforma, nome: c.nome, demo: c.config.demo ? "sim" : "", sync: c.sincronizada_em ?? "nunca" })));
    } else console.log("\nNenhuma conta. Comece com: clientes criar / contas adicionar — ou `demo seed` para conhecer o app.");
  }, dados);
}

function cmdClientes() {
  if (sub === "listar" || !sub) {
    const lista = clientes.listar().map((c) => ({ ...c, contas: contas.listar({ cliente_id: c.id }).length }));
    return saida(() => tabela(lista.map((c) => ({ id: c.id, slug: c.slug, nome: c.nome, segmento: c.segmento, contas: c.contas }))), lista);
  }
  if (sub === "criar") {
    const nome = str("nome") ?? falha("Informe --nome.");
    if (clientes.porSlug(nome.toLowerCase().replace(/[^a-z0-9]+/g, "-"))) falha("Já existe cliente com esse nome.");
    const c = clientes.criar({ nome, segmento: str("segmento") ?? null, observacoes: str("observacoes") ?? null });
    log.registrar({ tipo: "cliente.criar", alvo: `cliente:${c.id}`, depois: { nome } });
    return saida(() => console.log(`Cliente criado: #${c.id} ${c.nome} (slug ${c.slug})`), c);
  }
  if (sub === "remover") {
    const c = resolverCliente(resto[0], true)!;
    clientes.remover(c.id);
    return saida(() => console.log(`Cliente ${c.nome} removido (com contas e campanhas locais).`), { ok: true });
  }
  falha(`Subcomando inválido: clientes ${sub}`);
}

function cmdContas() {
  if (sub === "listar" || !sub) {
    const cl = resolverCliente(str("cliente"));
    const lista = contas.listar({ cliente_id: cl?.id, plataforma: plataformaOp() }).map((c) => ({ ...c, cliente: clientes.porId(c.cliente_id)?.nome }));
    return saida(() => tabela(lista.map((c) => ({ id: c.id, cliente: c.cliente, plataforma: c.plataforma, account_id: c.account_id, nome: c.nome, moeda: c.moeda, ativa: c.ativa ? "sim" : "não", demo: c.config.demo ? "sim" : "", teto: c.config.teto_gasto_diario as number | undefined }))), lista);
  }
  if (sub === "adicionar") {
    const cl = resolverCliente(str("cliente"), true)!;
    const plataforma = plataformaOp() ?? falha("Informe --plataforma.");
    const account_id = str("account-id") ?? str("account_id") ?? falha("Informe --account-id.");
    const nome = str("nome") ?? `${cl.nome} — ${NOMES_PLATAFORMA[plataforma]}`;
    const config: Record<string, unknown> = {};
    if (args.op.demo) config.demo = true;
    if (num("teto")) config.teto_gasto_diario = num("teto");
    if (str("config")) Object.assign(config, JSON.parse(str("config")!));
    const c = contas.criar({ cliente_id: cl.id, plataforma, account_id, nome, moeda: str("moeda"), fuso: str("fuso"), config });
    log.registrar({ tipo: "conta.adicionar", alvo: `conta:${c.id}`, depois: { plataforma, account_id, nome } });
    const cred = adaptador(plataforma, c).credenciais(c);
    return saida(() => {
      console.log(`Conta criada: #${c.id} ${c.nome} (${plataforma} ${account_id})`);
      if (!cred.completas) console.log(`Aviso: credenciais de ${plataforma} incompletas — defina em .env.local ou use --demo.`);
    }, { conta: c, credenciais: cred });
  }
  if (sub === "atualizar") {
    const id = Number(resto[0]) || falha("Informe o id da conta.");
    const dados: Record<string, unknown> = {};
    if (str("nome")) dados.nome = str("nome");
    if (args.op.ativar) dados.ativa = true;
    if (args.op.desativar) dados.ativa = false;
    const atual = contas.porId(id) ?? falha("Conta não encontrada.");
    const config = { ...atual.config };
    if (num("teto") !== undefined) config.teto_gasto_diario = num("teto");
    if (str("config")) Object.assign(config, JSON.parse(str("config")!));
    const c = contas.atualizar(id, { ...dados, config });
    return saida(() => console.log(`Conta #${id} atualizada.`), c);
  }
  if (sub === "remover") {
    const id = Number(resto[0]) || falha("Informe o id da conta.");
    contas.remover(id);
    return saida(() => console.log(`Conta #${id} removida.`), { ok: true });
  }
  falha(`Subcomando inválido: contas ${sub}`);
}

async function cmdSync() {
  const cl = resolverCliente(str("cliente"));
  const r = await sincronizar({ cliente_id: cl?.id, plataforma: plataformaOp(), dias: num("dias") ?? 30 });
  const dados = r.map((x) => ({ conta_id: x.conta.id, conta: x.conta.nome, plataforma: x.conta.plataforma, campanhas: x.campanhas, metricas: x.metricas, erro: x.erro }));
  saida(() => {
    if (!dados.length) console.log("Nenhuma conta ativa para sincronizar.");
    tabela(dados);
  }, dados);
  if (dados.some((d) => d.erro)) process.exitCode = 2;
}

async function cmdCampanhas() {
  if (sub === "listar" || !sub) {
    const cl = resolverCliente(str("cliente"));
    const lista = campanhas.listar({ cliente_id: cl?.id, plataforma: plataformaOp(), status: str("status") });
    const dias = num("dias") ?? 7;
    const comMetricas = lista.map((c) => ({ ...c, ultimos_dias: metricas.totais({ campanha_id: c.id, inicio: hojeMenos(dias - 1), fim: hojeMenos(0) }) }));
    return saida(
      () =>
        tabela(
          comMetricas.map((c) => ({
            id: c.id,
            cliente: c.cliente_nome,
            plataforma: c.plataforma,
            nome: c.nome.slice(0, 44),
            status: c.status,
            objetivo: c.objetivo,
            "orc/dia": c.orcamento_diario,
            [`gasto ${dias}d`]: fmtMoeda(c.ultimos_dias.gasto, c.moeda),
            conv: fmtNum(c.ultimos_dias.conversoes, 1),
            cpa: fmtMoeda(c.ultimos_dias.cpa, c.moeda),
            ctr: fmtPct(c.ultimos_dias.ctr),
          })),
        ),
      comMetricas,
    );
  }
  const id = Number(resto[0]);
  if (!id) falha("Informe o id da campanha.");
  if (sub === "ver") {
    const c = campanhas.porId(id) ?? falha("Campanha não encontrada.");
    const dias = num("dias") ?? 7;
    const diarias = metricas.diariasDaCampanha(id, hojeMenos(dias - 1), hojeMenos(0));
    const totais = metricas.totais({ campanha_id: id, inicio: hojeMenos(dias - 1), fim: hojeMenos(0) });
    const anteriores = metricas.totais({ campanha_id: id, inicio: hojeMenos(dias * 2 - 1), fim: hojeMenos(dias) });
    return saida(() => {
      console.log(`#${c.id} ${c.nome}\n${c.cliente_nome} · ${NOMES_PLATAFORMA[c.plataforma]} · ${c.status} · objetivo ${c.objetivo ?? "—"} · orçamento/dia ${fmtMoeda(c.orcamento_diario, c.moeda)} · id externo ${c.external_id}`);
      console.log(`\nÚltimos ${dias} dias: ${fmtMoeda(totais.gasto, c.moeda)} | ${fmtNum(totais.impressoes)} impr. | ${fmtNum(totais.cliques)} cliques | CTR ${fmtPct(totais.ctr)} | CPC ${fmtMoeda(totais.cpc, c.moeda)} | ${fmtNum(totais.conversoes, 1)} conv. | CPA ${fmtMoeda(totais.cpa, c.moeda)}`);
      console.log(`${dias} dias anteriores: ${fmtMoeda(anteriores.gasto, c.moeda)} | CTR ${fmtPct(anteriores.ctr)} | ${fmtNum(anteriores.conversoes, 1)} conv. | CPA ${fmtMoeda(anteriores.cpa, c.moeda)}\n`);
      tabela(diarias.map((d) => ({ data: d.data, gasto: d.gasto.toFixed(2), impr: d.impressoes, cliques: d.cliques, ctr: fmtPct(d.impressoes ? d.cliques / d.impressoes : null), conv: d.conversoes, cpa: d.conversoes ? (d.gasto / d.conversoes).toFixed(2) : "—" })));
    }, { campanha: c, totais, anteriores, diarias });
  }
  const motivo = str("motivo") ?? "";
  if (sub === "pausar" || sub === "ativar") {
    const c = await alterarStatusCampanha(id, sub === "pausar" ? "pausada" : "ativa", motivo, str("autor"));
    return saida(() => console.log(`Campanha #${id} agora está ${c.status}. Motivo registrado: ${motivo}`), c);
  }
  if (sub === "orcamento") {
    const valor = num("valor") ?? falha("Informe --valor.");
    const c = await alterarOrcamentoCampanha(id, valor, motivo, str("autor"), args.op.forcar === true);
    return saida(() => console.log(`Orçamento diário da campanha #${id} agora é ${fmtMoeda(c.orcamento_diario, c.moeda)}.`), c);
  }
  falha(`Subcomando inválido: campanhas ${sub}`);
}

function cmdMetricas() {
  const cl = resolverCliente(str("cliente"));
  const f = { cliente_id: cl?.id, plataforma: plataformaOp(), inicio: str("inicio") ?? hojeMenos(6), fim: str("fim") ?? hojeMenos(0), campanha_id: num("campanha") };
  const por = str("por") ?? "campanha";
  const totais = metricas.totais(f);
  let detalhe: unknown;
  if (por === "dia") detalhe = metricas.porDia(f);
  else if (por === "plataforma") detalhe = metricas.porPlataforma(f);
  else if (por === "cliente") detalhe = metricas.porCliente(f).map(({ cliente, ...m }) => ({ cliente: cliente.nome, slug: cliente.slug, ...m }));
  else detalhe = metricas.porCampanha(f).map(({ campanha, ...m }) => ({ id: campanha.id, nome: campanha.nome, plataforma: campanha.plataforma, status: campanha.status, orcamento_diario: campanha.orcamento_diario, ...m }));
  saida(() => {
    console.log(`Período ${f.inicio} a ${f.fim}${cl ? ` · ${cl.nome}` : ""}${f.plataforma ? ` · ${f.plataforma}` : ""}`);
    console.log(`Total: ${fmtMoeda(totais.gasto)} | ${fmtNum(totais.impressoes)} impr. | ${fmtNum(totais.cliques)} cliques | CTR ${fmtPct(totais.ctr)} | ${fmtNum(totais.conversoes, 1)} conv. | CPA ${fmtMoeda(totais.cpa)} | ROAS ${fmtNum(totais.roas, 2)}\n`);
    const linhas = (detalhe as Array<Record<string, unknown>>).map((l) => {
      const { impressoes, cliques, gasto, conversoes, valor_conversao: _v, alcance: _a, ctr, cpc, cpm: _c, cpa, roas, ...resto } = l as Record<string, number | string | null>;
      return { ...resto, gasto: fmtMoeda(gasto as number), impr: fmtNum(impressoes as number), cliques: fmtNum(cliques as number), ctr: fmtPct(ctr as number), cpc: fmtMoeda(cpc as number), conv: fmtNum(conversoes as number, 1), cpa: fmtMoeda(cpa as number), roas: fmtNum(roas as number, 2) };
    });
    tabela(linhas as Array<Record<string, string | number | null>>);
  }, { periodo: { inicio: f.inicio, fim: f.fim }, totais, por, detalhe });
}

async function cmdRascunhos() {
  if (sub === "listar" || !sub) {
    const cl = resolverCliente(str("cliente"));
    const lista = rascunhos.listar({ cliente_id: cl?.id });
    return saida(() => tabela(lista.map((r) => ({ id: r.id, cliente: r.cliente_nome, plataforma: r.plataforma, nome: r.nome.slice(0, 40), status: r.status, valido: r.validacao ? (r.validacao.ok ? "sim" : "não") : "?", aprovado_por: r.aprovado_por, externo: r.external_id, atualizado: r.atualizado_em }))), lista);
  }
  if (sub === "criar") {
    const cl = resolverCliente(str("cliente"), true)!;
    const conta_id = num("conta") ?? falha("Informe --conta <id>.");
    const caminho = str("spec") ?? falha("Informe --spec <arquivo.json>.");
    const spec = JSON.parse(fs.readFileSync(caminho, "utf8")) as EspecificacaoCampanha;
    const r = criarRascunho({ cliente_id: cl.id, conta_id, spec });
    return saida(() => mostrarRascunho(r), r);
  }
  const id = Number(resto[0]) || falha("Informe o id do rascunho.");
  if (sub === "ver") {
    const r = rascunhos.porId(id) ?? falha("Rascunho não encontrado.");
    return saida(() => mostrarRascunho(r, true), r);
  }
  if (sub === "validar") {
    const r = validarRascunho(id);
    return saida(() => mostrarRascunho(r), r);
  }
  if (sub === "aprovar") {
    const r = aprovarRascunho(id, str("por") ?? "");
    return saida(() => console.log(`Rascunho #${id} aprovado por ${r.aprovado_por}. Próximo passo: rascunhos publicar ${id}`), r);
  }
  if (sub === "publicar") {
    const r = await publicarRascunho(id);
    return saida(() => console.log(`Publicado. Campanha ${r.external_id} criada PAUSADA em ${NOMES_PLATAFORMA[r.plataforma]}. Rode \`sync\` e depois \`campanhas ativar <id> --motivo\` quando estiver pronta.`), r);
  }
  if (sub === "cancelar") {
    const r = cancelarRascunho(id);
    return saida(() => console.log(`Rascunho #${id} cancelado.`), r);
  }
  falha(`Subcomando inválido: rascunhos ${sub}`);
}

function mostrarRascunho(r: ReturnType<typeof rascunhos.porId> & object, completo = false) {
  const s = r.spec;
  console.log(`#${r.id} ${s.nome} — ${r.cliente_nome} · ${NOMES_PLATAFORMA[r.plataforma]} (${r.conta_nome}) · status ${r.status}`);
  console.log(`Objetivo ${s.objetivo} · orçamento/dia ${s.orcamento_diario ?? "—"} · total ${s.orcamento_total ?? "—"} · teto ${s.teto_gasto_diario} · ${s.inicio ?? "início imediato"} → ${s.fim ?? "sem fim"}`);
  console.log(`Público: ${s.publico?.descricao ?? "—"} [${(s.publico?.localizacoes ?? []).join(", ")}] ${s.publico?.idade_min ?? ""}-${s.publico?.idade_max ?? ""}`);
  console.log(`Anúncios: ${s.anuncios?.length ?? 0}${completo ? "\n" + s.anuncios.map((a, i) => `  ${i + 1}. [${a.formato}] ${a.nome} — ${Array.isArray(a.titulo) ? a.titulo[0] : a.titulo ?? ""} → ${a.url_destino ?? "sem destino"}`).join("\n") : ""}`);
  if (r.validacao) {
    console.log(`Validação: ${r.validacao.ok ? "OK" : "FALHOU"}`);
    for (const e of r.validacao.erros) console.log(`  ✗ ${e}`);
    for (const a of r.validacao.avisos) console.log(`  ! ${a}`);
  }
  if (r.aprovado_por) console.log(`Aprovado por ${r.aprovado_por} em ${r.aprovado_em}`);
  if (r.external_id) console.log(`Publicado: ${r.external_id} em ${r.publicado_em}`);
  if (r.erro) console.log(`Erro: ${r.erro}`);
}

function cmdRelatorios() {
  if (sub === "listar" || !sub) {
    const cl = resolverCliente(str("cliente"));
    const lista = relatorios.listar({ cliente_id: cl?.id });
    return saida(() => tabela(lista.map((r) => ({ id: r.id, cliente: r.cliente_nome ?? "Todos", tipo: r.tipo, periodo: `${r.periodo_inicio} → ${r.periodo_fim}`, titulo: r.titulo.slice(0, 50), criado: r.criado_em }))), lista.map(({ conteudo_md: _m, dados: _d, ...r }) => r));
  }
  if (sub === "gerar") {
    const cl = resolverCliente(str("cliente"));
    const inicio = str("inicio") ?? hojeMenos(7);
    const fim = str("fim") ?? hojeMenos(1);
    const analise = str("analise") ? fs.readFileSync(str("analise")!, "utf8") : undefined;
    const tipo = (str("tipo") ?? "desempenho") as Parameters<typeof gerarRelatorio>[0]["tipo"];
    const r = gerarRelatorio({ cliente_id: cl?.id ?? null, inicio, fim, tipo, titulo: str("titulo"), analise });
    log.registrar({ tipo: "relatorio.gerar", alvo: `relatorio:${r.id}`, depois: { titulo: r.titulo } });
    return saida(() => console.log(`Relatório #${r.id} gerado: ${r.titulo}\n${r.resumo}\nVeja em http://localhost:3100/relatorios/${r.id} ou \`relatorios ver ${r.id} --md\``), { id: r.id, titulo: r.titulo, resumo: r.resumo });
  }
  if (sub === "dados") {
    const cl = resolverCliente(str("cliente"));
    const d = coletarDados(cl?.id ?? null, str("inicio") ?? hojeMenos(7), str("fim") ?? hojeMenos(1));
    return console.log(JSON.stringify(d, null, 2));
  }
  const id = Number(resto[0]) || falha("Informe o id do relatório.");
  if (sub === "ver") {
    const r = relatorios.porId(id) ?? falha("Relatório não encontrado.");
    if (args.op.md) return console.log(r.conteudo_md);
    return saida(() => console.log(`#${r.id} ${r.titulo}\n${r.resumo}\n\n(use --md para o conteúdo completo)`), r);
  }
  if (sub === "remover") {
    relatorios.remover(id);
    return saida(() => console.log(`Relatório #${id} removido.`), { ok: true });
  }
  falha(`Subcomando inválido: relatorios ${sub}`);
}

async function cmdRotinas() {
  if (sub === "listar" || !sub) {
    const lista = rotinas.listar().map((r) => ({ ...r, agenda_legivel: descreverCron(r.agenda) }));
    return saida(() => tabela(lista.map((r) => ({ id: r.id, nome: r.nome, tipo: r.tipo, agenda: r.agenda_legivel, ativa: r.ativa ? "sim" : "não", cliente: r.cliente_nome ?? "todos", ultima: r.ultima_execucao ?? "nunca", proxima: r.proxima_execucao ?? "—", claude: r.prompt_claude ? "sim" : "" }))), lista);
  }
  if (sub === "padrao") {
    const existentes = new Set(rotinas.listar().map((r) => r.nome));
    const criadas = ROTINAS_PADRAO.filter((r) => !existentes.has(r.nome)).map((r) => rotinas.criar(r));
    return saida(() => console.log(`${criadas.length} rotinas padrão criadas.`), criadas);
  }
  if (sub === "devidas") {
    const devidas = rotinasDevidas();
    if (args.op.executar) {
      const execs = await executarDevidas();
      return saida(() => {
        console.log(`${execs.length} rotinas executadas.`);
        for (const e of execs) console.log(`  #${e.rotina_id} → ${e.status}${e.erro ? ` (${e.erro})` : ""}`);
        avisarPendentes();
      }, execs);
    }
    return saida(() => tabela(devidas.map((r) => ({ id: r.id, nome: r.nome, tipo: r.tipo, proxima: r.proxima_execucao ?? "nunca rodou" }))), devidas);
  }
  if (sub === "executar") {
    const ref = resto[0] ?? falha("Informe id ou tipo da rotina.");
    let rotina = rotinas.porId(Number(ref));
    if (!rotina && (TIPOS_ROTINA as readonly string[]).includes(ref)) {
      // Rotina ad hoc por tipo, sem persistir definição nova.
      const cl = resolverCliente(str("cliente"));
      rotina = rotinas.listar().find((r) => r.tipo === ref && (r.cliente_id ?? null) === (cl?.id ?? null)) ?? rotinas.criar({ nome: `${ref} (manual)`, descricao: "Criada por execução manual.", tipo: ref as TipoRotina, agenda: "0 8 * * *", ativa: false, cliente_id: cl?.id ?? null, config: {}, prompt_claude: null });
    }
    if (!rotina) falha("Rotina não encontrada.");
    const e = await executarRotina(rotina);
    return saida(() => {
      console.log(`Rotina "${rotina!.nome}" → ${e.status}`);
      console.log(JSON.stringify(e.resultado, null, 2));
      if (e.erro) console.log(`Erro: ${e.erro}`);
    }, e);
  }
  if (sub === "criar") {
    const tipo = str("tipo") ?? falha("Informe --tipo.");
    if (!(TIPOS_ROTINA as readonly string[]).includes(tipo)) falha(`Tipo inválido. Use: ${TIPOS_ROTINA.join(", ")}`);
    const cl = resolverCliente(str("cliente"));
    const r = rotinas.criar({ nome: str("nome") ?? `${tipo}`, descricao: str("descricao") ?? null, tipo: tipo as TipoRotina, agenda: str("agenda") ?? "0 8 * * 1-5", ativa: true, cliente_id: cl?.id ?? null, config: str("config") ? JSON.parse(str("config")!) : {}, prompt_claude: str("prompt") ?? null });
    return saida(() => console.log(`Rotina #${r.id} "${r.nome}" criada (${descreverCron(r.agenda)}).`), r);
  }
  if (sub === "pendentes") {
    const lista = execucoes.listar({ status: "pendente_claude" });
    return saida(() => {
      if (!lista.length) return console.log("Nenhuma execução aguardando o Claude.");
      for (const e of lista) console.log(`#${e.id} ${e.rotina_nome} (${e.iniciado_em})\n  Prompt: ${e.resultado.prompt_claude}\n  Resultado: ${JSON.stringify({ ...e.resultado, prompt_claude: undefined })}\n`);
    }, lista);
  }
  if (sub === "concluir") {
    const id = Number(resto[0]) || falha("Informe o id da execução.");
    const e = concluirExecucaoClaude(id, str("resumo") ?? falha("Informe --resumo."));
    return saida(() => console.log(`Execução #${id} concluída.`), e);
  }
  if (sub === "historico") {
    const lista = execucoes.listar({ rotina_id: num("rotina"), limite: num("n") ?? 30 });
    return saida(() => tabela(lista.map((e) => ({ id: e.id, rotina: e.rotina_nome, inicio: e.iniciado_em, status: e.status, erro: e.erro }))), lista);
  }
  const id = Number(resto[0]) || falha("Informe o id da rotina.");
  if (sub === "ativar" || sub === "desativar") {
    const r = rotinas.atualizar(id, { ativa: sub === "ativar" }) ?? falha("Rotina não encontrada.");
    return saida(() => console.log(`Rotina #${id} ${r.ativa ? "ativada" : "desativada"}.`), r);
  }
  if (sub === "remover") {
    rotinas.remover(id);
    return saida(() => console.log(`Rotina #${id} removida.`), { ok: true });
  }
  falha(`Subcomando inválido: rotinas ${sub}`);
}

function avisarPendentes() {
  const n = execucoes.listar({ status: "pendente_claude" }).length;
  if (n) console.log(`\n${n} execução(ões) aguardam o Claude: npm run gestor -- rotinas pendentes`);
}

function cmdAlertas() {
  if (sub === "listar" || !sub) {
    const cl = resolverCliente(str("cliente"));
    const lista = alertas.listar({ apenasAbertos: args.op.abertos === true, cliente_id: cl?.id });
    return saida(() => tabela(lista.map((a) => ({ id: a.id, sev: a.severidade, tipo: a.tipo, cliente: a.cliente_nome, campanha: a.campanha_nome?.slice(0, 30), mensagem: a.mensagem.slice(0, 90), criado: a.criado_em, resolvido: a.resolvido_em ?? "" }))), lista);
  }
  if (sub === "resolver") {
    const id = Number(resto[0]) || falha("Informe o id do alerta.");
    alertas.resolver(id);
    log.registrar({ tipo: "alerta.resolver", alvo: `alerta:${id}`, depois: { motivo: str("motivo") ?? null } });
    return saida(() => console.log(`Alerta #${id} resolvido.`), { ok: true });
  }
  if (sub === "checar") {
    const cl = resolverCliente(str("cliente"));
    const novos = [...checarPacing(cl?.id), ...checarFadiga(cl?.id), ...checarCpa(cl?.id, num("cpa-meta")), ...checarFrescor()];
    return saida(() => console.log(`${novos.length} alertas novos.\n${novos.map((a) => `  [${a.severidade}] ${a.mensagem}`).join("\n")}`), novos);
  }
  falha(`Subcomando inválido: alertas ${sub}`);
}

function cmdAgentes() {
  const agentes = listarAgentes();
  const skills = listarSkills();
  saida(() => {
    console.log("Skills (comandos do Claude Code):");
    for (const s of skills) console.log(`  ${s.comando.padEnd(22)} ${s.descricao.slice(0, 100)}`);
    console.log("\nAgentes especializados (subagentes):");
    for (const a of agentes) console.log(`  ${a.nome.padEnd(22)} ${a.descricao.slice(0, 100)}`);
  }, { skills, agentes: agentes.map(({ corpo: _c, ...a }) => a) });
}

function cmdLog() {
  const lista = log.listar(num("n") ?? 50);
  saida(() => tabela(lista.map((l) => ({ id: l.id, quando: l.criado_em, tipo: l.tipo, alvo: l.alvo, autor: l.autor, depois: JSON.stringify(l.depois ?? {}).slice(0, 80) }))), lista);
}

async function cmdDemo() {
  if (sub === "seed") {
    const t = await semearDemo();
    return saida(() => console.log(`Demo pronta: ${t.clientes} clientes, ${t.contas} contas, ${t.campanhas} campanhas, ${t.metricas} métricas diárias, rotinas padrão e 1 rascunho.\nAbra http://localhost:3100 (npm run dev).`), t);
  }
  falha("Use: demo seed");
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  falha(msg);
});
