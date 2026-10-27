import { adaptador } from "../plataformas";
import { campanhas, contas, metricas } from "../repos";
import type { Conta, Plataforma } from "../types";

export interface ResultadoSync {
  conta: Conta;
  campanhas: number;
  metricas: number;
  erro: string | null;
}

function diasAtras(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

/** Puxa campanhas e métricas diárias de uma conta e grava no banco. */
export async function sincronizarConta(conta: Conta, dias = 30): Promise<ResultadoSync> {
  const ad = adaptador(conta.plataforma, conta);
  const r: ResultadoSync = { conta, campanhas: 0, metricas: 0, erro: null };
  try {
    const remotas = await ad.listarCampanhas(conta);
    const idPorExternal = new Map<string, number>();
    for (const c of remotas) {
      idPorExternal.set(c.external_id, campanhas.upsert(conta.id, c));
      r.campanhas++;
    }
    const fim = new Date().toISOString().slice(0, 10);
    const linhas = await ad.metricasDiarias(conta, diasAtras(dias), fim);
    for (const m of linhas) {
      const id = idPorExternal.get(m.campanha_external_id);
      if (!id) continue; // campanha removida/desconhecida: ignora a métrica
      const { campanha_external_id: _ignorado, ...resto } = m;
      metricas.upsert(id, resto);
      r.metricas++;
    }
    contas.marcarSincronizada(conta.id);
  } catch (e) {
    r.erro = e instanceof Error ? e.message : String(e);
  }
  return r;
}

export async function sincronizar(filtro: { cliente_id?: number; plataforma?: Plataforma; dias?: number } = {}): Promise<ResultadoSync[]> {
  const lista = contas.listar({ cliente_id: filtro.cliente_id, plataforma: filtro.plataforma, apenasAtivas: true });
  const saida: ResultadoSync[] = [];
  for (const c of lista) saida.push(await sincronizarConta(c, filtro.dias ?? 30));
  return saida;
}
