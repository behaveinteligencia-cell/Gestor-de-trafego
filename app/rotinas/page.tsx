import { AcaoBotao } from "@/components/AcaoBotao";
import { Cabecalho, Comando, EtiquetaStatus, Vazio } from "@/components/ui";
import { FormularioRotina } from "@/components/FormularioRotina";
import { clientes, execucoes, rotinas } from "@/lib/repos";
import { descreverCron } from "@/lib/servicos/rotinas";
import { dataHora } from "@/lib/formato";

export const dynamic = "force-dynamic";

export default function PaginaRotinas() {
  const lista = rotinas.listar();
  const pendentes = execucoes.listar({ status: "pendente_claude", limite: 20 });
  const historico = execucoes.listar({ limite: 25 });
  const cls = clientes.listar();
  return (
    <>
      <Cabecalho
        titulo="Rotinas"
        descricao="Tarefas recorrentes. A parte determinística (sincronizar, checar, montar relatório) roda pela CLI; a parte que exige julgamento fica pendente para o Claude concluir."
        acoes={
          <>
            {lista.length === 0 && <AcaoBotao url="/api/rotinas/padrao">Criar rotinas padrão</AcaoBotao>}
            <AcaoBotao url="/api/rotinas/executar-devidas" variante="primario">
              Executar devidas agora
            </AcaoBotao>
          </>
        }
      />

      <div className="cartao p-4 mb-4 text-sm">
        <h2 className="font-medium mb-1">Como agendar de verdade</h2>
        <p className="text-suave">
          O app não roda sozinho em segundo plano. Agende no sistema (cron/Agendador de Tarefas) ou como tarefa agendada do Claude Code — este último permite que o Claude conclua as pendências automaticamente.
        </p>
        <Comando>{`*/30 * * * * cd ${process.cwd()} && npm run gestor -- rotinas devidas --executar >> data/rotinas.log 2>&1`}</Comando>
      </div>

      {pendentes.length > 0 && (
        <div className="cartao p-4 mb-4 border-l-4 border-l-violet-500">
          <h2 className="font-medium mb-2">Aguardando o Claude ({pendentes.length})</h2>
          <ul className="space-y-3 text-sm">
            {pendentes.map((e) => (
              <li key={e.id}>
                <div className="flex items-center justify-between gap-2">
                  <strong>
                    #{e.id} {e.rotina_nome}
                  </strong>
                  <span className="text-xs text-suave">{dataHora(e.iniciado_em)}</span>
                </div>
                <p className="text-suave mt-1">{String(e.resultado.prompt_claude ?? "")}</p>
              </li>
            ))}
          </ul>
          <Comando>npm run gestor -- rotinas pendentes</Comando>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {lista.length === 0 ? (
            <Vazio titulo="Nenhuma rotina">
              <p>Crie as rotinas padrão (sync diário, pacing, fadiga, relatório semanal) ou uma personalizada ao lado.</p>
            </Vazio>
          ) : (
            <div className="cartao overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Rotina</th>
                    <th>Tipo</th>
                    <th>Agenda</th>
                    <th>Cliente</th>
                    <th>Última</th>
                    <th>Próxima</th>
                    <th>Claude</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((r) => (
                    <tr key={r.id} className={r.ativa ? "" : "opacity-60"}>
                      <td>
                        <strong>{r.nome}</strong>
                        {r.descricao && <div className="text-xs text-suave max-w-xs">{r.descricao}</div>}
                      </td>
                      <td className="text-xs">{r.tipo}</td>
                      <td className="text-xs whitespace-nowrap">
                        {descreverCron(r.agenda)}
                        <div className="text-suave font-mono">{r.agenda}</div>
                      </td>
                      <td className="text-xs text-suave">{r.cliente_nome ?? "todos"}</td>
                      <td className="text-xs text-suave whitespace-nowrap">{dataHora(r.ultima_execucao)}</td>
                      <td className="text-xs text-suave whitespace-nowrap">{dataHora(r.proxima_execucao)}</td>
                      <td className="text-xs">{r.prompt_claude ? "sim" : "—"}</td>
                      <td className="whitespace-nowrap space-x-1">
                        <AcaoBotao url={`/api/rotinas/${r.id}/executar`}>Executar</AcaoBotao>
                        <AcaoBotao url={`/api/rotinas/${r.id}/alternar`}>{r.ativa ? "Desativar" : "Ativar"}</AcaoBotao>
                        <AcaoBotao url={`/api/rotinas/${r.id}/remover`} confirmar={`Remover a rotina "${r.nome}"?`} variante="perigo">
                          ×
                        </AcaoBotao>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="cartao p-4">
            <h2 className="font-medium mb-2">Histórico</h2>
            {historico.length === 0 ? (
              <p className="text-sm text-suave">Nenhuma execução ainda.</p>
            ) : (
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Rotina</th>
                    <th>Início</th>
                    <th>Status</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map((e) => (
                    <tr key={e.id}>
                      <td>{e.rotina_nome}</td>
                      <td className="text-xs text-suave whitespace-nowrap">{dataHora(e.iniciado_em)}</td>
                      <td>
                        <EtiquetaStatus s={e.status} />
                      </td>
                      <td className="text-xs text-suave max-w-md truncate">{e.erro ?? JSON.stringify({ ...e.resultado, prompt_claude: undefined })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <FormularioRotina clientes={cls} />
      </div>
    </>
  );
}
