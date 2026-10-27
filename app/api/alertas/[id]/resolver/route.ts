import { corpo, idDe, ok, tratar } from "@/lib/api";
import { alertas, log } from "@/lib/repos";
export const dynamic = "force-dynamic";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return tratar(async () => {
    const id = await idDe(ctx.params);
    const { motivo } = await corpo<{ motivo?: string }>(req);
    alertas.resolver(id);
    log.registrar({ tipo: "alerta.resolver", alvo: `alerta:${id}`, depois: { motivo: motivo ?? null }, autor: "interface" });
    return ok({ ok: true });
  });
}
