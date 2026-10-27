import Link from "next/link";
import { Cabecalho, Comando, Vazio } from "@/components/ui";
import { FormularioCampanha } from "@/components/FormularioCampanha";
import { clientes, contas } from "@/lib/repos";

export const dynamic = "force-dynamic";

export default function PaginaNovaCampanha() {
  const cls = clientes.listar();
  const cts = contas.listar({ apenasAtivas: true });
  if (!cts.length) {
    return (
      <>
        <Cabecalho titulo="Nova campanha" />
        <Vazio titulo="Cadastre uma conta antes">
          <p>
            Vá em <Link href="/configuracoes" className="underline">Configurações</Link> ou use a CLI:
          </p>
          <Comando>npm run gestor -- contas adicionar --cliente slug --plataforma meta --account-id act_123 --nome "Meta"</Comando>
        </Vazio>
      </>
    );
  }
  return (
    <>
      <Link href="/rascunhos" className="text-xs text-suave hover:underline">
        ← Rascunhos
      </Link>
      <Cabecalho titulo="Nova campanha" descricao="Gera um rascunho validado. A publicação só acontece depois da aprovação, e a campanha nasce pausada." />
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <FormularioCampanha clientes={cls} contas={cts.map((c) => ({ id: c.id, cliente_id: c.cliente_id, plataforma: c.plataforma, nome: c.nome, moeda: c.moeda, teto: Number(c.config.teto_gasto_diario ?? 0) || null }))} />
        </div>
        <div className="cartao p-4 text-sm space-y-3 self-start">
          <h2 className="font-medium">Prefere pedir ao Claude?</h2>
          <p className="text-suave">
            No Claude Code, descreva a campanha em linguagem natural. Ele monta o briefing, escreve a copy com o agente <code>copywriter-anuncios</code>, gera o spec e cria o rascunho aqui.
          </p>
          <Comando>/trafego campanha</Comando>
          <p className="text-suave">Exemplo: “Sobe uma campanha de leads no Meta para a Clínica Sorriso, R$ 80/dia, teto R$ 120, público 30–60 em SP, destino WhatsApp.”</p>
        </div>
      </div>
    </>
  );
}
