---
name: trafego
description: "Roteador do Gestor de Tráfego. Use para /trafego <subcomando>, pedidos ambíguos sobre tráfego pago, ou quando o usuário mistura várias etapas (ex.: 'cria a campanha e já ativa', 'revisa tudo do cliente X', 'o que preciso fazer hoje'). Decide qual skill trafego-* assume e impõe a ordem operacional e o portão de mutação."
---

# /trafego — roteador

Cada pedido tem um dono só. Identifique o subcomando, carregue a skill correspondente e siga o procedimento dela.
Não execute duas skills ao mesmo tempo; encadeie na ordem operacional.

## Tabela de roteamento

| Subcomando | Skill | Faz |
| --- | --- | --- |
| `/trafego setup` | `trafego-setup` | Cadastrar cliente e contas, checar credenciais, modo demo, primeiro sync |
| `/trafego sync` | `trafego-sync` | Sincronizar campanhas/métricas e ler dados (`sync`, `campanhas`, `metricas`) |
| `/trafego campanha` | `trafego-campanha` | Briefing → spec JSON → rascunho → validar → aprovar → publicar pausada |
| `/trafego otimizar` | `trafego-otimizacao` | Diagnóstico e ações reversíveis (pausar/ativar/orçamento) com `--motivo` |
| `/trafego relatorio` | `trafego-relatorio` | Métricas → análise em markdown → `relatorios gerar --analise` |
| `/trafego auditoria` | `trafego-auditoria` | Auditoria por plataforma via agentes `auditor-*`, consolidada em relatório |
| `/trafego rotinas` | `trafego-rotinas` | Listar/criar/executar rotinas, concluir execuções `pendente_claude`, agendar |
| `/trafego criativos` | `trafego-criativos` | Conceitos, ganchos e copy por plataforma com limites de caracteres |
| `/trafego status` | (aqui mesmo) | `npm run gestor -- status` + `alertas listar --abertos` + `rotinas devidas` |

Linguagem natural cai na mesma tabela (veja o `CLAUDE.md`). Em dúvida entre duas, pergunte em uma frase.

## Ordem operacional

1. **Contexto**: cliente (slug), plataforma, conta, período, objetivo e conversão aceita. Extraia do pedido antes de perguntar; pergunte só o que muda o resultado.
2. **Dados frescos**: se a última sync tem mais de 24h (`status`), rode `npm run gestor -- sync --cliente <slug>` antes de analisar.
3. **Leitura**: `campanhas listar --json`, `metricas --json`, `alertas listar --abertos`. Sempre `--json` quando for calcular algo.
4. **Diagnóstico** com evidência: cada afirmação cita o comando e o número. Lag de conversão, amostra e fase de aprendizado entram antes de qualquer veredito.
5. **Proposta**: o que mudar, por quê, efeito esperado, como reverter, quando reavaliar.
6. **Portão de mutação** (abaixo). Só então executar.
7. **Verificação**: reler o objeto (`campanhas ver <id>` / `rascunhos ver <id>`) e mostrar o estado novo. `log --n 10` confirma o registro.
8. **Fechamento**: próximas ações com dono e prazo.

## Portão de mutação

Mutação é: `rascunhos aprovar`, `rascunhos publicar`, `campanhas pausar`, `campanhas ativar`, `campanhas orcamento`.
Antes de rodar qualquer uma, todas estas condições precisam ser verdadeiras:

- O usuário viu um resumo humano do que vai acontecer (objeto, id, antes → depois, gasto envolvido).
- O usuário aprovou **nesta conversa**, de forma explícita, citando o id ou o nome exato. "Pode ir" vale só se houver um único objeto em discussão.
- Para publicar: a spec tem `teto_gasto_diario`, `rascunhos validar` retornou `ok` e o nome de quem aprova está definido (`--por "Nome"`).
- Para orçamento: o valor novo cabe no teto do cliente. Sem teto conhecido, pergunte antes.
- Há `--motivo` escrito em português claro, com a evidência que motivou.

Se qualquer item falhar, pare no rascunho/proposta e diga o que falta. Exclusão permanente não existe: ofereça pausar.

## Peça ao usuário quando

- O cliente ou a conta não existe (`clientes listar` vazio para o slug) — não crie por conta própria fora do `trafego-setup`.
- Não há orçamento, teto ou conversão definidos para a campanha pedida.
- A sync falhou por credencial: oriente a preencher `.env.local` e rode `status`; nunca leia o arquivo.
- Duas plataformas somam conversões com janelas diferentes: apresente lado a lado, não some.
- O pedido envolve categoria sensível (saúde, crédito, emprego, moradia): acione `revisor-compliance` antes de publicar.

## Referências

- `referencias/spec-campanha.md` — JSON completo de `EspecificacaoCampanha` com exemplos Meta e Google.
- `referencias/controles-auditoria.md` — controles por plataforma.
- `referencias/matematica.md` — CPA, CPL, ROAS, MER, break-even, pacing.
- `referencias/salvaguardas.md` — regras de segurança que toda skill repete.
