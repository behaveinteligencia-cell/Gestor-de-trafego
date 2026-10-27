import { idDe, ok, tratar } from "@/lib/api";
import { rotinas } from "@/lib/repos";
export const dynamic = "force-dynamic";
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return tratar(async () => {
    const id = await idDe(ctx.params);
    const r = rotinas.porId(id);
    if (!r) throw new Error("Rotina não encontrada.");
    return ok(rotinas.atualizar(id, { ativa: !r.ativa }));
  });
}
