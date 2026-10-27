# Matemática de mídia

Calcule sempre a partir de `metricas --json`. Mostre a fórmula e os números usados. Se um denominador é zero ou
pequeno demais, diga "amostra insuficiente" em vez de dar um número.

## Fórmulas básicas

```
CTR  = cliques / impressões
CPC  = gasto / cliques
CPM  = gasto / impressões × 1000
CPA  = gasto / conversões            (custo por aquisição; para leads, chame de CPL)
CPL  = gasto / leads
ROAS = valor_conversao / gasto       (plataforma; não é lucro)
MER  = receita total do negócio / gasto total em mídia (todas as plataformas, mesmo período)
Taxa de conversão = conversões / cliques
```

## Break-even e margem

```
margem_contribuicao = preço - custo variável (produto, comissão, frete, taxa)
break_even_CPA  = margem_contribuicao por venda       (acima disso perde dinheiro em cada venda)
break_even_ROAS = 1 / (margem_contribuicao / preço)   (ex.: margem 40% → ROAS mínimo 2,5)
CPL_maximo      = break_even_CPA × taxa lead→venda    (ex.: CPA máx R$ 600 e 20% fecham → CPL máx R$ 120)
```

Para clínicas: margem por paciente é o valor do procedimento menos custo direto; LTV conta retornos.
Se o cliente não informou margem, o plano é provisório e você diz isso.

## Marginal vs médio

```
CPA_marginal  = gasto adicional / conversões adicionais (comparando dois períodos ou dois níveis de orçamento)
ROAS_marginal = valor adicional / gasto adicional
```

Realoque a partir do pior resultado **marginal**, não do pior CPA médio. Uma campanha com CPA médio alto pode ser a
única que gera volume incremental.

## Pacing

```
dias_decorridos  = hoje - inicio do período + 1
gasto_esperado   = orcamento_diario × dias_decorridos
pacing           = gasto_real / gasto_esperado
```

- 0,9 a 1,1: normal.
- < 0,8: subentrega. Causas típicas: lance baixo, público pequeno, criativo reprovado, aprendizado limitado, orçamento travado no nível errado.
- > 1,2: superentrega. Meta/Google podem gastar até 2× o diário num dia, mas fecham a média na semana. Alerta só se a média semanal estourar.
- Para orçamento mensal: `gasto_esperado = orcamento_mensal × dias_decorridos / dias_do_mes`.

## Amostra e significância (regra prática)

- Menos de 1.000 impressões: CTR não é confiável.
- Menos de 30 conversões no período: CPA tem variância alta; compare janelas maiores antes de agir.
- Menos de 50 conversões por semana por conjunto no Meta: provavelmente ainda em aprendizado.
- Diferença de CPA menor que 20% entre criativos com poucas conversões: empate.

## Lag de conversão

Não avalie os últimos 1-3 dias como se fossem finais: Meta e Google retroatribuem. Para leads com venda offline, o
lag é o ciclo de venda (dias a semanas). Compare períodos maduros entre si.

## Comparação entre períodos

Mesma duração, mesmo dia da semana de início, mesma janela de atribuição, mesma moeda, mesmo fuso. Variação percentual
com denominador pequeno (ex.: 2 → 4 conversões = +100%) não é tendência.

## Nunca

- Somar conversões Meta (7 dias clique) com Google (30 dias clique): mostre lado a lado.
- Inferir lucro de ROAS da plataforma.
- Projetar resultado anual a partir de uma semana.
