import Link from "next/link";
import { notFound } from "next/navigation";
import { AcaoBotao } from "@/components/AcaoBotao";
import { GraficoGastoConversoes } from "@/components/Graficos";
import { Cabecalho, Comando, EtiquetaStatus } from "@/components/ui";
import { relatorios } from "@/lib/repos";
import { markdownParaHtml } from "@/lib/md";
import type { DadosRelatorio } from "@/lib/servicos/relatorios";
import { dataCurta, dataHora } from "@/lib/formato";

export const dynamic = "force-dynamic";

export default async function PaginaRelatorio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = relatorios.porId(Number(id));
  if (!r) notFound();
  const d = r.dados as unknown as DadosRelatorio;
  const temAnalise = r.conteudo_md.includes("\n## Análise");
  return (
    <>
      <Link href="/relatorios" className="text-xs text-suave hover:underline">
        ← Relatórios
      </Link>
      <Cabecalho
        titulo={r.titulo}
        descricao={`${r.cliente_nome ?? "Todos os clientes"} · ${dataCurta(r.periodo_inicio)} → ${dataCurta(r.periodo_fim)} · gerado ${dataHora(r.criado_em)}`}
        acoes={
          <>
            <EtiquetaStatus s={r.tipo} />
            <a className="botao" href={`/api/relatorios/${r.id}/markdown`} download={`relatorio-${r.id}.md`}>
              Baixar .md
            </a>
            <a className="botao" href={`/api/relatorios/${r.id}/html`} target="_blank" rel="noopener">
              Abrir HTML
            </a>
            <AcaoBotao url={`/api/relatorios/${r.id}/remover`} confirmar="Remover este relatório?" variante="perigo" irPara="/relatorios">
              Remover
            </AcaoBotao>
          </>
        }
      />
      {!temAnalise && (
        <div className="cartao p-4 mb-4 border-l-4 border-l-primaria text-sm">
          <strong>Sem análise ainda.</strong> Peça ao Claude Code: “escreve a análise do relatório #{r.id}”. Ele usa a skill <code>trafego-relatorio</code> e regenera com <code>--analise</code>.
          <Comando>{`npm run gestor -- relatorios ver ${r.id} --md`}</Comando>
        </div>
      )}
      <div className="grid lg:grid-cols-3 gap-4">
        <article className="cartao p-6 lg:col-span-2 prosa" dangerouslySetInnerHTML={{ __html: markdownParaHtml(r.conteudo_md) }} />
        <div className="space-y-4 self-start">
          {d?.por_dia && (
            <div className="cartao p-4">
              <h2 className="font-medium mb-2">Dia a dia</h2>
              <GraficoGastoConversoes dados={d.por_dia.map((x) => ({ data: x.data, gasto: x.gasto, conversoes: x.conversoes, cliques: x.cliques, cpa: x.cpa }))} cod={d.moeda} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
