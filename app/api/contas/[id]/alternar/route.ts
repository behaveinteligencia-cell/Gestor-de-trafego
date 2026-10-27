import { idDe, ok, tratar } from "@/lib/api";
import { contas } from "@/lib/repos";
export const dynamic = "force-dynamic";
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return tratar(async () => {
    const id = await idDe(ctx.params);
    const atual = contas.porId(id);
    if (!atual) throw new Error("Conta não encontrada.");
    return ok(contas.atualizar(id, { ativa: !atual.ativa }));
  });
}
