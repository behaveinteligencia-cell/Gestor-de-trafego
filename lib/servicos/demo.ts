import { clientes, contas, rotinas } from "../repos";
import type { EspecificacaoCampanha } from "../types";
import { criarRascunho } from "./publicacao";
import { ROTINAS_PADRAO } from "./rotinas";
import { sincronizarConta } from "./sync";

/**
 * Popula o banco com dois clientes fictícios, contas em modo demo (dados
 * sintéticos, sem credencial), métricas de 30 dias, um rascunho e as rotinas
 * padrão. Serve para conhecer a interface antes de conectar contas reais.
 */
export async function semearDemo(): Promise<{ clientes: number; contas: number; campanhas: number; metricas: number }> {
  const totais = { clientes: 0, contas: 0, campanhas: 0, metricas: 0 };
  const defs = [
    {
      nome: "Clínica Sorriso Pleno",
      segmento: "odontologia",
      contas: [
        { plataforma: "meta" as const, account_id: "act_demo_1001", nome: "Sorriso Pleno — Meta" },
        { plataforma: "google" as const, account_id: "demo-1001", nome: "Sorriso Pleno — Google" },
      ],
    },
    {
      nome: "Loja Verde Natural",
      segmento: "e-commerce",
      contas: [
        { plataforma: "meta" as const, account_id: "act_demo_2001", nome: "Verde Natural — Meta" },
        { plataforma: "tiktok" as const, account_id: "demo-2001", nome: "Verde Natural — TikTok" },
        { plataforma: "linkedin" as const, account_id: "demo-2002", nome: "Verde Natural — LinkedIn B2B" },
      ],
    },
  ];
  for (const d of defs) {
    let cliente = clientes.porSlug(d.nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    if (!cliente) {
      cliente = clientes.criar({ nome: d.nome, segmento: d.segmento, observacoes: "Cliente de demonstração (dados sintéticos)." });
      totais.clientes++;
    }
    for (const c of d.contas) {
      let conta = contas.listar({ plataforma: c.plataforma }).find((k) => k.account_id === c.account_id);
      if (!conta) {
        conta = contas.criar({ ...c, cliente_id: cliente.id, config: { demo: true, teto_gasto_diario: 500 } });
        totais.contas++;
      }
      const r = await sincronizarConta(conta, 30);
      totais.campanhas += r.campanhas;
      totais.metricas += r.metricas;
    }
  }
  if (rotinas.listar().length === 0) for (const r of ROTINAS_PADRAO) rotinas.criar(r);

  const clinica = clientes.porSlug("clinica-sorriso-pleno");
  const contaMeta = clinica ? contas.listar({ cliente_id: clinica.id, plataforma: "meta" })[0] : null;
  if (clinica && contaMeta) {
    const spec: EspecificacaoCampanha = {
      nome: "[LEADS] Implantes — Avaliação Gratuita",
      objetivo: "leads",
      orcamento_diario: 90,
      teto_gasto_diario: 150,
      inicio: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
      publico: {
        descricao: "Adultos 35-65 num raio de 15 km da clínica, interesse em saúde bucal e estética.",
        localizacoes: ["BR"],
        idade_min: 35,
        idade_max: 65,
        interesses: ["Odontologia", "Implante dentário", "Estética"],
      },
      posicionamentos: "automatico",
      lance: { estrategia: "menor_custo" },
      conversao: { evento: "Lead", destino: "whatsapp" },
      anuncios: [
        {
          nome: "Avaliação gratuita — depoimento",
          formato: "video",
          titulo: "Avaliação de implante sem custo",
          texto_principal: "Volte a sorrir sem medo. Agende sua avaliação gratuita com nossa equipe de implantodontia.",
          cta: "Enviar mensagem",
          url_destino: "https://wa.me/5500000000000",
          utm: "utm_source=meta&utm_medium=paid&utm_campaign=implantes-avaliacao",
          midia: ["data/midias/demo-depoimento.mp4"],
        },
      ],
      observacoes: "Rascunho de demonstração. Revisar claims de saúde (CFO) antes de aprovar.",
    };
    criarRascunho({ cliente_id: clinica.id, conta_id: contaMeta.id, spec });
  }
  return totais;
}
