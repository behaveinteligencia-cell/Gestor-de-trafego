import { corpo, idDe, ok, tratar } from "@/lib/api";
import { alterarOrcamentoCampanha } from "@/lib/servicos/publicacao";
export const dynamic = "force-dynamic";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return tratar(async () => {
    const id = await idDe(ctx.params);
    const b = await corpo<{ valor?: number; motivo?: string; entrada?: string; forcar?: boolean }>(req);
    let valor = b.valor;
    let motivo = b.motivo ?? "";
    if (b.entrada) {
      // "150; motivo" vindo do prompt da interface
      const [v, ...resto] = b.entrada.split(";");
      valor = Number(v.replace(",", ".").trim());
      motivo = resto.join(";").trim();
    }
    if (!valor) throw new Error("Informe o valor.");
    return ok(await alterarOrcamentoCampanha(id, valor, motivo, "interface", b.forcar === true));
  });
}
