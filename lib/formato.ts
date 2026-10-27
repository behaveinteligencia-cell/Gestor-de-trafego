// Formatação compartilhada entre servidor e cliente (sem importar o banco).
export function moeda(v: number | null | undefined, cod = "BRL"): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: cod, maximumFractionDigits: 2 }).format(v);
}
export function numero(v: number | null | undefined, casas = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(v);
}
export function pct(v: number | null | undefined, casas = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(v * 100)}%`;
}
export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}
export function dataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${dataCurta(iso)} ${iso.slice(11, 16)}`;
}
export function variacao(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null || anterior === 0) return null;
  return atual / anterior - 1;
}
export function hojeMenos(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}
