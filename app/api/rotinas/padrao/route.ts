import { ok, tratar } from "@/lib/api";
import { rotinas } from "@/lib/repos";
import { ROTINAS_PADRAO } from "@/lib/servicos/rotinas";
export const dynamic = "force-dynamic";
export async function POST() {
  return tratar(async () => {
    const existentes = new Set(rotinas.listar().map((r) => r.nome));
    const criadas = ROTINAS_PADRAO.filter((r) => !existentes.has(r.nome)).map((r) => rotinas.criar(r));
    return ok({ criadas: criadas.length });
  });
}
