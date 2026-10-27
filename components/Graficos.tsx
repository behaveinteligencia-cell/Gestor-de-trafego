"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { moeda, numero } from "@/lib/formato";

export interface PontoDia {
  data: string;
  gasto: number;
  conversoes: number;
  cliques: number;
  cpa: number | null;
}

const COR_GASTO = "#ff6a1a";
const COR_CONV = "#2563eb";

function rotuloDia(d: string) {
  const [, m, dd] = d.split("-");
  return `${dd}/${m}`;
}

export function GraficoGastoConversoes({ dados, cod = "BRL" }: { dados: PontoDia[]; cod?: string }) {
  if (!dados.length) return <p className="text-sm text-suave p-6 text-center">Sem dados no período.</p>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={dados} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COR_GASTO} stopOpacity={0.25} />
            <stop offset="100%" stopColor={COR_GASTO} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
        <XAxis dataKey="data" tickFormatter={rotuloDia} tick={{ fontSize: 11 }} stroke="#9ca3af" />
        <YAxis yAxisId="g" tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v) => numero(v)} width={60} />
        <YAxis yAxisId="c" orientation="right" tick={{ fontSize: 11 }} stroke="#9ca3af" width={40} />
        <Tooltip
          formatter={(v, nome) => [nome === "Investimento" ? moeda(Number(v), cod) : numero(Number(v), 1), nome]}
          labelFormatter={(l) => rotuloDia(String(l))}
          contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e4e7ec" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area isAnimationActive={false} yAxisId="g" type="monotone" dataKey="gasto" name="Investimento" stroke={COR_GASTO} fill="url(#g1)" strokeWidth={2} />
        <Area isAnimationActive={false} yAxisId="c" type="monotone" dataKey="conversoes" name="Conversões" stroke={COR_CONV} fill="transparent" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function GraficoBarras({ dados, chave, nome, cod = "BRL", moedaFmt }: { dados: Array<Record<string, string | number | null>>; chave: string; nome: string; cod?: string; moedaFmt?: boolean }) {
  if (!dados.length) return <p className="text-sm text-suave p-6 text-center">Sem dados.</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={dados} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
        <XAxis dataKey="nome" tick={{ fontSize: 11 }} stroke="#9ca3af" />
        <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v) => numero(v)} width={60} />
        <Tooltip formatter={(v) => (moedaFmt ? moeda(Number(v), cod) : numero(Number(v), 1))} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e4e7ec" }} />
        <Bar isAnimationActive={false} dataKey={chave} name={nome} fill={COR_GASTO} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
