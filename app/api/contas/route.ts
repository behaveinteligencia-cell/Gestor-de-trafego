import { corpo, ok, tratar } from "@/lib/api";
import { contas, log } from "@/lib/repos";
import { PLATAFORMAS, type Plataforma } from "@/lib/types";
export const dynamic = "force-dynamic";
export async function GET() {
  return ok(contas.listar());
}
export async function POST(req: Request) {
  return tratar(async () => {
    const b = await corpo<{ cliente_id?: number; plataforma?: string; account_id?: string; nome?: string; moeda?: string; config?: Record<string, unknown> }>(req);
    if (!b.cliente_id || !b.plataforma || !b.account_id?.trim() || !b.nome?.trim()) throw new Error("cliente_id, plataforma, account_id e nome são obrigatórios.");
    if (!PLATAFORMAS.includes(b.plataforma as Plataforma)) throw new Error("Plataforma inválida.");
    const config = Object.fromEntries(Object.entries(b.config ?? {}).filter(([, v]) => v !== undefined && v !== false && v !== ""));
    const c = contas.criar({ cliente_id: b.cliente_id, plataforma: b.plataforma as Plataforma, account_id: b.account_id.trim(), nome: b.nome.trim(), moeda: b.moeda, config });
    log.registrar({ tipo: "conta.adicionar", alvo: `conta:${c.id}`, depois: { plataforma: c.plataforma, account_id: c.account_id }, autor: "interface" });
    return ok(c, 201);
  });
}
