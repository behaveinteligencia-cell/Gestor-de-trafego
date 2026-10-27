import { ok, tratar } from "@/lib/api";
import { checarCpa, checarFadiga, checarFrescor, checarPacing } from "@/lib/servicos/analises";
export const dynamic = "force-dynamic";
export async function POST() {
  return tratar(async () => {
    const novos = [...checarPacing(), ...checarFadiga(), ...checarCpa(), ...checarFrescor()];
    return ok({ novos: novos.length, alertas: novos });
  });
}
