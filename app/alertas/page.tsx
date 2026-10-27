import Link from "next/link";
import { AcaoBotao } from "@/components/AcaoBotao";
import { Cabecalho, Comando, EtiquetaStatus, Vazio } from "@/components/ui";
import { alertas } from "@/lib/repos";
import { dataHora } from "@/lib/formato";

export const dynamic = "force-dynamic";

export default async function PaginaAlertas({ searchParams }: { searchParams: Promise<{ todos?: string }> }) {
  const { todos } = await searchParams;
  const lista = alertas.listar({ apenasAbertos: !todos });
  return (
    <>
      <Cabecalho
        titulo="Alertas"
        descricao="Gerados pelas rotinas de pacing, fadiga criativa, CPA e frescor dos dados. Um alerta é uma observação, não uma ordem: a decisão continua humana (ou do Claude, com motivo)."
        acoes={
          <>
            <Link href={todos ? "/alertas" : "/alertas?todos=1"} className="botao">
              {todos ? "Só abertos" : "Incluir resolvidos"}
            </Link>
            <AcaoBotao url="/api/alertas/checar" variante="primario">
              Rodar checagens agora
            </AcaoBotao>
          </>
        }
      />
      {lista.length === 0 ? (
        <Vazio titulo="Nenhum alerta aberto">
          <p>As checagens rodam nas rotinas. Para rodar agora:</p>
          <Comando>npm run gestor -- alertas checar</Comando>
        </Vazio>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Sev.</th>
                <th>Tipo</th>
                <th>Mensagem</th>
                <th>Cliente</th>
                <th>Campanha</th>
                <th>Quando</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => (
                <tr key={a.id} className={a.resolvido_em ? "opacity-60" : ""}>
                  <td>
                    <EtiquetaStatus s={a.severidade} />
                  </td>
                  <td className="text-xs whitespace-nowrap">{a.tipo}</td>
                  <td className="max-w-xl">{a.mensagem}</td>
                  <td className="text-suave whitespace-nowrap">{a.cliente_nome ?? "—"}</td>
                  <td className="text-suave">
                    {a.campanha_id ? (
                      <Link href={`/campanhas/${a.campanha_id}`} className="hover:underline">
                        {a.campanha_nome}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-xs text-suave whitespace-nowrap">{dataHora(a.criado_em)}</td>
                  <td>
                    {!a.resolvido_em && (
                      <AcaoBotao url={`/api/alertas/${a.id}/resolver`} pedir="O que foi feito? (fica no log)">
                        Resolver
                      </AcaoBotao>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
