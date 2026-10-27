import { idDe, ok, tratar } from "@/lib/api";
import { rotinas } from "@/lib/repos";
export const dynamic = "force-dynamic";
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return tratar(async () => {
    rotinas.remover(await idDe(ctx.params));
    return ok({ ok: true });
  });
}
