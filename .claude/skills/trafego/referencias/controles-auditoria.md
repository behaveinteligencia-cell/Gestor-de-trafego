# Controles de auditoria por plataforma

Cada controle recebe um de quatro estados: **ok**, **falha**, **desconhecido** (evidência ausente) ou **não se aplica**.
"Desconhecido" é resposta válida e deve aparecer como tal; não vira falha nem ok. Um controle só vira recomendação
quando há evidência da conta (saída de `campanhas ver`, `metricas --json`, export, print descrito pelo usuário).

Regras gerais: não aplicar benchmark sem checar objetivo, região, amostra e maturidade; funcionalidade indisponível,
beta ou paga não é falha, é oportunidade não pontuada; nenhuma recomendação de pausar/lance/orçamento é universal.

## Comum a todas as plataformas

| Área | Controle | O que olhar |
| --- | --- | --- |
| Medição | Evento de conversão definido e disparando | `conversoes` > 0 em campanhas de leads/vendas com cliques; se zero, suspeitar de tracking antes de criativo |
| Medição | UTM em todos os anúncios | Sem UTM, GA4 não fecha com a plataforma |
| Medição | Janela de atribuição conhecida | Nunca somar conversões de plataformas com janelas diferentes |
| Estrutura | Nomenclatura `[OBJETIVO] Oferta — Público — Plataforma` | Nomes sem padrão travam relatório |
| Estrutura | Fragmentação | Muitas campanhas com gasto baixo cada → aprendizado nunca estabiliza |
| Orçamento | Pacing | gasto real vs `orçamento × dias decorridos` (ver `matematica.md`) |
| Orçamento | Concentração | Uma campanha com > 70% do gasto sem ser a de melhor CPA → revisar |
| Criativo | Fadiga | CTR em queda e CPM/CPA em alta por 7+ dias com mesmo criativo; frequência alta |
| Criativo | Diversidade | Pelo menos 2 ângulos e 2 formatos ativos por conjunto |
| Público | Exclusões | Clientes/pacientes atuais e leads recentes excluídos da prospecção |
| Político | Categoria sensível | Saúde, crédito, emprego, moradia: ver `revisor-compliance` |

## Meta Ads

| Área | Controle |
| --- | --- |
| Medição | Pixel instalado e com eventos recentes; CAPI configurada quando há volume; deduplicação pixel+CAPI (`event_id`); qualidade de correspondência (EMQ); domínio verificado; eventos padrão em vez de personalizados onde possível |
| Estrutura | Orçamento no nível certo (campanha vs conjunto); objetivo coerente com a conversão; fase de aprendizado (não mexer em conjunto em aprendizado sem motivo forte); resets de aprendizado frequentes |
| Orçamento | Orçamento diário suficiente para sair do aprendizado (regra prática: ~50 conversões/semana por conjunto; se não dá, consolidar); utilização do orçamento |
| Criativo | Formatos (1:1, 4:5, 9:16); conceitos distintos; frescor (criativo com > 4 semanas sem troca); hook rate em vídeo; frequência prospecção vs remarketing |
| Públicos | Sobreposição entre conjuntos; frescor de públicos personalizados; fonte do lookalike; exclusões; uso de dados próprios (lista CRM) |
| Lances | Estratégia adequada ao objetivo (menor custo vs custo por resultado); posicionamentos automáticos vs manuais com justificativa |
| Políticas | Categoria especial declarada quando exige (crédito, emprego, moradia, social/política); saúde sem antes/depois sensacionalista, sem promessa de cura |

## Google Ads

| Área | Controle |
| --- | --- |
| Medição | Ações de conversão definidas, primária vs secundária separadas; conversões aprimoradas; sem contagem duplicada; GA4 vinculado; tag disparando; modelo de atribuição e janela conhecidos; valor de conversão atribuído |
| Termos de pesquisa | Relatório revisado nos últimos 30 dias; gasto em termos irrelevantes; negativas por lista (conta/campanha); correspondência ampla com smart bidding e volume suficiente; palavras sem conversão investigadas (não pausadas automaticamente) |
| Estrutura | Marca separada de não-marca; grupos de anúncio tematicamente coerentes; PMax e Search sem canibalização; segmentação geográfica (presença vs interesse); rede (Search sem parceiros/display misturados sem intenção); programação de anúncios |
| Palavras-chave | Índice de qualidade médio e dos termos que mais gastam; relevância anúncio-palavra; palavras com zero impressão (revisar, não excluir) |
| Anúncios | Pelo menos 1 RSA por grupo com 8+ títulos e 3+ descrições; força do anúncio; fixação de títulos só com motivo; frescor; extensões (sitelinks, frases de destaque, snippets, chamada, formulário de lead) |
| PMax | Grupos de recursos com vídeo e imagens completos; sinais de público; exclusões de marca quando houver Search de marca; temas de pesquisa |
| Página de destino | Velocidade mobile; relevância com a palavra e o anúncio |
| Políticas | Saúde: termos restritos (medicamentos, procedimentos), certificação quando exigida |

## TikTok Ads

| Área | Controle |
| --- | --- |
| Medição | Pixel instalado; Events API com `ttclid`; evento de otimização correto |
| Criativo | Vertical 9:16 nativo; gancho nos 3 primeiros segundos; aparência de conteúdo orgânico; Spark Ads com conta do criador quando possível; zona segura (texto fora das bordas da interface); áudio licenciado; taxa de conclusão e CTR em contexto |
| Estrutura | Campanha por objetivo; Smart+ avaliado quando elegível; posicionamentos (TikTok só vs Pangle) |
| Orçamento e lance | Orçamento mínimo da plataforma respeitado; estratégia de lance coerente; sinais de aprendizado (volume de eventos) |
| Políticas | Saúde e estética têm restrições específicas de antes/depois e de alegações; idade mínima 18 |

## LinkedIn Ads

| Área | Controle |
| --- | --- |
| Medição | Insight Tag instalado; Conversions API quando aplicável; atribuição e lead quality rastreados (lead → oportunidade no CRM) |
| Públicos | Cargo vs função+senioridade (cargo isolado é estreito e caro); tamanho de empresa; Matched Audiences (lista de empresas/contatos); expansão de público desligada salvo intenção; tamanho mínimo 50k para prospecção |
| Criativo | Diversidade de formato (imagem, carrossel, vídeo, documento); vídeo presente; troca a cada 4-6 semanas; Thought Leader Ads avaliados |
| Formulário | Lead Gen Form com poucos campos; integração com CRM; frequência monitorada |
| Orçamento e lance | Orçamento suficiente para CPM alto da plataforma; lance manual vs automático coerente; objetivo do grupo alinhado |
| Políticas | Mensagens patrocinadas restritas na UE; saúde/B2B regulado |
