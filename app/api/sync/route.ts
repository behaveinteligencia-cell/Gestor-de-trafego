import { corpo, ok, tratar } from "@/lib/api";
import { contas } from "@/lib/repos";
import { sincronizar, sincronizarConta } from "@/lib/servicos/sync";
import type { Plataforma } from "@/lib/types";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return tratar(async () => {
    const b = await corpo<{ conta_id?: number; cliente_id?: number; plataforma?: Plataforma; dias?: number }>(req);
    if (b.conta_id) {
      const c = contas.porId(b.conta_id);
      if (!c) throw new Error("Conta não encontrada.");
      const r = await sincronizarConta(c, b.dias ?? 30);
      if (r.erro) throw new Error(r.erro);
      return ok({ campanhas: r.campanhas, metricas: r.metricas });
    }
    const r = await sincronizar({ cliente_id: b.cliente_id, plataforma: b.plataforma, dias: b.dias ?? 30 });
    const erros = r.filter((x) => x.erro).map((x) => `${x.conta.nome}: ${x.erro}`);
    if (erros.length) throw new Error(erros.join(" | "));
    return ok(r.map((x) => ({ conta: x.conta.nome, campanhas: x.campanhas, metricas: x.metricas })));
  });
}
