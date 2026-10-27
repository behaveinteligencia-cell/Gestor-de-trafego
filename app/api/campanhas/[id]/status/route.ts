import { corpo, idDe, ok, tratar } from "@/lib/api";
import { alterarStatusCampanha } from "@/lib/servicos/publicacao";
export const dynamic = "force-dynamic";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return tratar(async () => {
    const id = await idDe(ctx.params);
    const b = await corpo<{ status?: "ativa" | "pausada"; motivo?: string }>(req);
    if (b.status !== "ativa" && b.status !== "pausada") throw new Error("status deve ser ativa ou pausada.");
    return ok(await alterarStatusCampanha(id, b.status, b.motivo ?? "", "interface"));
  });
}
