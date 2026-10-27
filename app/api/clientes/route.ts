import { corpo, ok, tratar } from "@/lib/api";
import { clientes, log } from "@/lib/repos";
export const dynamic = "force-dynamic";
export async function GET() {
  return ok(clientes.listar());
}
export async function POST(req: Request) {
  return tratar(async () => {
    const b = await corpo<{ nome?: string; segmento?: string | null; observacoes?: string | null }>(req);
    if (!b.nome?.trim()) throw new Error("Nome obrigatório.");
    const c = clientes.criar({ nome: b.nome.trim(), segmento: b.segmento ?? null, observacoes: b.observacoes ?? null });
    log.registrar({ tipo: "cliente.criar", alvo: `cliente:${c.id}`, depois: { nome: c.nome }, autor: "interface" });
    return ok(c, 201);
  });
}
