"use client";
import { ReactNode, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table2, BarChart3 } from "lucide-react";

const SERIES = (i: number) => `rgb(var(--c${(i % 6) + 1}))`;

/** Chart wrapper: title, optional table view (accessibility – a chart is never the only way to read the numbers). */
export function ChartCard({ title, sub, rows, cols, children, empty }: { title: string; sub?: string; rows: Record<string, any>[]; cols: { key: string; label: string }[]; children: ReactNode; empty?: boolean }) {
  const [table, setTable] = useState(false);
  return (
    <section className="card p-4 sm:p-5" aria-label={title}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div><h3 className="font-display text-[15px] font-semibold">{title}</h3>{sub && <p className="text-xs text-muted">{sub}</p>}</div>
        {!empty && (
          <button className="btn-ghost btn-sm" onClick={() => setTable(!table)} aria-pressed={table} title={table ? "Show chart" : "Show as table"}>
            {table ? <BarChart3 className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}<span className="sr-only">{table ? "Show chart" : "Show as table"}</span>
          </button>
        )}
      </div>
      {empty ? <p className="py-10 text-center text-sm text-muted">No data for these filters yet.</p> : table ? (
        <div className="max-h-64 overflow-auto"><table className="w-full text-sm"><thead><tr>{cols.map((c) => <th key={c.key} className="th">{c.label}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-line">{cols.map((c) => <td key={c.key} className="td">{String(r[c.key])}</td>)}</tr>)}</tbody></table></div>
      ) : children}
    </section>
  );
}

/** Horizontal bars, one hue per entity (fixed order), count + share printed on each bar – no colour-only encoding. */
export function HBars({ data, colorOffset = 0, unit = "" }: { data: { label: string; value: number }[]; colorOffset?: number; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <ul className="space-y-2.5">
      {data.map((d, i) => (
        <li key={d.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SERIES(i + colorOffset) }} /><span className="truncate">{d.label}</span></span>
            <span className="shrink-0 font-semibold tabular-nums">{d.value}{unit} <span className="font-normal text-muted">· {Math.round((d.value / total) * 100)}%</span></span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: SERIES(i + colorOffset) }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function TimeSeries({ data, name }: { data: { date: string; value: number }[]; name: string }) {
  const rows = data.map((d) => ({ ...d, label: new Date(d.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs><linearGradient id="ssArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={SERIES(0)} stopOpacity={0.28} /><stop offset="100%" stopColor={SERIES(0)} stopOpacity={0.02} /></linearGradient></defs>
          <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "rgb(var(--muted))", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "rgb(var(--line))" }} minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fill: "rgb(var(--muted))", fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ stroke: "rgb(var(--muted))", strokeDasharray: "3 3" }} contentStyle={{ background: "rgb(var(--surface))", border: "1px solid rgb(var(--line))", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "rgb(var(--ink))", fontWeight: 600 }} formatter={(v: any) => [v, name]} />
          <Area type="monotone" dataKey="value" stroke={SERIES(0)} strokeWidth={2} fill="url(#ssArea)" dot={rows.length <= 14 ? { r: 3, fill: SERIES(0), stroke: "rgb(var(--surface))", strokeWidth: 2 } : false} activeDot={{ r: 5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Meter({ label, value, max = 5 }: { label: string; value: number | null; max?: number }) {
  return (
    <div>
      <div className="flex justify-between text-[13px]"><span>{label}</span><span className="font-semibold tabular-nums">{value == null ? "—" : value.toFixed(1)} / {max}</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-brand" style={{ width: `${value == null ? 0 : (value / max) * 100}%` }} /></div>
    </div>
  );
}
