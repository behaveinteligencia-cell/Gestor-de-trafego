import Link from "next/link";
import { notFound } from "next/navigation";
import { AcaoBotao } from "@/components/AcaoBotao";
import { Cabecalho, Comando, EtiquetaPlataforma, EtiquetaStatus } from "@/components/ui";
import { rascunhos } from "@/lib/repos";
import { dataHora, moeda } from "@/lib/formato";

export const dynamic = "force-dynamic";

export default async function PaginaRascunho({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = rascunhos.porId(Number(id));
  if (!r) notFound();
  const s = r.spec;
  const v = r.validacao;
  const podeAprovar = v?.ok && ["rascunho", "em_revisao"].includes(r.status);
  const podePublicar = r.status === "aprovado";

  return (
    <>
      <Link href="/rascunhos" className="text-xs text-suave hover:underline">
        ← Rascunhos
      </Link>
      <Cabecalho
        titulo={r.nome}
        descricao={`${r.cliente_nome} · ${r.conta_nome} · criado ${dataHora(r.criado_em)}`}
        acoes={
          <>
            <EtiquetaPlataforma p={r.plataforma} />
            <EtiquetaStatus s={r.status} />
          </>
        }
      />

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="cartao p-5">
            <h2 className="font-medium mb-3">Resumo da campanha</h2>
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Item k="Objetivo" v={s.objetivo} />
              <Item k="Orçamento diário" v={moeda(s.orcamento_diario)} />
              <Item k="Orçamento total" v={moeda(s.orcamento_total)} />
              <Item k="Teto diário aprovado" v={moeda(s.teto_gasto_diario)} />
              <Item k="Início" v={s.inicio ?? "imediato"} />
              <Item k="Fim" v={s.fim ?? "sem fim"} />
              <Item k="Lance" v={s.lance ? `${s.lance.estrategia}${s.lance.valor ? ` (${s.lance.valor})` : ""}` : "padrão"} />
              <Item k="Conversão" v={s.conversao ? [s.conversao.evento, s.conversao.destino, s.conversao.pixel_id].filter(Boolean).join(" · ") : "—"} />
              <Item k="Posicionamentos" v={Array.isArray(s.posicionamentos) ? s.posicionamentos.join(", ") : s.posicionamentos ?? "automático"} />
            </dl>
            <h3 className="font-medium mt-5 mb-2">Público</h3>
            <p className="text-sm">{s.publico?.descricao ?? "—"}</p>
            <div className="flex flex-wrap gap-1 mt-2 text-xs">
              {(s.publico?.localizacoes ?? []).map((l) => (
                <span key={l} className="etiqueta bg-fundo">
                  {l}
                </span>
              ))}
              {(s.publico?.idade_min || s.publico?.idade_max) && (
                <span className="etiqueta bg-fundo">
                  {s.publico.idade_min ?? "18"}–{s.publico.idade_max ?? "65+"}
                </span>
              )}
              {(s.publico?.interesses ?? []).map((i) => (
                <span key={i} className="etiqueta bg-primaria-suave text-primaria">
                  {i}
                </span>
              ))}
            </div>
            {s.palavras_chave?.length ? (
              <>
                <h3 className="font-medium mt-5 mb-2">Palavras-chave</h3>
                <div className="flex flex-wrap gap-1 text-xs">
                  {s.palavras_chave.map((k, i) => (
                    <span key={i} className="etiqueta bg-fundo">
                      {k.texto} <span className="text-suave ml-1">{k.correspondencia}</span>
                    </span>
                  ))}
                </div>
              </>
            ) : null}
            {s.observacoes && <p className="text-sm text-suave mt-4 italic">{s.observacoes}</p>}
          </div>

          <div className="cartao p-5">
            <h2 className="font-medium mb-3">Anúncios ({s.anuncios?.length ?? 0})</h2>
            <div className="space-y-3">
              {(s.anuncios ?? []).map((a, i) => (
                <div key={i} className="border border-borda rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <strong>{a.nome}</strong>
                    <span className="etiqueta bg-fundo">{a.formato}</span>
                  </div>
                  {a.titulo && <p className="mt-2 font-medium">{Array.isArray(a.titulo) ? a.titulo.join(" / ") : a.titulo}</p>}
                  {a.texto_principal && <p className="mt-1 text-suave whitespace-pre-line">{Array.isArray(a.texto_principal) ? a.texto_principal.join("\n—\n") : a.texto_principal}</p>}
                  {a.descricao && <p className="mt-1 text-xs text-suave">{Array.isArray(a.descricao) ? a.descricao.join(" / ") : a.descricao}</p>}
                  <div className="mt-2 text-xs text-suave break-all">
                    {a.cta && <span className="mr-3">CTA: {a.cta}</span>}
                    {a.url_destino && <span className="mr-3">→ {a.url_destino}</span>}
                    {a.utm && <span>{a.utm}</span>}
                  </div>
                  {a.midia?.length ? <div className="mt-1 text-xs text-suave">Mídia: {a.midia.join(", ")}</div> : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="cartao p-4">
            <h2 className="font-medium mb-2">Validação</h2>
            {!v ? (
              <p className="text-sm text-suave">Ainda não validado.</p>
            ) : (
              <>
                <p className={`text-sm font-medium ${v.ok ? "text-ok" : "text-critico"}`}>{v.ok ? "Passou" : "Falhou"}</p>
                <ul className="text-sm mt-2 space-y-1">
                  {v.erros.map((e, i) => (
                    <li key={`e${i}`} className="text-critico">
                      ✗ {e}
                    </li>
                  ))}
                  {v.avisos.map((a, i) => (
                    <li key={`a${i}`} className="text-atencao">
                      ! {a}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="mt-3">
              <AcaoBotao url={`/api/rascunhos/${r.id}/validar`}>Revalidar</AcaoBotao>
            </div>
          </div>

          <div className="cartao p-4">
            <h2 className="font-medium mb-2">Portão de publicação</h2>
            <ol className="text-sm space-y-2">
              <li className={v?.ok ? "text-ok" : "text-suave"}>1. Validação {v?.ok ? "ok" : "pendente"}</li>
              <li className={r.aprovado_por ? "text-ok" : "text-suave"}>2. Aprovação {r.aprovado_por ? `por ${r.aprovado_por} em ${dataHora(r.aprovado_em)}` : "pendente — quem aprova assina"}</li>
              <li className={r.status === "publicado" ? "text-ok" : "text-suave"}>3. Publicação {r.status === "publicado" ? `${r.external_id} em ${dataHora(r.publicado_em)} (pausada)` : "pendente"}</li>
              <li className="text-suave">4. Ativação manual na página da campanha, com motivo</li>
            </ol>
            <div className="flex flex-wrap gap-2 mt-4">
              {podeAprovar && (
                <AcaoBotao url={`/api/rascunhos/${r.id}/aprovar`} pedir="Nome de quem aprova esta campanha e o teto de gasto:" campo="por" variante="primario">
                  Aprovar
                </AcaoBotao>
              )}
              {podePublicar && (
                <AcaoBotao url={`/api/rascunhos/${r.id}/publicar`} confirmar={`Publicar "${r.nome}" em ${r.plataforma}? A campanha nasce PAUSADA.`} variante="primario">
                  Publicar (pausada)
                </AcaoBotao>
              )}
              {!["publicado", "cancelado"].includes(r.status) && (
                <AcaoBotao url={`/api/rascunhos/${r.id}/cancelar`} confirmar="Cancelar este rascunho?" variante="perigo">
                  Cancelar
                </AcaoBotao>
              )}
            </div>
            {r.erro && <p className="text-sm text-critico mt-3">Erro: {r.erro}</p>}
          </div>

          <div className="cartao p-4">
            <h2 className="font-medium mb-2">No Claude Code</h2>
            <Comando>{`npm run gestor -- rascunhos ver ${r.id}`}</Comando>
            <Comando>{`npm run gestor -- rascunhos aprovar ${r.id} --por "Seu Nome"`}</Comando>
            <Comando>{`npm run gestor -- rascunhos publicar ${r.id}`}</Comando>
          </div>

          <details className="cartao p-4">
            <summary className="font-medium cursor-pointer text-sm">Spec JSON</summary>
            <pre className="text-xs mt-2 overflow-x-auto">{JSON.stringify(s, null, 2)}</pre>
          </details>
        </div>
      </div>
    </>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-suave">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
