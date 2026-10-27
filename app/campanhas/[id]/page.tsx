import Link from "next/link";
import { notFound } from "next/navigation";
import { AcaoBotao } from "@/components/AcaoBotao";
import { GraficoGastoConversoes } from "@/components/Graficos";
import { Cabecalho, Comando, EtiquetaPlataforma, EtiquetaStatus, Kpi } from "@/components/ui";
import { alertas, campanhas, log, metricas } from "@/lib/repos";
import { dataCurta, hojeMenos, moeda, numero, pct, variacao } from "@/lib/formato";

export const dynamic = "force-dynamic";

export default async function PaginaCampanha({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ dias?: string }> }) {
  const { id } = await params;
  const { dias: d } = await searchParams;
  const dias = Number(d) || 14;
  const c = campanhas.porId(Number(id));
  if (!c) notFound();
  const diarias = metricas.diariasDaCampanha(c.id, hojeMenos(dias - 1), hojeMenos(0));
  const t = metricas.totais({ campanha_id: c.id, inicio: hojeMenos(dias - 1), fim: hojeMenos(0) });
  const a = metricas.totais({ campanha_id: c.id, inicio: hojeMenos(dias * 2 - 1), fim: hojeMenos(dias) });
  const alertasCamp = alertas.listar({ apenasAbertos: true }).filter((x) => x.campanha_id === c.id);
  const historico = log.listar(200).filter((l) => l.alvo === `campanha:${c.id}`);

  return (
    <>
      <Link href="/campanhas" className="text-xs text-suave hover:underline">
        ← Campanhas
      </Link>
      <Cabecalho
        titulo={c.nome}
        descricao={`${c.cliente_nome} · ${c.conta_nome} · id externo ${c.external_id} · objetivo ${c.objetivo ?? "—"} · ${dataCurta(c.inicio)} → ${c.fim ? dataCurta(c.fim) : "sem fim"}`}
        acoes={
          <>
            <EtiquetaPlataforma p={c.plataforma} />
            <EtiquetaStatus s={c.status} />
            {c.status === "ativa" && (
              <AcaoBotao url={`/api/campanhas/${c.id}/status`} corpo={{ status: "pausada" }} pedir="Motivo da pausa:">
                Pausar
              </AcaoBotao>
            )}
            {c.status === "pausada" && (
              <AcaoBotao url={`/api/campanhas/${c.id}/status`} corpo={{ status: "ativa" }} pedir="Motivo da ativação:" variante="primario">
                Ativar
              </AcaoBotao>
            )}
            <AcaoBotao url={`/api/campanhas/${c.id}/orcamento`} pedir="Novo orçamento diário e motivo, separados por ponto e vírgula (ex.: 150; escalar após 7 dias com CPA abaixo da meta):" campo="entrada">
              Orçamento
            </AcaoBotao>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <Kpi rotulo="Orçamento/dia" valor={moeda(c.orcamento_diario, c.moeda)} sub={c.orcamento_total ? `total ${moeda(c.orcamento_total, c.moeda)}` : undefined} />
        <Kpi rotulo={`Investido ${dias}d`} valor={moeda(t.gasto, c.moeda)} variacao={variacao(t.gasto, a.gasto)} />
        <Kpi rotulo="Conversões" valor={numero(t.conversoes, 1)} variacao={variacao(t.conversoes, a.conversoes)} />
        <Kpi rotulo="CPA" valor={moeda(t.cpa, c.moeda)} variacao={variacao(t.cpa, a.cpa)} inverter />
        <Kpi rotulo="CTR" valor={pct(t.ctr)} variacao={variacao(t.ctr, a.ctr)} />
        <Kpi rotulo="CPM" valor={moeda(t.cpm, c.moeda)} variacao={variacao(t.cpm, a.cpm)} inverter />
      </div>

      {alertasCamp.length > 0 && (
        <div className="cartao p-4 mb-4 border-l-4 border-l-atencao">
          <h2 className="font-medium mb-2">Alertas abertos</h2>
          <ul className="text-sm space-y-1">
            {alertasCamp.map((al) => (
              <li key={al.id} className="flex gap-2">
                <EtiquetaStatus s={al.severidade} /> {al.mensagem}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="cartao p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium">Dia a dia</h2>
            <div className="flex gap-1">
              {[7, 14, 30].map((n) => (
                <Link key={n} href={`/campanhas/${c.id}?dias=${n}`} className={`botao ${n === dias ? "border-primaria text-primaria" : ""}`}>
                  {n}d
                </Link>
              ))}
            </div>
          </div>
          <GraficoGastoConversoes dados={diarias.map((m) => ({ data: m.data, gasto: m.gasto, conversoes: m.conversoes, cliques: m.cliques, cpa: m.conversoes ? m.gasto / m.conversoes : null }))} cod={c.moeda} />
          <div className="overflow-x-auto mt-3">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Data</th>
                  <th className="num">Investido</th>
                  <th className="num">Impr.</th>
                  <th className="num">Cliques</th>
                  <th className="num">CTR</th>
                  <th className="num">CPC</th>
                  <th className="num">Conv.</th>
                  <th className="num">CPA</th>
                </tr>
              </thead>
              <tbody>
                {[...diarias].reverse().map((m) => (
                  <tr key={m.data}>
                    <td>{dataCurta(m.data)}</td>
                    <td className="num">{moeda(m.gasto, c.moeda)}</td>
                    <td className="num">{numero(m.impressoes)}</td>
                    <td className="num">{numero(m.cliques)}</td>
                    <td className="num">{pct(m.impressoes ? m.cliques / m.impressoes : null)}</td>
                    <td className="num">{moeda(m.cliques ? m.gasto / m.cliques : null, c.moeda)}</td>
                    <td className="num">{numero(m.conversoes, 1)}</td>
                    <td className="num">{moeda(m.conversoes ? m.gasto / m.conversoes : null, c.moeda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-4">
          <div className="cartao p-4">
            <h2 className="font-medium mb-2">Histórico de ações</h2>
            {historico.length === 0 ? (
              <p className="text-sm text-suave">Nenhuma ação registrada nesta campanha.</p>
            ) : (
              <ul className="text-sm space-y-2">
                {historico.map((l) => (
                  <li key={l.id}>
                    <div className="text-xs text-suave">
                      {l.criado_em} · {l.autor}
                    </div>
                    <div>
                      <strong>{l.tipo}</strong> {l.depois?.motivo ? `— ${String(l.depois.motivo)}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="cartao p-4">
            <h2 className="font-medium mb-2">No Claude Code</h2>
            <Comando>{`npm run gestor -- campanhas ver ${c.id} --dias ${dias}`}</Comando>
            <p className="text-xs text-suave mt-2">Ou peça: “analisa a campanha #{c.id} e me diz se escalo ou pauso”.</p>
          </div>
          <details className="cartao p-4">
            <summary className="font-medium cursor-pointer text-sm">Dados brutos da plataforma</summary>
            <pre className="text-xs mt-2 overflow-x-auto">{JSON.stringify(c.raw, null, 2)}</pre>
          </details>
        </div>
      </div>
    </>
  );
}
