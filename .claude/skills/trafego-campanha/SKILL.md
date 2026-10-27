---
name: trafego-campanha
description: "Criar e subir uma campanha nova: coletar briefing, gerar a spec JSON, criar rascunho, validar, pedir aprovação humana nomeada, publicar (nasce pausada) e orientar a ativação. Gatilhos: 'sobe uma campanha de leads pra clínica X', 'cria campanha de vendas no Google', 'monta a campanha', 'publica o rascunho 12', 'aprova e publica', 'campanha de WhatsApp', '/trafego campanha'. Pode acionar os agentes estrategista-midia, copywriter-anuncios e revisor-compliance."
---

# Criar e publicar campanha

Leia `../trafego/referencias/spec-campanha.md` antes de escrever a spec e `../trafego/referencias/salvaguardas.md`
antes de qualquer mutação.

## Procedimento

1. **Contexto da conta**
   ```bash
   npm run gestor -- clientes listar --json
   npm run gestor -- contas listar --cliente <slug> --json
   npm run gestor -- campanhas listar --cliente <slug> --plataforma <p> --json
   ```
   Confirme cliente, conta (id numérico interno) e se já existe campanha parecida ativa (evite canibalizar).

2. **Briefing**. Extraia do pedido; pergunte só o que falta, em uma mensagem, agrupado:
   - Objetivo (`leads`, `vendas`, `mensagens`, `trafego`, ...) e a conversão aceita (evento, destino: site/WhatsApp/formulário).
   - Oferta e promessa concreta (o que a pessoa ganha ao clicar). Preço, se houver, confirmado pelo cliente.
   - Público: região (cidade/raio), idade, interesses, exclusões (pacientes atuais, leads recentes).
   - Orçamento diário **e teto aprovado pelo cliente** (`teto_gasto_diario`). Sem teto, pare aqui.
   - Datas de início/fim. Destino (URL) e UTM. Criativos disponíveis (arquivos em `data/midia/<cliente>/`) ou a produzir.
   - Categoria sensível? (saúde, estética, crédito, emprego, moradia) → acione `revisor-compliance` depois da copy.

3. **Estrutura e copy**. Para campanha nova ou pedido vago, acione `estrategista-midia` com o briefing: ele devolve
   estrutura (campanhas/conjuntos), públicos, divisão de orçamento e hipóteses. Para os textos, acione
   `copywriter-anuncios` com oferta, público, plataforma e alegações aprovadas. Mostre o resultado ao usuário e ajuste.

4. **Spec JSON**. Escreva `data/specs/<cliente>-<slug-da-campanha>.json` seguindo `spec-campanha.md`. Nome no
   padrão `[OBJETIVO] Oferta — Público — Plataforma`. `teto_gasto_diario` ≥ `orcamento_diario`. UTM em todo anúncio.
   Em `observacoes`, registre de onde vieram as alegações e quem revisou compliance.

5. **Rascunho e validação**
   ```bash
   npm run gestor -- rascunhos criar --cliente <slug> --conta <id> --spec data/specs/<arquivo>.json
   npm run gestor -- rascunhos validar <id>
   npm run gestor -- rascunhos ver <id>
   ```
   Erros → corrija a spec e recrie/valide. Avisos → resolva ou justifique por escrito ao usuário antes de seguir.

6. **Resumo humano** (obrigatório antes de pedir aprovação): plataforma e conta; objetivo e conversão; orçamento
   diário, teto e gasto máximo mensal estimado (`diário × 30,4`); público em uma frase; nº de anúncios e ângulos;
   destino; datas; avisos pendentes; o que acontece ao publicar ("nasce pausada, nada gasta até ativar").

7. **Aprovação explícita**. Pergunte: "Quem aprova esta publicação? (nome)". Aceite só resposta que nomeie a pessoa
   e confirme o rascunho pelo id. Então:
   ```bash
   npm run gestor -- rascunhos aprovar <id> --por "Nome Sobrenome"
   ```

8. **Publicar**
   ```bash
   npm run gestor -- rascunhos publicar <id>
   npm run gestor -- rascunhos ver <id>        # status publicado, external_id preenchido
   ```
   A campanha é criada **pausada** na plataforma. Se `erro`, mostre a mensagem, não tente de novo às cegas; corrija
   e peça nova aprovação se a spec mudou.

9. **Ativação** é outro passo, com outra confirmação: `npm run gestor -- sync --cliente <slug>` para a campanha
   aparecer com id interno, depois `npm run gestor -- campanhas ativar <id> --motivo "Publicada em <data>, aprovada por <Nome>, teto R$ <x>/dia"`.
   Sugira a primeira revisão em 72h (`trafego-otimizacao`) e, se não existir, a rotina `pacing` para o cliente.

## Pare e pergunte quando

- Não há teto de gasto aprovado, ou o orçamento pedido ultrapassa o teto.
- A conversão não está definida para objetivo de leads/vendas (pixel/evento desconhecido).
- Não há criativo nem autorização para publicar só com texto.
- `revisor-compliance` devolveu bloqueio ou ajuste obrigatório.
- O usuário diz "aprova aí" sem nome: peça o nome. Você não aprova em nome de ninguém.

## Nunca

- Publicar sem `rascunhos validar` ok nem sem `aprovar --por`.
- Ativar no mesmo passo da publicação.
- Inventar URL, telefone, preço, depoimento ou pixel id.
