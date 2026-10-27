---
name: trafego-sync
description: "Sincronizar campanhas e métricas das plataformas para o banco local e ler os dados. Gatilhos: 'puxa os dados', 'atualiza as campanhas', 'sincroniza o Meta da clínica X', 'como estão as métricas', 'quanto gastou essa semana', 'lista as campanhas ativas', 'quais campanhas estão pausadas', '/trafego sync'. Só leitura; não altera nada nas plataformas."
---

# Sync e leitura de dados

## Procedimento

1. **Checar frescor**: `npm run gestor -- status --json` mostra a última sync por conta. Se tem mais de 24h, ou se o
   usuário pediu dados "de hoje", sincronize.

2. **Sincronizar**
   ```bash
   npm run gestor -- sync                                  # tudo
   npm run gestor -- sync --cliente clinica-sorriso        # um cliente
   npm run gestor -- sync --cliente clinica-sorriso --plataforma meta --dias 7
   ```
   `--dias` define quantos dias de métricas puxar (padrão 30). Sync é idempotente: rodar duas vezes não duplica.
   Se uma plataforma falhar, as outras seguem; relate a falha pelo nome da plataforma e o erro, sem segredo.

3. **Listar campanhas**
   ```bash
   npm run gestor -- campanhas listar --cliente clinica-sorriso --json
   npm run gestor -- campanhas listar --plataforma google --status ativa
   npm run gestor -- campanhas ver 42 --dias 7
   ```
   `campanhas ver` traz a campanha, orçamento e métricas agregadas do período (ctr, cpc, cpm, cpa, roas).

4. **Métricas agregadas**
   ```bash
   npm run gestor -- metricas --cliente clinica-sorriso --inicio 2026-10-20 --fim 2026-10-26 --por campanha --json
   npm run gestor -- metricas --cliente clinica-sorriso --inicio 2026-10-01 --fim 2026-10-26 --por dia --json
   npm run gestor -- metricas --inicio 2026-10-01 --fim 2026-10-26 --por plataforma --json
   ```
   Use `--json` sempre que for calcular ou comparar. Para texto ao usuário, traduza em tabela curta.

5. **Apresentar**: tabela com gasto, impressões, cliques, CTR, conversões, CPA/CPL, ROAS (quando há valor).
   Formate moeda em BRL (`R$ 1.234,56`). Marque "—" quando o denominador é zero. Indique período e data da sync.

6. **Alertas abertos** complementam a leitura: `npm run gestor -- alertas listar --abertos`.

## Regras de leitura

- Período: se o usuário não disse, use últimos 7 dias completos (ontem para trás) e diga isso.
- Não some conversões de plataformas diferentes como se fossem a mesma coisa; mostre por plataforma e, se somar,
  escreva "soma simples, janelas de atribuição diferentes".
- Últimos 1-3 dias são provisórios (lag de atribuição). Avise quando comparar.
- Variação percentual com base pequena (menos de 30 conversões) não é tendência; diga "amostra pequena".
- Dados de conta demo são fictícios: avise sempre que aparecerem.

## Peça ao usuário quando

- O slug do cliente é ambíguo (`clientes listar` mostra dois parecidos).
- O sync falha por credencial: aponte para `trafego-setup`, não tente contornar.
- Ele quer "o número certo" de leads e a plataforma e o CRM divergem: você mostra o da plataforma e pergunta o do CRM.

## Nunca

- Alterar status ou orçamento aqui. Se o pedido vira ação ("pausa essa"), passe para `trafego-otimizacao`.
- Inventar métrica que a CLI não devolveu (frequência, hook rate, qualidade de lead só existem se vierem em `raw`).
