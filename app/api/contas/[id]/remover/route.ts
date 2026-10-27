import { idDe, ok, tratar } from "@/lib/api";
import { contas, log } from "@/lib/repos";
export const dynamic = "force-dynamic";
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return tratar(async () => {
    const id = await idDe(ctx.params);
    contas.remover(id);
    log.registrar({ tipo: "conta.remover", alvo: `conta:${id}`, autor: "interface" });
    return ok({ ok: true });
  });
}
