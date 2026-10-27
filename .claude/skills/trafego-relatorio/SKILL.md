---
name: trafego-relatorio
description: "Gerar relatório de desempenho (semanal, mensal, por período) para um cliente: puxar métricas, escrever análise em markdown e registrar com relatorios gerar. Gatilhos: 'relatório semanal do cliente X', 'relatório mensal de outubro', 'resumo pra mandar pro cliente', 'como foi a semana da clínica', 'fecha o mês', 'mostra o relatório 7', '/trafego relatorio'. Pode acionar o agente analista-relatorios."
---

# Relatório

Leia `../trafego/referencias/matematica.md` para fórmulas e regras de comparação.

## Procedimento

1. **Definir período e tipo**. Semanal: segunda a domingo anterior. Mensal: mês fechado. Se o usuário não disse,
   proponha e confirme em uma linha. Tipo em `--tipo`: `semanal`, `mensal`, `desempenho` (período livre), `auditoria`
   (só via `trafego-auditoria`).

2. **Sync** se a última tem mais de 24h: `npm run gestor -- sync --cliente <slug>`.

3. **Dados**
   ```bash
   npm run gestor -- metricas --cliente <slug> --inicio <ini> --fim <fim> --por plataforma --json
   npm run gestor -- metricas --cliente <slug> --inicio <ini> --fim <fim> --por campanha --json
   npm run gestor -- metricas --cliente <slug> --inicio <ini> --fim <fim> --por dia --json
   npm run gestor -- metricas --cliente <slug> --inicio <ini-anterior> --fim <fim-anterior> --por plataforma --json   # período anterior, mesma duração
   npm run gestor -- campanhas listar --cliente <slug> --json
   npm run gestor -- alertas listar --abertos
   npm run gestor -- log --n 50          # mudanças feitas no período
   npm run gestor -- relatorios listar   # evitar duplicar
   ```

4. **Análise**. Escreva você ou acione `analista-relatorios` passando os JSONs e o contexto do cliente (metas de
   CPL/CPA/ROAS, teto, o que foi feito no período). Salve em `data/analises/<slug>-<ini>-<fim>.md` com esta estrutura:
   - **Resumo executivo** (3 a 5 linhas, para quem só lê isso): gasto, resultado principal, custo por resultado,
     variação vs período anterior, uma frase de leitura.
   - **Números do período**: tabela por plataforma e por campanha (gasto, impressões, cliques, CTR, conversões,
     CPA/CPL, ROAS quando houver). Moeda em BRL. "—" onde o denominador é zero.
   - **Destaques**: o que funcionou, com número e causa provável.
   - **Problemas e riscos**: o que piorou, pacing fora da faixa, fadiga, alertas abertos, tracking suspeito.
     Marque confiança (alta/média/baixa) e o que ainda é desconhecido.
   - **O que fizemos**: ações do `log` no período, em linguagem de cliente.
   - **Próximas ações**: tabela com ação · dono · prazo · métrica de sucesso. Dono é pessoa ou "Behave".
   - **Notas de método**: período comparado, janela de atribuição por plataforma, dias provisórios, dados demo se houver.

5. **Registrar**
   ```bash
   npm run gestor -- relatorios gerar --cliente <slug> --inicio <ini> --fim <fim> --tipo semanal --titulo "Semana 20-26/10 — Clínica Sorriso" --analise data/analises/<slug>-<ini>-<fim>.md
   npm run gestor -- relatorios ver <id> --md
   ```
   O relatório fica disponível em http://localhost:3100. Entregue ao usuário o resumo executivo e o id.

6. **Execução pendente de rotina**: se o relatório veio de `rotinas` (status `pendente_claude`), siga o
   `prompt_claude` da execução e finalize conforme `trafego-rotinas`.

## Regras de escrita

- Linguagem para o cliente final: sem "CBO", "learning phase", "RSA" sem explicar. Sem promessa.
- Cada afirmação tem número ao lado. Benchmark externo só rotulado como referência, nunca como meta do cliente.
- Não somar conversões de plataformas com janelas diferentes; apresente lado a lado.
- Variação com base pequena: escreva "amostra pequena" em vez de porcentagem.
- Nunca incluir token, id de pixel, telefone de lead ou lista de clientes.

## Peça ao usuário quando

- Não há meta de CPL/CPA/ROAS registrada para o cliente: pergunte antes de rotular algo como "bom" ou "ruim".
- O período inclui dias sem sync (buraco nos dados de `--por dia`).
- Já existe relatório para o mesmo período (`relatorios listar`): substituir ou criar outro?
