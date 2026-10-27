import { idDe, ok, tratar } from "@/lib/api";
import { rotinas } from "@/lib/repos";
import { executarRotina } from "@/lib/servicos/rotinas";
export const dynamic = "force-dynamic";
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return tratar(async () => {
    const r = rotinas.porId(await idDe(ctx.params));
    if (!r) throw new Error("Rotina não encontrada.");
    return ok(await executarRotina(r));
  });
}
