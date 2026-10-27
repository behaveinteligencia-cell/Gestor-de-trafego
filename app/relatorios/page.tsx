import Link from "next/link";
import { Cabecalho, Comando, EtiquetaStatus, Vazio } from "@/components/ui";
import { FormularioRelatorio } from "@/components/FormularioRelatorio";
import { clientes, relatorios } from "@/lib/repos";
import { dataCurta, dataHora } from "@/lib/formato";

export const dynamic = "force-dynamic";

export default function PaginaRelatorios() {
  const lista = relatorios.listar();
  const cls = clientes.listar();
  return (
    <>
      <Cabecalho titulo="Relatórios" descricao="Tabelas e comparações são geradas aqui; a análise em texto é escrita pelo Claude e anexada ao mesmo relatório." />
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          {lista.length === 0 ? (
            <Vazio titulo="Nenhum relatório ainda">
              <p>Gere pelo formulário ao lado, ou peça ao Claude Code:</p>
              <Comando>/trafego relatorio</Comando>
            </Vazio>
          ) : (
            <div className="cartao overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Relatório</th>
                    <th>Cliente</th>
                    <th>Tipo</th>
                    <th>Período</th>
                    <th>Resumo</th>
                    <th>Gerado</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/relatorios/${r.id}`} className="font-medium hover:underline">
                          {r.titulo}
                        </Link>
                      </td>
                      <td className="text-suave">{r.cliente_nome ?? "Todos"}</td>
                      <td>
                        <EtiquetaStatus s={r.tipo} />
                      </td>
                      <td className="text-xs whitespace-nowrap">
                        {dataCurta(r.periodo_inicio)} → {dataCurta(r.periodo_fim)}
                      </td>
                      <td className="text-xs text-suave">{r.resumo}</td>
                      <td className="text-xs text-suave whitespace-nowrap">{dataHora(r.criado_em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <FormularioRelatorio clientes={cls} />
          <div className="cartao p-4 text-sm">
            <h2 className="font-medium mb-2">Com análise do Claude</h2>
            <p className="text-suave">O Claude lê as métricas, escreve resumo executivo, destaques, problemas e próximas ações, e regenera o relatório com a análise embutida.</p>
            <Comando>{`npm run gestor -- relatorios gerar --cliente <slug> --inicio AAAA-MM-DD --fim AAAA-MM-DD --analise analise.md`}</Comando>
          </div>
        </div>
      </div>
    </>
  );
}
