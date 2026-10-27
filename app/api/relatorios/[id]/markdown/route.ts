import { relatorios } from "@/lib/repos";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = relatorios.porId(Number(id));
  if (!r) return new Response("não encontrado", { status: 404 });
  return new Response(r.conteudo_md, { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
