import { idDe, ok, tratar } from "@/lib/api";
import { cancelarRascunho } from "@/lib/servicos/publicacao";
export const dynamic = "force-dynamic";
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return tratar(async () => ok(cancelarRascunho(await idDe(ctx.params))));
}
