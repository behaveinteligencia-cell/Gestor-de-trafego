import { relatorios } from "@/lib/repos";
import { markdownParaHtml } from "@/lib/md";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = relatorios.porId(Number(id));
  if (!r) return new Response("não encontrado", { status: 404 });
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${r.titulo}</title>
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#111;line-height:1.5}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:14px}th,td{border:1px solid #e4e7ec;padding:6px 10px}th{background:#f6f7f9;text-align:left}
h1{font-size:26px}h2{font-size:18px;margin-top:28px}em{color:#6b7280}@media print{body{margin:0}}</style></head>
<body>${markdownParaHtml(r.conteudo_md)}</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
