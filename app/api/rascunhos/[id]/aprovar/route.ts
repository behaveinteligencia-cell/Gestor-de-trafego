import { corpo, idDe, ok, tratar } from "@/lib/api";
import { aprovarRascunho } from "@/lib/servicos/publicacao";
export const dynamic = "force-dynamic";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return tratar(async () => {
    const id = await idDe(ctx.params);
    const { por } = await corpo<{ por?: string }>(req);
    return ok(aprovarRascunho(id, por ?? ""));
  });
}
