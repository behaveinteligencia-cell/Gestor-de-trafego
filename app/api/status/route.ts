import { ok } from "@/lib/api";
import { resumoGeral } from "@/lib/servicos/analises";
export const dynamic = "force-dynamic";
export async function GET() {
  return ok(resumoGeral(7));
}
