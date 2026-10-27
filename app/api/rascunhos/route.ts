import { corpo, ok, tratar } from "@/lib/api";
import { rascunhos } from "@/lib/repos";
import { criarRascunho } from "@/lib/servicos/publicacao";
import type { EspecificacaoCampanha } from "@/lib/types";
export const dynamic = "force-dynamic";
export async function GET() {
  return ok(rascunhos.listar());
}
export async function POST(req: Request) {
  return tratar(async () => {
    const b = await corpo<{ cliente_id?: number; conta_id?: number; spec?: EspecificacaoCampanha }>(req);
    if (!b.cliente_id || !b.conta_id || !b.spec) throw new Error("cliente_id, conta_id e spec são obrigatórios.");
    const r = criarRascunho({ cliente_id: b.cliente_id, conta_id: b.conta_id, spec: b.spec });
    return ok(r, 201);
  });
}
