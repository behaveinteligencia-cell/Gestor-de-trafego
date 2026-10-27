import { idDe, ok, tratar } from "@/lib/api";
import { clientes, log } from "@/lib/repos";
export const dynamic = "force-dynamic";
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return tratar(async () => {
    const id = await idDe(ctx.params);
    clientes.remover(id);
    log.registrar({ tipo: "cliente.remover", alvo: `cliente:${id}`, autor: "interface" });
    return ok({ ok: true });
  });
}
