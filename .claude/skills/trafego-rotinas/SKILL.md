---
name: trafego-rotinas
description: "Listar, criar, executar e agendar rotinas (sync, pacing, fadiga criativa, relatório semanal/mensal, auditoria, alerta de CPA, personalizada) e concluir execuções que ficaram 'pendente_claude'. Gatilhos: 'roda a rotina de pacing', 'agenda sync diário', 'tem execução pendente?', 'o que tá devido hoje', 'cria rotina de relatório semanal pra clínica X', 'desativa a rotina 3', 'resolve os alertas', '/trafego rotinas'."
---

# Rotinas

Rotinas determinísticas rodam na CLI e geram **alertas**. Quando a rotina tem `prompt_claude`, a CLI deixa uma
execução `pendente_claude` que você conclui (ex.: escrever a análise do relatório semanal).

## Procedimento

1. **Ver o estado**
   ```bash
   npm run gestor -- rotinas listar --json
   npm run gestor -- rotinas devidas --json          # o que já passou da hora
   npm run gestor -- alertas listar --abertos --json
   ```

2. **Executar o que está devido**
   ```bash
   npm run gestor -- rotinas devidas --executar     # roda todas as devidas
   npm run gestor -- rotinas executar pacing        # por tipo (todas desse tipo)
   npm run gestor -- rotinas executar 7             # por id
   ```
   Depois, leia os alertas novos (`alertas listar --abertos`) e explique cada um em uma linha: o que disparou, número,
   se exige ação humana. Para muitos alertas, acione `monitor-pacing` para priorizar.

3. **Concluir execuções `pendente_claude`**. A saída de `rotinas executar`/`devidas` lista execuções pendentes com o
   `prompt_claude` e o `resultado` parcial (ex.: ids de métricas, período). Para cada uma:
   - Siga o prompt usando a skill correspondente (`relatorio_semanal`/`relatorio_mensal` → `trafego-relatorio`;
     `auditoria` → `trafego-auditoria`; `pacing`/`alerta_cpa`/`fadiga_criativa` → `trafego-otimizacao` só até a
     proposta; `personalizada` → o que o prompt pedir, dentro das salvaguardas).
   - Registre o resultado onde a skill manda (`relatorios gerar ...`) e informe o id ao usuário.
   - Uma rotina **nunca** autoriza mutação. Se o prompt pedir "pause se CPA > X", você produz a recomendação e
     espera aprovação humana no chat.

4. **Criar rotina**
   ```bash
   npm run gestor -- rotinas criar --nome "Sync diário" --tipo sync --agenda "0 7 * * *"
   npm run gestor -- rotinas criar --nome "Pacing Clínica Sorriso" --tipo pacing --agenda "0 8 * * 1-5" --cliente clinica-sorriso
   npm run gestor -- rotinas criar --nome "Relatório semanal Clínica Sorriso" --tipo relatorio_semanal --agenda "0 9 * * 1" --cliente clinica-sorriso --prompt "Escreva a análise da semana anterior seguindo trafego-relatorio; destaque CPL vs meta R$ 60."
   npm run gestor -- rotinas criar --nome "Alerta CPA Google" --tipo alerta_cpa --agenda "0 */6 * * *" --cliente clinica-sorriso
   npm run gestor -- rotinas ativar 3 | rotinas desativar 3
   ```
   Agenda é cron de 5 campos no fuso da conta (`America/Sao_Paulo` por padrão). Tipos: `sync`, `pacing`,
   `fadiga_criativa`, `relatorio_semanal`, `relatorio_mensal`, `auditoria`, `alerta_cpa`, `personalizada`.
   Padrão recomendado por cliente novo: sync diário 07h · pacing dias úteis 08h · relatório semanal segunda 09h ·
   relatório mensal dia 1 09h · fadiga criativa segunda 10h.

5. **Resolver alertas** só depois de tratar ou descartar com motivo dito ao usuário:
   `npm run gestor -- alertas resolver <id>`.

## Agendamento automático (a rotina só roda se algo chamar a CLI)

Ofereça uma das opções e deixe o usuário escolher:
- **Tarefa agendada do Claude Code** (quando disponível): uma tarefa diária às 07h30 com o prompt
  "Rode `npm run gestor -- rotinas devidas --executar` na pasta do Gestor de Tráfego e conclua as execuções pendentes
  seguindo a skill trafego-rotinas. Não execute mutações." Vantagem: conclui as `pendente_claude` sozinha.
- **Cron do sistema** (macOS/Linux): `30 7 * * * cd /caminho/do/repo && npm run gestor -- rotinas devidas --executar >> data/rotinas.log 2>&1`.
  As execuções `pendente_claude` ficam esperando o próximo pedido no chat ("tem execução pendente?").
- **Agendador de Tarefas do Windows**: mesma linha, em `cmd /c`.

## Peça ao usuário quando

- Vai criar rotina com `--prompt` que implica decisão de gasto: deixe explícito no prompt que a saída é recomendação.
- Há alertas `critico` abertos há mais de 24h: pergunte se já foram tratados fora do app antes de resolver.
- Um `pendente_claude` pede algo fora das skills (ex.: enviar e-mail ao cliente): entregue o texto, não envie.
