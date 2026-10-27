# Spec de campanha (`EspecificacaoCampanha`)

Fonte da verdade: `lib/types.ts`. A spec é independente de plataforma; o adaptador traduz. Salve em
`data/specs/<cliente>-<slug>.json` e crie o rascunho com
`npm run gestor -- rascunhos criar --cliente <slug> --conta <id> --spec data/specs/<arquivo>.json`.

## Campos

| Campo | Tipo | Obrigatório | Observação |
| --- | --- | --- | --- |
| `nome` | string | sim | Convenção: `[OBJETIVO] Oferta — Público — Plataforma`. |
| `objetivo` | enum | sim | `reconhecimento`, `trafego`, `engajamento`, `leads`, `vendas`, `mensagens`, `instalacao_app`, `visualizacao_video`. |
| `orcamento_diario` | number | um dos dois | Em moeda da conta (BRL por padrão). |
| `orcamento_total` | number | um dos dois | Para campanhas com fim definido. |
| `inicio`, `fim` | `AAAA-MM-DD` | não | `fim` não pode ser anterior a `inicio`. |
| `publico.descricao` | string | não | Texto livre para humanos lerem. |
| `publico.localizacoes` | string[] | recomendado | Códigos `BR`, `BR-SP`, ou nomes de cidade/raio que o adaptador aceite. Sem isso, aviso. |
| `publico.idade_min` / `idade_max` | number | não | Meta exige 18+ para saúde, crédito e similares. |
| `publico.generos` | enum[] | não | `todos`, `masculino`, `feminino`. |
| `publico.interesses` | string[] | não | Interesses/segmentos nomeados como aparecem na plataforma. |
| `publico.publicos_personalizados` | string[] | não | Ids/nomes de públicos salvos (listas, visitantes, lookalike). |
| `publico.exclusoes` | string[] | não | Ex.: compradores 30d, pacientes atuais, funcionários. |
| `posicionamentos` | `"automatico"` ou string[] | não | Padrão: automático. |
| `lance.estrategia` | string | não | Ex.: `menor_custo`, `custo_por_resultado_meta`, `maximizar_conversoes`, `cpa_alvo`, `cpc_manual`. |
| `lance.valor` | number | não | Só quando a estratégia exige alvo. |
| `conversao.evento` | string | recomendado p/ leads e vendas | Ex.: `Lead`, `Purchase`, `Contact`, nome da ação de conversão no Google. |
| `conversao.pixel_id` | string | não | Id do pixel/tag; nunca token. |
| `conversao.destino` | string | não | `site`, `formulario_nativo`, `whatsapp`, `ligacao`, `app`. |
| `anuncios[]` | array | sim, ≥ 1 | Veja abaixo. |
| `palavras_chave[]` | array | Google search | `{ texto, correspondencia: "ampla" \| "frase" \| "exata" }`. |
| `negativas` | string[] | não | Só com relatório de termos de pesquisa em mãos. |
| `observacoes` | string | não | Contexto para quem revisar. |
| `teto_gasto_diario` | number | **sim** | Teto aprovado pelo cliente. `orcamento_diario` acima disso é erro de validação. |

### `anuncios[]`

| Campo | Observação |
| --- | --- |
| `nome` | Identifica o anúncio no log. |
| `formato` | `imagem`, `video`, `carrossel`, `texto`, `responsivo`. Google search usa `responsivo` (RSA). |
| `titulo` | string ou string[]. Meta: até 40 caracteres cada. Google RSA: 3 a 15 títulos de até 30. LinkedIn: até 70. |
| `texto_principal` | string ou string[]. Meta: até 125 para não cortar. TikTok: até 100. LinkedIn introdução: até 150. |
| `descricao` | string ou string[]. Google RSA: 2 a 4 descrições de até 90. Meta: até 30 (opcional). |
| `cta` | Ex.: `SAIBA_MAIS`, `ENVIAR_MENSAGEM`, `AGENDAR`, `CADASTRE_SE`, `COMPRAR`. |
| `url_destino` | Obrigatória para tudo que não é `texto`; sem ela, aviso. |
| `utm` | String `utm_source=...&utm_medium=...`. Sem UTM o GA4 fica cego; a validação avisa. |
| `midia` | Caminhos ou URLs dos arquivos. Nunca inline base64. |

## Exemplo 1 — Meta, leads para clínica (WhatsApp)

```json
{
  "nome": "[LEADS] Avaliação Ortodôntica — Frio 25-55 — Meta",
  "objetivo": "leads",
  "orcamento_diario": 120,
  "inicio": "2026-11-03",
  "publico": {
    "descricao": "Adultos em raio de 10 km da clínica, interessados em estética dental",
    "localizacoes": ["BR-SP-Campinas"],
    "idade_min": 25,
    "idade_max": 55,
    "generos": ["todos"],
    "interesses": ["Odontologia", "Estética"],
    "exclusoes": ["pacientes_ativos_crm", "leads_90d"]
  },
  "posicionamentos": "automatico",
  "lance": { "estrategia": "menor_custo" },
  "conversao": { "evento": "Lead", "pixel_id": "123456789", "destino": "whatsapp" },
  "anuncios": [
    {
      "nome": "Vídeo depoimento equipe — gancho dor",
      "formato": "video",
      "titulo": "Avaliação ortodôntica sem compromisso",
      "texto_principal": "Alinhadores ou aparelho? A avaliação mostra o que faz sentido pro seu caso. Agende pelo WhatsApp.",
      "cta": "ENVIAR_MENSAGEM",
      "url_destino": "https://wa.me/5519999999999?text=Quero%20agendar%20avalia%C3%A7%C3%A3o",
      "utm": "utm_source=meta&utm_medium=paid_social&utm_campaign=leads_orto_frio",
      "midia": ["data/midia/clinica-x/orto-depoimento-9x16.mp4"]
    },
    {
      "nome": "Carrossel antes/depois ilustrativo — gancho resultado",
      "formato": "carrossel",
      "titulo": ["Sorriso alinhado em até 18 meses", "Parcelamento no cartão"],
      "texto_principal": "Resultado depende do caso. Veja como funciona a avaliação e tire suas dúvidas.",
      "cta": "SAIBA_MAIS",
      "url_destino": "https://clinicax.com.br/ortodontia",
      "utm": "utm_source=meta&utm_medium=paid_social&utm_campaign=leads_orto_frio",
      "midia": ["data/midia/clinica-x/orto-c1.jpg", "data/midia/clinica-x/orto-c2.jpg"]
    }
  ],
  "observacoes": "Categoria saúde: sem promessa de resultado, sem 'antes/depois' de paciente real sem autorização (CFO). Revisado por revisor-compliance em 2026-10-27.",
  "teto_gasto_diario": 150
}
```

## Exemplo 2 — Google Search, leads B2B

```json
{
  "nome": "[LEADS] Search — Genérico Contabilidade PJ — Google",
  "objetivo": "leads",
  "orcamento_diario": 180,
  "publico": { "localizacoes": ["BR-SP", "BR-RJ"] },
  "lance": { "estrategia": "maximizar_conversoes" },
  "conversao": { "evento": "Envio de formulário - Contato", "destino": "site" },
  "palavras_chave": [
    { "texto": "contabilidade para empresas", "correspondencia": "frase" },
    { "texto": "escritório de contabilidade pj", "correspondencia": "frase" },
    { "texto": "abrir empresa contador", "correspondencia": "ampla" }
  ],
  "negativas": ["gratis", "curso", "vagas", "estagio"],
  "anuncios": [
    {
      "nome": "RSA 01 — genérico PJ",
      "formato": "responsivo",
      "titulo": [
        "Contabilidade para Empresas",
        "Contador Online e Humano",
        "Abertura de Empresa Rápida",
        "Planos a Partir de R$ 299",
        "Atendimento por WhatsApp",
        "Troque de Contador Sem Dor"
      ],
      "descricao": [
        "Escritório especializado em PJ. Fale com um contador hoje e receba proposta em 24h.",
        "Folha, impostos e balanços em dia. Migração gratuita de contabilidade."
      ],
      "url_destino": "https://contabilx.com.br/empresas",
      "utm": "utm_source=google&utm_medium=cpc&utm_campaign=search_generico_pj"
    }
  ],
  "observacoes": "Negativas vindas do relatório de termos de pesquisa de 2026-10 (anexo no Drive). Preço 'a partir de R$ 299' confirmado pelo cliente por e-mail.",
  "teto_gasto_diario": 200
}
```

## Erros comuns na validação

- `teto_gasto_diario` ausente ou menor que `orcamento_diario` → erro, nada publica.
- Sem `orcamento_diario` e sem `orcamento_total` → erro.
- `anuncios` vazio → erro.
- Sem `url_destino`, sem `utm`, sem `localizacoes`, objetivo de conversão sem `conversao.evento` → avisos. Resolva antes de pedir aprovação.
