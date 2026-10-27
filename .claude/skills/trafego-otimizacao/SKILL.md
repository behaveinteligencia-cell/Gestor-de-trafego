---
name: trafego-otimizacao
description: "Diagnosticar desempenho e executar ações reversíveis em campanhas existentes: pausar, reativar, mudar orçamento diário, sempre com motivo e aprovação. Gatilhos: 'o CPA subiu', 'o que fazer com a campanha X', 'pausa a campanha Y', 'aumenta o orçamento pra 200', 'realoca verba', 'tá gastando e não converte', 'escala a que tá boa', 'exclui essa campanha', '/trafego otimizar'."
---

# Otimização

Leia `../trafego/referencias/salvaguardas.md` (seção 4) e `../trafego/referencias/matematica.md` antes de concluir.

## Procedimento

1. **Dados frescos**: se a última sync (`status`) tem mais de 24h, `npm run gestor -- sync --cliente <slug>`.

2. **Levantar evidência**
   ```bash
   npm run gestor -- campanhas listar --cliente <slug> --json
   npm run gestor -- campanhas ver <id> --dias 14
   npm run gestor -- metricas --cliente <slug> --inicio <d-14> --fim <d-1> --por campanha --json
   npm run gestor -- metricas --cliente <slug> --inicio <d-14> --fim <d-1> --por dia --json
   npm run gestor -- alertas listar --abertos
   npm run gestor -- log --n 30          # o que mudou recentemente (reset de aprendizado?)
   ```
   Compare dois períodos de mesma duração. Ignore os últimos 1-3 dias para CPA (lag).

3. **Checklist antes de qualquer veredito** — escreva a resposta de cada item:
   lag de conversão · amostra (conversões no período) · fase de aprendizado (mudança nos últimos 7 dias no `log`) ·
   tracking (conversões zeraram com cliques normais?) · sazonalidade · papel no funil · pacing (gasto vs esperado).
   Se dois ou mais itens são "desconhecido", a conclusão é "insuficiente para agir; recomendo observar até <data>".

4. **Diagnóstico**: observação (número) → causa provável → confiança (alta/média/baixa). Separe o que se vê do que
   se interpreta. Para pedidos complexos (vários clientes, muitos alertas), acione `monitor-pacing`.

5. **Opções**, sempre três: não mudar (e reavaliar quando), teste pequeno (ex.: trocar criativo, +20% orçamento), ação
   direta. Para cada uma: efeito esperado, risco, como reverter, quando medir. Recomende uma.

6. **Portão de mutação**. Mostre o resumo (id, nome, antes → depois) e peça confirmação explícita com o id. Depois:
   ```bash
   npm run gestor -- campanhas pausar 42 --motivo "CPL R$ 95 vs meta R$ 60 em 14 dias (38 leads); tracking ok; sem mudança recente; cliente aprovou pausa em 27/10"
   npm run gestor -- campanhas ativar 42 --motivo "Criativo novo subiu; retomar com orçamento igual ao anterior (R$ 120)"
   npm run gestor -- campanhas orcamento 42 --valor 150 --motivo "+25%: CPL R$ 48 estável 14d (61 leads), pacing 0,98, teto do cliente R$ 200"
   ```
   O `--motivo` tem: métrica, período, amostra, por que agora, quem aprovou. Orçamento novo precisa caber no teto do
   cliente; se não souber o teto, pergunte.

7. **Verificar**: `campanhas ver <id>` mostra o estado novo; `log --n 5` mostra o registro. Diga quando reavaliar
   (orçamento: 5-7 dias; pausa: definir critério de retorno).

## Salvaguardas específicas

- Aumento de orçamento: prefira passos de até 20-30% a cada 3-5 dias; saltos grandes resetam aprendizado no Meta.
- Não pausar campanha de marca (Google) ou de remarketing sem olhar o efeito nas outras.
- Não mexer em conjunto/campanha em aprendizado por CPA alto nos primeiros 7 dias ou antes de ~50 conversões, salvo
  estouro de teto, destino quebrado ou política.
- Negativas no Google: só com relatório de termos de pesquisa. Sem ele, peça e não sugira termos.
- "Exclui/apaga/deleta a campanha" → não existe. Ofereça pausar e explique em uma frase.
- Contenção imediata (pausar sem o checklist completo) só para: gasto acima do teto, destino fora do ar, reprovação
  de política, tracking corrompido, entrega não autorizada. Ainda assim, confirme com o usuário.

## Peça ao usuário quando

- Não conhece a meta de CPA/CPL/ROAS ou o teto do cliente.
- As conversões da plataforma divergem do CRM e a decisão depende da qualidade do lead.
- O pedido é "pausa tudo que tá ruim": liste uma a uma, com evidência, e peça confirmação por id.
