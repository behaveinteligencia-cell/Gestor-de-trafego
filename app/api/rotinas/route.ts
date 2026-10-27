import { corpo, ok, tratar } from "@/lib/api";
import { rotinas } from "@/lib/repos";
import { TIPOS_ROTINA, type Rotina, type TipoRotina } from "@/lib/types";
export const dynamic = "force-dynamic";
export async function GET() {
  return ok(rotinas.listar());
}
export async function POST(req: Request) {
  return tratar(async () => {
    const b = await corpo<Partial<Rotina>>(req);
    if (!b.nome?.trim() || !b.tipo || !b.agenda?.trim()) throw new Error("nome, tipo e agenda são obrigatórios.");
    if (!TIPOS_ROTINA.includes(b.tipo as TipoRotina)) throw new Error("Tipo inválido.");
    if (b.agenda.trim().split(/\s+/).length !== 5) throw new Error("Agenda precisa ter 5 campos cron.");
    const r = rotinas.criar({ nome: b.nome.trim(), descricao: b.descricao ?? null, tipo: b.tipo as TipoRotina, agenda: b.agenda.trim(), ativa: true, cliente_id: b.cliente_id ?? null, config: b.config ?? {}, prompt_claude: b.prompt_claude ?? null });
    return ok(r, 201);
  });
}
