import { ok } from "@/lib/api";
import { alertas } from "@/lib/repos";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const u = new URL(req.url);
  return ok(alertas.listar({ apenasAbertos: u.searchParams.get("abertos") === "1" }));
}
