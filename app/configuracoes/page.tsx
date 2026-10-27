import { AcaoBotao } from "@/components/AcaoBotao";
import { Cabecalho, Comando, EtiquetaPlataforma } from "@/components/ui";
import { FormularioCliente, FormularioConta } from "@/components/FormulariosConfig";
import { clientes, contas } from "@/lib/repos";
import { adaptadorReal, modoDemo } from "@/lib/plataformas";
import { NOMES_PLATAFORMA, PLATAFORMAS } from "@/lib/types";
import { caminhoBanco } from "@/lib/db";
import { dataHora } from "@/lib/formato";

export const dynamic = "force-dynamic";

export default function PaginaConfiguracoes() {
  const cls = clientes.listar();
  const cts = contas.listar();
  const cred = PLATAFORMAS.map((p) => ({ p, ...adaptadorReal(p).credenciais() }));
  return (
    <>
      <Cabecalho titulo="Configurações" descricao={`Banco: ${caminhoBanco()}${modoDemo() ? " · GESTOR_MODO=demo" : ""}`} />

      <section className="cartao p-4 mb-4">
        <h2 className="font-medium mb-2">Credenciais das plataformas</h2>
        <p className="text-sm text-suave mb-3">
          Ficam só em <code>.env.local</code>; aqui aparece apenas se estão presentes. O Claude não lê esse arquivo.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {cred.map((c) => (
            <div key={c.p} className="border border-borda rounded-lg p-3 text-sm">
              <div className="flex items-center justify-between">
                <EtiquetaPlataforma p={c.p} />
                <span className={c.completas ? "text-ok text-xs" : "text-atencao text-xs"}>{c.completas ? "ok" : "incompleta"}</span>
              </div>
              <ul className="mt-2 text-xs space-y-0.5">
                {Object.entries(c.presentes).map(([n, ok]) => (
                  <li key={n} className={ok ? "text-ok" : "text-suave"}>
                    {ok ? "●" : "○"} {n}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <section className="cartao p-4">
            <h2 className="font-medium mb-3">Clientes e contas</h2>
            {cls.length === 0 ? (
              <p className="text-sm text-suave">Nenhum cliente. Crie ao lado ou rode <code>npm run gestor -- demo seed</code>.</p>
            ) : (
              <div className="space-y-4">
                {cls.map((c) => (
                  <div key={c.id} className="border border-borda rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <strong>{c.nome}</strong> <span className="text-xs text-suave">slug {c.slug}{c.segmento ? ` · ${c.segmento}` : ""}</span>
                      </div>
                      <AcaoBotao url={`/api/clientes/${c.id}/remover`} confirmar={`Remover ${c.nome} e suas contas/campanhas locais? (nada muda nas plataformas)`} variante="perigo">
                        Remover
                      </AcaoBotao>
                    </div>
                    <table className="tabela mt-2">
                      <tbody>
                        {cts
                          .filter((k) => k.cliente_id === c.id)
                          .map((k) => (
                            <tr key={k.id}>
                              <td>
                                <EtiquetaPlataforma p={k.plataforma} />
                              </td>
                              <td>
                                {k.nome}
                                <div className="text-xs text-suave font-mono">{k.account_id}</div>
                              </td>
                              <td className="text-xs text-suave">
                                {k.moeda} · {k.config.demo ? "demo · " : ""}teto {k.config.teto_gasto_diario ? String(k.config.teto_gasto_diario) : "—"}
                              </td>
                              <td className="text-xs text-suave">sync {dataHora(k.sincronizada_em)}</td>
                              <td className="whitespace-nowrap space-x-1">
                                <AcaoBotao url="/api/sync" corpo={{ conta_id: k.id, dias: 30 }}>
                                  Sync
                                </AcaoBotao>
                                <AcaoBotao url={`/api/contas/${k.id}/teto`} pedir="Teto de gasto diário desta conta:" campo="teto">
                                  Teto
                                </AcaoBotao>
                                <AcaoBotao url={`/api/contas/${k.id}/alternar`}>{k.ativa ? "Desativar" : "Ativar"}</AcaoBotao>
                                <AcaoBotao url={`/api/contas/${k.id}/remover`} confirmar="Remover esta conta e suas campanhas locais?" variante="perigo">
                                  ×
                                </AcaoBotao>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="cartao p-4 text-sm">
            <h2 className="font-medium mb-2">Pelo Claude Code</h2>
            <Comando>/trafego setup</Comando>
            <Comando>npm run gestor -- contas adicionar --cliente slug --plataforma meta --account-id act_123 --nome "Meta" --teto 300</Comando>
          </section>
        </div>
        <div className="space-y-4">
          <FormularioCliente />
          <FormularioConta clientes={cls} plataformas={PLATAFORMAS.map((p) => ({ valor: p, rotulo: NOMES_PLATAFORMA[p] }))} />
        </div>
      </div>
    </>
  );
}
