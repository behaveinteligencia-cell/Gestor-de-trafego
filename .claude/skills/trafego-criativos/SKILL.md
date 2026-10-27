---
name: trafego-criativos
description: "Conceitos, ganchos e copy de anúncio por plataforma, dentro dos limites de caracteres e sem inventar provas. Gatilhos: 'me dá ganchos pra campanha X', 'escreve a copy do anúncio', 'ideias de criativo pra clínica', 'variações de título pro Google', 'roteiro de vídeo pro TikTok', 'texto pro LinkedIn', 'o criativo cansou, preciso de outro ângulo', '/trafego criativos'. Pode acionar copywriter-anuncios, estrategista-midia e revisor-compliance."
---

# Criativos e copy

## Procedimento

1. **Insumos** (extraia do pedido ou do briefing existente em `data/specs/`; pergunte só o que falta):
   oferta e promessa concreta · público e momento (frio, morno, remarketing) · objetivo e CTA · plataforma e formato ·
   alegações **aprovadas** pelo cliente (preço, prazo, diferenciais, números) · tom de voz · o que não pode dizer.
   Se há métricas de criativos atuais (`campanhas ver <id>`), use para saber qual ângulo cansou.

2. **Ângulos** — proponha 3 a 5 conceitos materialmente diferentes, não reescritas. Para cada um: insight (o que a
   pessoa sente/pensa), promessa, prova disponível (ou "sem prova: não usar"), gancho, estrutura, CTA, objeção que
   responde, hipótese a testar. Ângulos típicos: dor/alívio · resultado/transformação (sem promessa clínica) ·
   processo/bastidor · prova social (só real e autorizada) · objeção/preço · urgência legítima (vaga, data real) ·
   educação/mito vs fato · identificação ("se você…").

3. **Copy por plataforma** — acione `copywriter-anuncios` ou escreva, respeitando os limites e contando caracteres:

   | Plataforma | Campo | Limite seguro | Observações |
   | --- | --- | --- | --- |
   | Meta (FB/IG) | Título | 40 | Texto principal 125 antes do "ver mais"; descrição 30; 3 a 5 variações cada |
   | Google Search (RSA) | Título | 30 | 8 a 15 títulos distintos (nem todos com a palavra-chave); 3 a 4 descrições de 90; fixar só com motivo |
   | Google PMax | Títulos 30 / longos 90 / descrições 90 | | Mínimo 5 títulos, 1 longo, 4 descrições, imagens 1:1, 1,91:1, 4:5 |
   | TikTok | Texto do anúncio | 100 | Gancho falado nos 3 primeiros segundos; legendas; roteiro 15-30s; som licenciado |
   | LinkedIn | Título 70 / introdução 150 | | Introdução até 150 para não cortar; tom profissional, sem clickbait; formulário de lead curto |

   Entregue em blocos por anúncio com nome (`"Vídeo depoimento equipe — gancho dor"`), título(s), texto(s),
   descrição, CTA, sugestão de mídia e contagem de caracteres ao lado de cada linha.

4. **Compliance**. Para saúde, estética, crédito, emprego, moradia, suplementos, jurídico: acione
   `revisor-compliance` com a copy. Aplique os ajustes e registre "revisado em <data>" no resultado.

5. **Roteiro de vídeo** (Reels/TikTok/Shorts), quando pedido: 0-3s gancho · 3-10s problema/contexto · 10-20s solução
   e prova disponível · 20-30s CTA. Indique texto na tela, fala e cena; zona segura (texto fora das bordas).

6. **Entrega**: salve em `data/analises/criativos-<cliente>-<slug>.md` quando forem muitas peças, ou responda
   direto. Se vai virar campanha, aponte para `trafego-campanha` e já formate no padrão de `anuncios[]` da spec.

## Nunca

- Inventar depoimento, número de pacientes, "95% de aprovação", prêmio, certificação, "o melhor da cidade".
- Prometer resultado clínico, cura, emagrecimento em X dias, "sem dor", "garantido".
- Usar antes/depois de paciente real sem autorização por escrito; em odontologia e medicina, o conselho restringe.
- Preço, desconto ou prazo que o cliente não confirmou. Marque `[CONFIRMAR COM CLIENTE]` e não publique com a marca.
- Escassez falsa ("últimas 3 vagas") sem fato por trás.
- Copiar anúncio de concorrente; inspiração em estrutura é ok, texto não.

## Peça ao usuário quando

- Não há nenhuma alegação aprovada: você entrega ângulos e esqueletos com `[CONFIRMAR]`, não copy final.
- O tom de voz do cliente é desconhecido: peça 2-3 posts ou textos dele como referência.
- Há prova social: pergunte se há autorização de uso de imagem/nome.
