import { ok, tratar } from "@/lib/api";
import { executarDevidas } from "@/lib/servicos/rotinas";
export const dynamic = "force-dynamic";
export async function POST() {
  return tratar(async () => ok(await executarDevidas()));
}
