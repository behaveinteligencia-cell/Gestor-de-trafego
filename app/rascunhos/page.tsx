import Link from "next/link";
import { Cabecalho, Comando, EtiquetaPlataforma, EtiquetaStatus, LinkBotao, Vazio } from "@/components/ui";
import { rascunhos } from "@/lib/repos";
import { dataHora, moeda } from "@/lib/formato";

export const dynamic = "force-dynamic";

export default function PaginaRascunhos() {
  const lista = rascunhos.listar();
  return (
    <>
      <Cabecalho
        titulo="Subir campanha"
        descricao="Rascunho → validação → aprovação humana → publicação (nasce pausada) → ativação. Nada vai ao ar sem passar por aqui."
        acoes={
          <LinkBotao href="/rascunhos/nova" primario>
            Nova campanha
          </LinkBotao>
        }
      />
      {lista.length === 0 ? (
        <Vazio titulo="Nenhum rascunho">
          <p>Crie pelo formulário ou peça ao Claude Code:</p>
          <Comando>/trafego campanha</Comando>
        </Vazio>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Campanha</th>
                <th>Cliente / conta</th>
                <th>Plataforma</th>
                <th>Status</th>
                <th>Validação</th>
                <th className="num">Orç./dia</th>
                <th className="num">Teto</th>
                <th>Aprovação</th>
                <th>Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/rascunhos/${r.id}`} className="font-medium hover:underline">
                      {r.nome}
                    </Link>
                    <div className="text-xs text-suave">{r.spec.objetivo}</div>
                  </td>
                  <td className="text-suave">
                    {r.cliente_nome}
                    <div className="text-xs">{r.conta_nome}</div>
                  </td>
                  <td>
                    <EtiquetaPlataforma p={r.plataforma} />
                  </td>
                  <td>
                    <EtiquetaStatus s={r.status} />
                  </td>
                  <td className="text-xs">
                    {r.validacao ? (
                      r.validacao.ok ? (
                        <span className="text-ok">ok{r.validacao.avisos.length ? ` · ${r.validacao.avisos.length} avisos` : ""}</span>
                      ) : (
                        <span className="text-critico">{r.validacao.erros.length} erros</span>
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="num">{moeda(r.spec.orcamento_diario)}</td>
                  <td className="num">{moeda(r.spec.teto_gasto_diario)}</td>
                  <td className="text-xs text-suave">{r.aprovado_por ? `${r.aprovado_por} · ${dataHora(r.aprovado_em)}` : "—"}</td>
                  <td className="text-xs text-suave">{dataHora(r.atualizado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
