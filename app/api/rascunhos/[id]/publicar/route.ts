import { idDe, ok, tratar } from "@/lib/api";
import { publicarRascunho } from "@/lib/servicos/publicacao";
export const dynamic = "force-dynamic";
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return tratar(async () => ok(await publicarRascunho(await idDe(ctx.params))));
}
