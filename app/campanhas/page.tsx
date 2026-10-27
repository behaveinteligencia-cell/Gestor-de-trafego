import Link from "next/link";
import { AcaoBotao } from "@/components/AcaoBotao";
import { Cabecalho, Comando, EtiquetaPlataforma, EtiquetaStatus, LinkBotao, Vazio } from "@/components/ui";
import { campanhas, clientes, metricas } from "@/lib/repos";
import { PLATAFORMAS, NOMES_PLATAFORMA, type Plataforma } from "@/lib/types";
import { hojeMenos, moeda, numero, pct } from "@/lib/formato";

export const dynamic = "force-dynamic";

type SP = { cliente?: string; plataforma?: string; status?: string; dias?: string };

export default async function PaginaCampanhas({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const dias = Number(sp.dias) || 7;
  const cliente_id = sp.cliente ? Number(sp.cliente) : undefined;
  const plataforma = PLATAFORMAS.includes(sp.plataforma as Plataforma) ? (sp.plataforma as Plataforma) : undefined;
  const lista = campanhas.listar({ cliente_id, plataforma, status: sp.status || undefined });
  const linhas = lista.map((c) => ({ ...c, m: metricas.totais({ campanha_id: c.id, inicio: hojeMenos(dias - 1), fim: hojeMenos(0) }) }));
  const todosClientes = clientes.listar();

  const filtro = (chave: keyof SP, valor: string | undefined) => {
    const q = new URLSearchParams({ ...(sp as Record<string, string>) });
    if (valor) q.set(chave, valor);
    else q.delete(chave);
    return `/campanhas?${q.toString()}`;
  };

  return (
    <>
      <Cabecalho
        titulo="Campanhas"
        descricao={`${lista.length} campanhas · métricas dos últimos ${dias} dias`}
        acoes={
          <>
            <AcaoBotao url="/api/sync" corpo={{ cliente_id, plataforma, dias: 30 }}>
              Sincronizar
            </AcaoBotao>
            <LinkBotao href="/rascunhos/nova" primario>
              Nova campanha
            </LinkBotao>
          </>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4 text-sm">
        <div className="flex gap-1">
          <Link href={filtro("plataforma", undefined)} className={`botao ${!plataforma ? "border-primaria text-primaria" : ""}`}>
            Todas
          </Link>
          {PLATAFORMAS.map((p) => (
            <Link key={p} href={filtro("plataforma", p)} className={`botao ${plataforma === p ? "border-primaria text-primaria" : ""}`}>
              {NOMES_PLATAFORMA[p]}
            </Link>
          ))}
        </div>
        <div className="flex gap-1">
          {["", "ativa", "pausada"].map((s) => (
            <Link key={s} href={filtro("status", s || undefined)} className={`botao ${(sp.status ?? "") === s ? "border-primaria text-primaria" : ""}`}>
              {s || "Qualquer status"}
            </Link>
          ))}
        </div>
        {todosClientes.length > 1 && (
          <div className="flex gap-1">
            <Link href={filtro("cliente", undefined)} className={`botao ${!cliente_id ? "border-primaria text-primaria" : ""}`}>
              Todos
            </Link>
            {todosClientes.map((c) => (
              <Link key={c.id} href={filtro("cliente", String(c.id))} className={`botao ${cliente_id === c.id ? "border-primaria text-primaria" : ""}`}>
                {c.nome}
              </Link>
            ))}
          </div>
        )}
      </div>

      {linhas.length === 0 ? (
        <Vazio titulo="Nenhuma campanha com esse filtro">
          <p>Sincronize as contas para puxar campanhas das plataformas.</p>
          <Comando>npm run gestor -- sync</Comando>
        </Vazio>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Campanha</th>
                <th>Cliente</th>
                <th>Plataforma</th>
                <th>Status</th>
                <th className="num">Orç./dia</th>
                <th className="num">Investido</th>
                <th className="num">Cliques</th>
                <th className="num">CTR</th>
                <th className="num">Conv.</th>
                <th className="num">CPA</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/campanhas/${c.id}`} className="font-medium hover:underline">
                      {c.nome}
                    </Link>
                    <div className="text-xs text-suave">{c.objetivo ?? "—"}</div>
                  </td>
                  <td className="text-suave">{c.cliente_nome}</td>
                  <td>
                    <EtiquetaPlataforma p={c.plataforma} />
                  </td>
                  <td>
                    <EtiquetaStatus s={c.status} />
                  </td>
                  <td className="num">{moeda(c.orcamento_diario, c.moeda)}</td>
                  <td className="num">{moeda(c.m.gasto, c.moeda)}</td>
                  <td className="num">{numero(c.m.cliques)}</td>
                  <td className="num">{pct(c.m.ctr)}</td>
                  <td className="num">{numero(c.m.conversoes, 1)}</td>
                  <td className="num">{moeda(c.m.cpa, c.moeda)}</td>
                  <td className="whitespace-nowrap">
                    {c.status === "ativa" ? (
                      <AcaoBotao url={`/api/campanhas/${c.id}/status`} corpo={{ status: "pausada" }} pedir="Motivo da pausa (fica no log):">
                        Pausar
                      </AcaoBotao>
                    ) : c.status === "pausada" ? (
                      <AcaoBotao url={`/api/campanhas/${c.id}/status`} corpo={{ status: "ativa" }} pedir="Motivo da ativação (fica no log):">
                        Ativar
                      </AcaoBotao>
                    ) : null}
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
