"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { HBars } from "@/components/Charts";
import { BasisBadge, H2, SeverityBadge } from "@/components/ws";
import { Empty, Notice, PageHeader } from "@/components/ui";
import { CAT_IDS, CAT_LABEL } from "@/lib/acoustics/health";
import { ENVIRONMENTS } from "@/lib/acoustics/questionnaire";
import { SEVERITY_LABEL, type Severity } from "@/lib/acoustics/screening";
import { applyFilters, distinct, NO_FILTERS, portfolio, toCsv, type Filters } from "@/lib/workspace/portfolio";
import { downloadBytes } from "@/lib/workspace/simplePdf";
import { useWorkspace } from "@/lib/workspace/useWorkspace";
import { useAssessments } from "@/lib/workspace/useAssessments";

export default function Page() {
  const [w] = useWorkspace(); const as = useAssessments();
  const [f, setF] = useState<Filters>(NO_FILTERS); const [pick, setPick] = useState<string[]>([]);
  const all = useMemo(() => portfolio(w, as ?? []), [w, as]);
  const rows = useMemo(() => applyFilters(all, f), [all, f]);
  const set = (k: keyof Filters, v: string) => setF((x) => ({ ...x, [k]: v }));
  const sel = (id: string) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]));
  const scored = rows.filter((r) => r.health.overall !== null);
  const cmp = rows.filter((r) => pick.includes(r.room.id));
  const Sel = ({ k, label, opts }: { k: keyof Filters; label: string; opts: { v: string; l: string }[] }) => <label className="text-xs font-semibold">{label}<select className="input mt-1" value={f[k]} onChange={(e) => set(k, e.target.value)}><option value="">All</option>{opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></label>;
  return (
    <>
      <PageHeader title="Analytics" sub="All your rooms in one place. Scores come only from the evidence saved on this device." actions={<button className="btn-secondary" disabled={!rows.length} onClick={() => downloadBytes(new TextEncoder().encode(toCsv(rows)), "soundsense-rooms.csv", "text/csv")}><Download className="h-4 w-4" /> Export CSV</button>} />
      {!all.length ? <Empty title="No rooms yet" action={<Link className="btn-primary btn-sm" href="/app/rooms">Add a room</Link>}>Add the rooms you look after to compare them.</Empty> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <Sel k="building" label="Building" opts={distinct(all, "building").map((v) => ({ v, l: v }))} /><Sel k="floor" label="Floor" opts={distinct(all, "floor").map((v) => ({ v, l: v }))} />
            <Sel k="department" label="Department" opts={distinct(all, "department").map((v) => ({ v, l: v }))} /><Sel k="roomType" label="Room type" opts={ENVIRONMENTS.map((o) => ({ v: o.value, l: o.label }))} />
            <Sel k="severity" label="Highest alert" opts={(["yellow", "orange", "red"] as Severity[]).map((v) => ({ v, l: SEVERITY_LABEL[v] }))} />
            <label className="text-xs font-semibold">Active from<input type="date" className="input mt-1" value={f.from} onChange={(e) => set("from", e.target.value)} /></label>
            <label className="text-xs font-semibold">Active to<input type="date" className="input mt-1" value={f.to} onChange={(e) => set("to", e.target.value)} /></label>
          </div>
          <p className="mb-3 text-sm text-muted" aria-live="polite">{rows.length} of {all.length} rooms. {all.length - all.filter((r) => r.health.overall !== null).length > 0 && `${all.filter((r) => r.health.overall === null).length} have insufficient data for a score.`} <button className="font-semibold text-brand" onClick={() => setF(NO_FILTERS)}>Clear filters</button></p>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section className="card overflow-x-auto p-0"><table className="w-full min-w-[640px] text-sm"><caption className="sr-only">Rooms with health score, alerts and noise</caption>
              <thead><tr><th className="th">Compare</th><th className="th">Room</th><th className="th">Score</th><th className="th">Alerts</th><th className="th">Noise</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.room.id} className="border-t border-line align-top">
                  <td className="td"><input type="checkbox" className="h-5 w-5 accent-[rgb(var(--brand))]" aria-label={`Compare ${r.room.name}`} checked={pick.includes(r.room.id)} disabled={!pick.includes(r.room.id) && pick.length >= 3} onChange={() => sel(r.room.id)} /></td>
                  <td className="td"><Link className="font-semibold text-brand" href={`/app/rooms?id=${r.room.id}`}>{r.room.name}</Link><p className="text-xs text-muted">{[r.room.building, r.room.floor && `floor ${r.room.floor}`, r.room.department].filter(Boolean).join(" · ")}</p>{r.notes.map((n) => <p key={n} className="mt-1 text-xs">{n}</p>)}</td>
                  <td className="td tabular-nums">{r.health.overall ?? "n/a"}<span className="block text-xs text-muted">{r.band}</span></td>
                  <td className="td">{r.topSeverity ? <><SeverityBadge s={r.topSeverity} /><span className="ml-1 text-xs text-muted">{r.openAlerts}</span></> : <span className="text-muted">None</span>}</td>
                  <td className="td">{r.noise ? <>{Math.round(r.noise.value)} dB <BasisBadge b={r.noise.calibrated ? "calibrated" : "estimated"} /></> : <span className="text-muted">No reading</span>}</td>
                </tr>))}</tbody></table>{!rows.length && <p className="p-6 text-center text-sm text-muted">No rooms match these filters.</p>}</section>
            <div className="space-y-4">
              <section className="card p-4"><H2>Health score by room</H2>{scored.length ? <HBars data={[...scored].sort((a, b) => (b.health.overall ?? 0) - (a.health.overall ?? 0)).map((r) => ({ label: r.room.name, value: r.health.overall! }))} /> : <p className="text-sm text-muted">No scored rooms for these filters.</p>}</section>
              <Notice tone="info">Trend notes in the table describe past readings and snapshots (at least three needed). They are not forecasts.</Notice>
            </div>
          </div>
          {cmp.length >= 2 && (
            <section className="card mt-5 overflow-x-auto p-4" aria-label="Room comparison"><H2>Comparing {cmp.length} rooms</H2>
              <table className="w-full min-w-[520px] text-sm"><thead><tr><th className="th">Area</th>{cmp.map((r) => <th key={r.room.id} className="th">{r.room.name}</th>)}</tr></thead>
                <tbody><tr className="border-t border-line"><td className="td font-semibold">Overall</td>{cmp.map((r) => <td key={r.room.id} className="td tabular-nums font-semibold">{r.health.overall ?? "n/a"}</td>)}</tr>
                  {CAT_IDS.map((id) => <tr key={id} className="border-t border-line"><td className="td">{CAT_LABEL[id]}</td>{cmp.map((r) => { const c = r.health.categories.find((x) => x.id === id)!; return <td key={r.room.id} className="td tabular-nums">{c.score ?? "n/a"} <span className="text-xs text-muted">{c.basis}</span></td>; })}</tr>)}</tbody></table></section>)}
        </>)}
    </>
  );
}
