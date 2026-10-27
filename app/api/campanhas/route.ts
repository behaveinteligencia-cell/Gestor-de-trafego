import { ok } from "@/lib/api";
import { campanhas } from "@/lib/repos";
import type { Plataforma } from "@/lib/types";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const u = new URL(req.url);
  return ok(
    campanhas.listar({
      cliente_id: Number(u.searchParams.get("cliente")) || undefined,
      plataforma: (u.searchParams.get("plataforma") as Plataforma) || undefined,
      status: u.searchParams.get("status") || undefined,
    }),
  );
}
