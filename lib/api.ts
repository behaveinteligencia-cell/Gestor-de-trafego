import { NextResponse } from "next/server";

// Utilitários das rotas de API: resposta JSON padronizada e captura de erro.
export function ok(dados: unknown, status = 200) {
  return NextResponse.json(dados, { status });
}
export function erro(msg: string, status = 400) {
  return NextResponse.json({ erro: msg }, { status });
}
export async function corpo<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
export async function tratar(fn: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return erro(msg, 422);
  }
}
export async function idDe(params: Promise<{ id: string }>): Promise<number> {
  const { id } = await params;
  const n = Number(id);
  if (!n) throw new Error("id inválido");
  return n;
}
export const dynamic = "force-dynamic";
