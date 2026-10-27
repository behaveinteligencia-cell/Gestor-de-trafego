---
name: trafego-setup
description: "Configuração inicial do Gestor de Tráfego: cadastrar cliente, adicionar contas de anúncio (Meta, Google, TikTok, LinkedIn), checar se as credenciais estão presentes, ligar modo demo e rodar o primeiro sync. Gatilhos: 'cadastra o cliente', 'adiciona a conta do Meta da clínica X', 'conecta o Google Ads', 'tá tudo configurado?', 'como ligo o modo demo', 'primeiro sync', '/trafego setup'."
---

# Setup de cliente e contas

## Procedimento

1. **Estado atual**
   ```bash
   npm run gestor -- status --json
   npm run gestor -- clientes listar --json
   ```
   `status` diz, por plataforma, se cada variável de ambiente está presente (sim/não), se `GESTOR_MODO=demo` está
   ligado, quantas contas existem e a última sync. É a única forma permitida de "ver" credenciais.

2. **Cliente**. Se o slug não existe:
   ```bash
   npm run gestor -- clientes criar --nome "Clínica Sorriso" --segmento "clínica odontológica"
   ```
   O slug é gerado pela CLI; confirme com `clientes listar` e use esse slug daqui em diante.

3. **Contas**. Uma por plataforma, com o id da conta como aparece na plataforma (`act_123...` no Meta,
   customer id `123-456-7890` no Google, `advertiser_id` no TikTok, id numérico no LinkedIn):
   ```bash
   npm run gestor -- contas adicionar --cliente clinica-sorriso --plataforma meta --account-id act_123456 --nome "Clínica Sorriso — Meta" --moeda BRL
   ```
   Peça o id ao usuário; nunca invente. Se ele não sabe onde achar, explique (Gerenciador de Anúncios → Configurações
   da conta; Google Ads → canto superior direito).

4. **Credenciais ausentes**. Se `status` mostra `não` para a plataforma:
   - Diga quais variáveis faltam (pelo nome: `META_ACCESS_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`,
     `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID`, `TIKTOK_ACCESS_TOKEN`,
     `LINKEDIN_ACCESS_TOKEN`).
   - Oriente o usuário a colocar no `.env.local` ele mesmo. Você não lê, não escreve e não pede o valor no chat.
   - Depois, `npm run gestor -- status` de novo.

5. **Modo demo**. Para testar sem credencial: `GESTOR_MODO=demo` no `.env.local` **ou** conta criada com `--demo`.
   `npm run gestor -- demo seed` cria cliente, contas e 30 dias de métricas sintéticas. Deixe claro na resposta que são
   dados fictícios e nunca misture análise de demo com conta real.

6. **Primeiro sync**
   ```bash
   npm run gestor -- sync --cliente clinica-sorriso --dias 30
   npm run gestor -- campanhas listar --cliente clinica-sorriso
   ```
   Se falhar por credencial ou permissão, mostre a mensagem de erro (ela não contém segredo) e volte ao passo 4.

7. **Fechamento**: resumo do que foi criado (cliente, contas, plataformas ativas, sync ok/falhou) e próximo passo
   sugerido (`trafego-sync` para ler dados, `trafego-rotinas` para agendar sync diário).

## Peça ao usuário quando

- Falta o id da conta ou o nome do cliente.
- O cliente já existe com nome parecido (evite duplicar: mostre `clientes listar` e pergunte).
- O usuário quer "só testar": confirme se é modo demo global ou conta demo isolada.

## Nunca

- Ler `.env.local` nem pedir que o usuário cole token no chat.
- Criar conta com `account_id` inventado ou de outro cliente.
- Rodar `demo seed` em banco que já tem clientes reais sem avisar que vai adicionar dados fictícios.
