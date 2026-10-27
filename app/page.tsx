import Link from "next/link";
import { Cabecalho, Comando, EtiquetaPlataforma, EtiquetaStatus, Kpi, Vazio } from "@/components/ui";
import { GraficoGastoConversoes } from "@/components/Graficos";
import { alertas, campanhas, execucoes, rascunhos } from "@/lib/repos";
import { resumoGeral } from "@/lib/servicos/analises";
import { rotinasDevidas } from "@/lib/servicos/rotinas";
import { dataHora, moeda, numero, pct, variacao } from "@/lib/formato";

export const dynamic = "force-dynamic";

export default function PaginaInicial({ searchParams }: { searchParams?: Promise<{ dias?: string }> }) {
  return <Conteudo searchParams={searchParams} />;
}

async function Conteudo({ searchParams }: { searchParams?: Promise<{ dias?: string }> }) {
  const sp = (await searchParams) ?? {};
  const dias = Number(sp.dias) || 7;
  const r = resumoGeral(dias);
  const t = r.totais;
  const a = r.anteriores;
  const cod = campanhas.listar()[0]?.moeda ?? "BRL";
  const abertos = alertas.listar({ apenasAbertos: true, limite: 6 });
  const pendentes = execucoes.listar({ status: "pendente_claude", limite: 5 });
  const devidas = rotinasDevidas();
  const emRevisao = rascunhos.listar().filter((x) => ["em_revisao", "aprovado"].includes(x.status));

  if (r.vazio) {
    return (
      <>
        <Cabecalho titulo="Visão geral" descricao="Nenhuma campanha sincronizada ainda." />
        <Vazio titulo="Comece por aqui">
          <p>Cadastre um cliente e uma conta em Configurações, ou peça ao Claude Code:</p>
          <Comando>/trafego setup</Comando>
          <p className="mt-3">Para conhecer o app com dados sintéticos:</p>
          <Comando>npm run gestor -- demo seed</Comando>
        </Vazio>
      </>
    );
  }

  return (
    <>
      <Cabecalho
        titulo="Visão geral"
        descricao={`Últimos ${dias} dias (${r.janela.inicio} a ${r.janela.fim}) comparados ao período anterior · última métrica ${r.ultima_metrica ?? "—"}`}
        acoes={
          <div className="flex gap-1">
            {[7, 14, 30].map((d) => (
              <Link key={d} href={`/?dias=${d}`} className={`botao ${d === dias ? "border-primaria text-primaria" : ""}`}>
                {d}d
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <Kpi rotulo="Investimento" valor={moeda(t.gasto, cod)} variacao={variacao(t.gasto, a.gasto)} />
        <Kpi rotulo="Conversões" valor={numero(t.conversoes, 1)} variacao={variacao(t.conversoes, a.conversoes)} />
        <Kpi rotulo="CPA" valor={moeda(t.cpa, cod)} variacao={variacao(t.cpa, a.cpa)} inverter />
        <Kpi rotulo="CTR" valor={pct(t.ctr)} variacao={variacao(t.ctr, a.ctr)} />
        <Kpi rotulo="CPC" valor={moeda(t.cpc, cod)} variacao={variacao(t.cpc, a.cpc)} inverter />
        <Kpi rotulo="Campanhas ativas" valor={`${r.campanhas.ativas}/${r.campanhas.total}`} sub={`${r.alertas.total} alertas abertos`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="cartao p-4 lg:col-span-2">
          <h2 className="font-medium mb-2">Investimento e conversões por dia</h2>
          <GraficoGastoConversoes dados={r.por_dia.map((d) => ({ data: d.data, gasto: d.gasto, conversoes: d.conversoes, cliques: d.cliques, cpa: d.cpa }))} cod={cod} />
        </div>
        <div className="cartao p-4">
          <h2 className="font-medium mb-3">Por plataforma</h2>
          <table className="tabela">
            <thead>
              <tr>
                <th>Plataforma</th>
                <th className="num">Invest.</th>
                <th className="num">Conv.</th>
                <th className="num">CPA</th>
              </tr>
            </thead>
            <tbody>
              {r.por_plataforma.map((p) => (
                <tr key={p.plataforma}>
                  <td>
                    <EtiquetaPlataforma p={p.plataforma} />
                  </td>
                  <td className="num">{moeda(p.gasto, cod)}</td>
                  <td className="num">{numero(p.conversoes, 1)}</td>
                  <td className="num">{moeda(p.cpa, cod)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2 className="font-medium mt-5 mb-3">Por cliente</h2>
          <table className="tabela">
            <tbody>
              {r.por_cliente.map((c) => (
                <tr key={c.cliente.id}>
                  <td>
                    <Link href={`/campanhas?cliente=${c.cliente.id}`} className="hover:underline">
                      {c.cliente.nome}
                    </Link>
                  </td>
                  <td className="num">{moeda(c.gasto, cod)}</td>
                  <td className="num">{numero(c.conversoes, 1)} conv.</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="cartao p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">Alertas abertos</h2>
            <Link href="/alertas" className="text-xs text-suave hover:underline">
              ver todos
            </Link>
          </div>
          {abertos.length === 0 ? (
            <p className="text-sm text-suave">Nenhum alerta aberto.</p>
          ) : (
            <ul className="space-y-2">
              {abertos.map((al) => (
                <li key={al.id} className="text-sm flex gap-2">
                  <EtiquetaStatus s={al.severidade} />
                  <span className="min-w-0">
                    {al.mensagem}
                    {al.cliente_nome && <span className="text-suave"> · {al.cliente_nome}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="cartao p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">Para o Claude fazer</h2>
            <Link href="/rotinas" className="text-xs text-suave hover:underline">
              rotinas
            </Link>
          </div>
          {pendentes.length === 0 && devidas.length === 0 && emRevisao.length === 0 ? (
            <p className="text-sm text-suave">Nada pendente. Tudo em dia.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {pendentes.map((e) => (
                <li key={e.id}>
                  <span className="etiqueta bg-violet-50 text-violet-700 mr-2">rotina</span>
                  {e.rotina_nome} aguarda análise do Claude
                </li>
              ))}
              {devidas.map((d) => (
                <li key={d.id}>
                  <span className="etiqueta bg-amber-50 text-amber-700 mr-2">devida</span>
                  {d.nome}
                </li>
              ))}
              {emRevisao.map((x) => (
                <li key={x.id}>
                  <EtiquetaStatus s={x.status} />{" "}
                  <Link href={`/rascunhos/${x.id}`} className="hover:underline ml-1">
                    {x.nome}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Comando>{pendentes.length ? "npm run gestor -- rotinas pendentes" : "npm run gestor -- rotinas devidas --executar"}</Comando>
        </div>
        <div className="cartao p-4">
          <h2 className="font-medium mb-3">Peça ao Claude Code</h2>
          <ul className="text-sm space-y-2 text-suave">
            <li>“Como estão as campanhas da Clínica esta semana?”</li>
            <li>“Sobe uma campanha de leads no Meta para o cliente X com R$ 80/dia.”</li>
            <li>“Gera o relatório semanal de todos os clientes com análise.”</li>
            <li>“Roda a rotina de pacing e me explica os alertas.”</li>
            <li>“Audita a conta Google do cliente Y.”</li>
          </ul>
          <p className="text-xs text-suave mt-3">Atualizado {dataHora(new Date().toISOString())}</p>
        </div>
      </div>
    </>
  );
}
