# Gestor de Tráfego

App local para controlar campanhas de tráfego pago — **Meta Ads, Google Ads, TikTok Ads e LinkedIn Ads** — operado pelo **Claude Code**. Interface web em `http://localhost:3100`, CLI `npm run gestor`, banco SQLite em `data/gestor.db`. Tudo roda na sua máquina; credenciais ficam só em `.env.local`.

Inspirado no [claude-ads](https://github.com/AgriciDaniel/claude-ads) (MIT): portão de aprovação antes de qualquer mudança na conta, evidência antes de recomendação, "não sei" como resposta válida, nada de exclusão permanente.

## O que faz

| Área | Interface web | CLI / Claude Code |
| --- | --- | --- |
| **Controle de campanhas** | lista com filtros, detalhe com gráfico dia a dia, pausar/ativar com motivo | `campanhas listar/ver/pausar/ativar/orcamento` |
| **Subir campanhas** | formulário → rascunho validado → aprovação nomeada → publicação (nasce pausada) | `/trafego campanha` monta briefing, copy e spec; `rascunhos criar/validar/aprovar/publicar` |
| **Relatórios** | tabelas e comparação com período anterior, HTML/Markdown para enviar ao cliente | `relatorios gerar --analise` anexa a análise escrita pelo Claude |
| **Dashboard** | KPIs, investimento × conversões, por plataforma e por cliente, alertas, pendências | `status`, `metricas --por dia|plataforma|cliente` |
| **Agentes especializados** | catálogo lido de `.claude/agents` | auditores por plataforma, estrategista de mídia, copywriter, analista de relatórios, monitor de pacing, revisor de compliance |
| **Rotinas** | agenda cron, execução manual, histórico, pendências para o Claude | `rotinas devidas --executar`, `rotinas pendentes`, `rotinas concluir` |

## Começando

```bash
npm install
cp .env.example .env.local        # preencha os tokens (ou deixe vazio e use o modo demo)
npm run gestor -- demo seed       # 2 clientes fictícios, 30 dias de métricas, rotinas e 1 rascunho
npm run dev                       # http://localhost:3100
```

No Claude Code, dentro da pasta do projeto:

```
/trafego status
/trafego campanha      "sobe uma campanha de leads no Meta para a Clínica Sorriso, R$ 80/dia, teto R$ 120"
/trafego relatorio     "relatório semanal da Loja Verde com análise"
/trafego rotinas       "roda as rotinas devidas e conclui o que ficou pendente"
```

O `CLAUDE.md` explica ao Claude a estrutura, o fluxo e as regras; as skills em `.claude/skills/` são os procedimentos; os agentes em `.claude/agents/` são os especialistas que as skills acionam.

## Fluxo de publicação

```
briefing → spec JSON (data/specs/) → rascunhos criar → validar → aprovar --por "Nome" → publicar (PAUSADA) → sync → ativar --motivo
```

- Toda spec exige `teto_gasto_diario`; orçamento acima do teto é erro.
- Publicar sem aprovação nomeada é recusado pela CLI e pela API.
- Aumento de orçamento > 50% de uma vez é recusado (reinicia o aprendizado) a menos que `--forcar`.
- Toda mutação exige `--motivo` e fica em `log`.
- Não existe exclusão: campanhas são pausadas.

## Credenciais (`.env.local`)

| Plataforma | Variáveis |
| --- | --- |
| Meta | `META_ACCESS_TOKEN` (+ `META_API_VERSION`, padrão v24.0). Na conta: `page_id`, `pixel_id` |
| Google Ads | `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (opcional) |
| TikTok | `TIKTOK_ACCESS_TOKEN` |
| LinkedIn | `LINKEDIN_ACCESS_TOKEN` (+ `LINKEDIN_API_VERSION`). Na conta: `campaign_group_urn`, `geo_urns` |

`GESTOR_MODO=demo` (ou `--demo` ao adicionar a conta) usa dados sintéticos sem credencial. O app mostra só se cada variável está presente; o Claude é proibido de ler `.env*` (`.claude/settings.json`).

Os adaptadores reais (`lib/plataformas/`) implementam leitura de campanhas e métricas diárias, criação de campanha pausada, pausar/ativar e alterar orçamento. Partes que dependem de ativos (anúncios com mídia, grupos de anúncios do Google, criativos do TikTok/LinkedIn) são registradas como **pendências** no resultado da publicação para completar no gerenciador. Alguns detalhes de endpoint do LinkedIn e do Performance Max ainda precisam de teste com conta real — estão marcados em comentários no código.

## Rotinas

Rotinas são tarefas recorrentes com agenda cron. As determinísticas (sync, pacing, fadiga criativa, CPA, relatório-base) rodam pela CLI; quando a rotina tem `prompt_claude`, a execução fica `pendente_claude` e o Claude a conclui (`rotinas pendentes` → faz a análise → `rotinas concluir <id> --resumo`).

O app não roda em segundo plano sozinho. Agende no sistema:

```
*/30 * * * * cd /caminho/do/projeto && npm run gestor -- rotinas devidas --executar >> data/rotinas.log 2>&1
```

ou como tarefa agendada do Claude Code, para que ele conclua as pendências automaticamente.

## Estrutura

```
app/            Next.js 15 (App Router) — páginas e rotas de API
components/     componentes de interface
lib/
  types.ts      tipos de domínio (EspecificacaoCampanha etc.)
  db.ts         SQLite (better-sqlite3) e schema
  repos.ts      acesso a dados
  plataformas/  adaptadores meta, google, tiktok, linkedin, demo
  servicos/     sync, publicação (portão), relatórios, análises/alertas, rotinas, agentes, demo
cli/gestor.ts   CLI usada pelo Claude (todos os comandos aceitam --json)
.claude/        CLAUDE.md, skills, agentes, permissões
data/           banco, specs, análises, mídia (não versionados)
tests/          node:test (npm test)
```

## Scripts

```bash
npm run dev          # servidor de desenvolvimento (porta 3100)
npm run build        # build de produção
npm start            # servidor de produção
npm run gestor -- …  # CLI
npm run typecheck    # tsc --noEmit
npm test             # testes
```
