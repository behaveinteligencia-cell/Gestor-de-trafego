import { corpo, idDe, ok, tratar } from "@/lib/api";
import { contas, log } from "@/lib/repos";
export const dynamic = "force-dynamic";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return tratar(async () => {
    const id = await idDe(ctx.params);
    const { teto } = await corpo<{ teto?: string | number }>(req);
    const valor = Number(String(teto).replace(",", "."));
    if (!(valor > 0)) throw new Error("Teto inválido.");
    const atual = contas.porId(id);
    if (!atual) throw new Error("Conta não encontrada.");
    const c = contas.atualizar(id, { config: { ...atual.config, teto_gasto_diario: valor } });
    log.registrar({ tipo: "conta.teto", alvo: `conta:${id}`, antes: { teto: atual.config.teto_gasto_diario ?? null }, depois: { teto: valor }, autor: "interface" });
    return ok(c);
  });
}
