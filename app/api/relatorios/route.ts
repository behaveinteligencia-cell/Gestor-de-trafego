import { corpo, ok, tratar } from "@/lib/api";
import { log, relatorios } from "@/lib/repos";
import { gerarRelatorio } from "@/lib/servicos/relatorios";
import type { Relatorio } from "@/lib/types";
export const dynamic = "force-dynamic";
export async function GET() {
  return ok(relatorios.listar().map(({ conteudo_md: _m, dados: _d, ...r }) => r));
}
export async function POST(req: Request) {
  return tratar(async () => {
    const b = await corpo<{ cliente_id?: number | null; inicio?: string; fim?: string; tipo?: Relatorio["tipo"]; titulo?: string; analise?: string }>(req);
    if (!b.inicio || !b.fim) throw new Error("inicio e fim são obrigatórios.");
    const r = gerarRelatorio({ cliente_id: b.cliente_id ?? null, inicio: b.inicio, fim: b.fim, tipo: b.tipo, titulo: b.titulo, analise: b.analise });
    log.registrar({ tipo: "relatorio.gerar", alvo: `relatorio:${r.id}`, depois: { titulo: r.titulo }, autor: "interface" });
    return ok({ id: r.id, titulo: r.titulo, resumo: r.resumo }, 201);
  });
}
