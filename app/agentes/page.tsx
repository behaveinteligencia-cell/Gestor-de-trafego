import { Cabecalho, Comando, Vazio } from "@/components/ui";
import { listarAgentes, listarSkills } from "@/lib/servicos/agentes";

export const dynamic = "force-dynamic";

export default function PaginaAgentes() {
  const skills = listarSkills();
  const agentes = listarAgentes();
  return (
    <>
      <Cabecalho titulo="Agentes e skills" descricao="O que o Claude Code sabe fazer neste projeto. Skills são fluxos que você invoca; agentes são especialistas que as skills acionam em paralelo." />
      <section className="mb-8">
        <h2 className="font-medium mb-3">Skills (comandos)</h2>
        {skills.length === 0 ? (
          <Vazio titulo="Nenhuma skill encontrada em .claude/skills" />
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {skills.map((s) => (
              <div key={s.nome} className="cartao p-4">
                <div className="flex items-center justify-between">
                  <code className="font-semibold text-primaria">{s.comando}</code>
                  <span className="text-xs text-suave">{s.arquivo}</span>
                </div>
                <p className="text-sm text-suave mt-2 leading-relaxed">{s.descricao}</p>
              </div>
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="font-medium mb-3">Agentes especializados</h2>
        {agentes.length === 0 ? (
          <Vazio titulo="Nenhum agente encontrado em .claude/agents" />
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {agentes.map((a) => (
              <details key={a.nome} className="cartao p-4">
                <summary className="cursor-pointer">
                  <span className="font-semibold">{a.titulo}</span>
                  <span className="text-xs text-suave ml-2">{a.ferramentas.join(", ")}</span>
                  <p className="text-sm text-suave mt-1">{a.descricao}</p>
                </summary>
                <pre className="text-xs mt-3 whitespace-pre-wrap text-suave border-t border-borda pt-3">{a.corpo}</pre>
                <Comando>{`Use o agente ${a.nome} para …`}</Comando>
              </details>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
