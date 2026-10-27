---
name: trafego-auditoria
description: "Auditoria de conta por plataforma (medição, estrutura, orçamento, criativos, públicos, lances, políticas) usando os agentes auditor-meta, auditor-google, auditor-tiktok e auditor-linkedin, consolidada num relatório tipo auditoria. Gatilhos: 'audita a conta', 'revisa o pixel', 'checa a estrutura do Google Ads', 'diagnóstico completo do cliente X', 'auditoria de onboarding', 'o que tá errado nessa conta', '/trafego auditoria'. Só leitura."
---

# Auditoria

Base: `../trafego/referencias/controles-auditoria.md` e `salvaguardas.md`. Auditoria não muda nada; ações viram
proposta para `trafego-otimizacao` ou `trafego-campanha`.

## Procedimento

1. **Escopo**: cliente, plataformas (todas as contas ativas por padrão), período (padrão 30 dias), objetivo e
   conversão aceita, meta de CPA/CPL/ROAS, teto. Pergunte o que falta em uma mensagem; sem meta, a auditoria sai
   "provisória" e diz isso.

2. **Dados**
   ```bash
   npm run gestor -- sync --cliente <slug> --dias 30
   npm run gestor -- contas listar --cliente <slug> --json
   npm run gestor -- campanhas listar --cliente <slug> --json
   npm run gestor -- metricas --cliente <slug> --inicio <d-30> --fim <d-1> --por campanha --json
   npm run gestor -- metricas --cliente <slug> --inicio <d-30> --fim <d-1> --por dia --json
   npm run gestor -- alertas listar --abertos
   npm run gestor -- log --n 100
   ```
   Peça ao usuário o que a CLI não traz e é decisivo: print do Gerenciador de Eventos/Pixel, relatório de termos de
   pesquisa, estrutura de conjuntos/grupos. Sem isso, os controles correspondentes saem "desconhecido".

3. **Fan-out por plataforma**: um agente por plataforma ativa, em paralelo, cada um com: slug, ids de conta, período,
   objetivo, metas, caminhos dos JSONs (salve-os em `data/analises/auditoria-<slug>-<data>/<plataforma>.json`) e o
   que o usuário informou manualmente.
   - Meta → `auditor-meta` · Google → `auditor-google` · TikTok → `auditor-tiktok` · LinkedIn → `auditor-linkedin`.
   - Se há categoria sensível (saúde, estética, crédito...), acione também `revisor-compliance` sobre os anúncios ativos.
   Cada agente devolve a tabela de controles (ok/falha/desconhecido/não se aplica), achados com evidência e
   recomendações com confiança. Agentes não executam mutação e não escrevem o relatório final.

4. **Consolidar** em `data/analises/auditoria-<slug>-<data>.md`:
   - **Resumo executivo**: 3 a 5 achados que mais importam, com número.
   - **Cobertura**: quantos controles avaliados vs desconhecidos por plataforma. Abaixo de 60% avaliados = "evidência
     insuficiente", e isso vai no resumo, não em rodapé.
   - **Por plataforma**: medição · estrutura · orçamento e pacing · criativos · públicos · lances · políticas. Para cada
     falha: o que se viu, por que importa, o que fazer, confiança.
   - **Contradições e lacunas**: onde as fontes divergem, o que faltou.
   - **Plano priorizado**: tabela ação · impacto (alto/médio/baixo) · esforço · dono · prazo · como medir. Primeiro
     medição, depois desperdício evidente, depois estrutura, depois criativo.
   - **Oportunidades não pontuadas**: recursos que a conta não usa; não são falhas.

5. **Registrar**
   ```bash
   npm run gestor -- relatorios gerar --cliente <slug> --inicio <d-30> --fim <d-1> --tipo auditoria --titulo "Auditoria <Cliente> — <mês/ano>" --analise data/analises/auditoria-<slug>-<data>.md
   ```
   Entregue o resumo executivo e o id. Ofereça encaminhar os itens aprovados para `trafego-otimizacao`.

## Regras

- Benchmark só como referência externa rotulada, nunca como critério de falha.
- Recurso beta, pago ou indisponível não é falha.
- Nenhuma regra universal de pausa, lance ou orçamento. Cada recomendação cita a evidência da conta.
- Negativas no Google só com relatório de termos de pesquisa; sem ele, descreva o método e não liste termos.
- Plataforma com sync falhando entra como "não auditada", e a auditoria é rotulada "parcial".

## Peça ao usuário quando

- Falta meta de CPA/CPL/ROAS ou margem (break-even).
- A conta é nova (menos de 30 dias de histórico): auditoria vira "checagem de configuração"; confirme.
- Não há acesso a pixel/eventos/termos de pesquisa: peça prints ou exports, ou aceite "desconhecido".
