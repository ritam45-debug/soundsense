"use client";
import { ReactNode, useState } from "react";
import { Badge, Notice } from "./ui";
import { SEVERITY_LABEL, type AlertRec, type Severity } from "@/lib/acoustics/screening";
import { CAT_IDS, scoreBand, scoreTone, type HealthResult, type HBasis } from "@/lib/acoustics/health";
import type { Room, Workspace } from "@/lib/workspace/store";

export const SEV_TONE: Record<Severity, "good" | "warn" | "bad" | "neutral"> = { green: "good", yellow: "warn", orange: "warn", red: "bad" };
const SEV_ICON: Record<Severity, string> = { green: "●", yellow: "▲", orange: "◆", red: "■" };
/** Severity is always shown with a shape and a word, never colour alone. */
export const SeverityBadge = ({ s }: { s: Severity }) => <Badge tone={SEV_TONE[s]}><span aria-hidden>{SEV_ICON[s]}</span> {SEVERITY_LABEL[s]}</Badge>;
const BASIS_TXT: Record<HBasis, [string, "good" | "warn" | "neutral" | "brand"]> = { calibrated: ["Calibrated", "good"], estimated: ["Estimate", "warn"], calculated: ["Calculated", "brand"], reported: ["Reported", "neutral"], unavailable: ["Not available", "neutral"] };
export const BasisBadge = ({ b }: { b: HBasis }) => <Badge tone={BASIS_TXT[b][1]}>{BASIS_TXT[b][0]}</Badge>;

export function Sparkline({ values, label, height = 60, min, max }: { values: number[]; label: string; height?: number; min?: number; max?: number }) {
  if (values.length < 2) return <p className="text-xs text-muted">Trend appears after a few seconds.</p>;
  const lo = min ?? Math.min(...values) - 2, hi = max ?? Math.max(...values) + 2, w = 300;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${height - ((v - lo) / Math.max(1, hi - lo)) * height}`).join(" ");
  return <svg viewBox={`0 0 ${w} ${height}`} className="h-[60px] w-full" role="img" aria-label={label}><polyline points={pts} fill="none" stroke="rgb(var(--brand))" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>;
}

export function HealthCard({ h, prev }: { h: HealthResult; prev?: number | null }) {
  const [open, setOpen] = useState(false);
  const delta = prev != null && h.overall !== null ? h.overall - prev : null;
  return (
    <section className="card p-4 sm:p-5" aria-label="Acoustic health score">
      <div className="flex flex-wrap items-center gap-4">
        <div className={`flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-4 ${h.overall === null ? "border-line" : scoreTone(h.overall) === "good" ? "border-good" : scoreTone(h.overall) === "warn" ? "border-warn" : "border-bad"}`}>
          <span className="font-display text-3xl font-semibold tabular-nums">{h.overall ?? "–"}</span><span className="text-[11px] text-muted">out of 100</span>
        </div>
        <div className="min-w-[200px] flex-1">
          <h3 className="font-display text-base font-semibold">Acoustic health: {scoreBand(h.overall)}</h3>
          <p className="mt-1 text-sm text-muted">{h.gradeText}</p>
          {delta !== null && <p className="mt-1 text-sm font-semibold">{delta === 0 ? "No change since the previous score." : `${delta > 0 ? "Up" : "Down"} ${Math.abs(delta)} point${Math.abs(delta) === 1 ? "" : "s"} since the previous score.`}</p>}
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {CAT_IDS.map((id) => { const c = h.categories.find((x) => x.id === id)!; return (
          <li key={id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
            <span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{c.label}</span><BasisBadge b={c.basis} /><span className="text-xs text-muted">weight {Math.round(c.weight * 100)}%</span></span>
            <span className="tabular-nums font-semibold">{c.score ?? "n/a"}</span>
            <span className="col-span-2 h-2 overflow-hidden rounded-full bg-raised" aria-hidden><span className="block h-full rounded-full bg-brand" style={{ width: `${c.score ?? 0}%` }} /></span>
          </li>); })}
      </ul>
      {h.status === "insufficient" && <div className="mt-4"><Notice tone="warn" title="Insufficient data"><ul className="mt-1 list-disc pl-5">{h.missing.map((m) => <li key={m}>{m}</li>)}</ul></Notice></div>}
      {h.status === "ok" && (
        <div className="mt-4">
          <button className="btn-secondary btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"} why points were lost</button>
          {open && (
            <div className="mt-3 space-y-3 text-sm">
              {h.deductions.length ? <ul className="space-y-1.5">{h.deductions.map((d, i) => <li key={i} className="flex justify-between gap-3"><span>{d.text}</span><span className="shrink-0 font-semibold tabular-nums">−{d.points}</span></li>)}</ul> : <p>No points lost on the areas we have evidence for.</p>}
              {h.opportunities.length > 0 && <div><p className="font-semibold">Biggest chances to improve</p><ul className="list-disc pl-5">{h.opportunities.map((o) => <li key={o.text}>{o.text} <span className="text-muted">(up to +{o.gain})</span></li>)}</ul></div>}
              <p className="text-xs text-muted">The score is an illustrative model: curves and weights are documented judgement values, not a published standard. Missing areas are left out, not guessed.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function AlertCard({ a, room, onAck, onResolve, onEscalate }: { a: AlertRec; room?: Room | null; onAck?: () => void; onResolve?: () => void; onEscalate?: () => void }) {
  return (
    <article className="card p-4" aria-label={`${SEVERITY_LABEL[a.severity]} alert: ${a.title}`}>
      <div className="flex flex-wrap items-center gap-2"><SeverityBadge s={a.severity} />{a.status !== "open" && <Badge>{a.status === "acknowledged" ? "Acknowledged" : "Resolved"}</Badge>}{room && <span className="text-sm font-semibold">{room.name}</span>}</div>
      <h3 className="mt-2 font-display text-base font-semibold">{a.title}</h3>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[130px_1fr]">
        <dt className="text-muted">Reading</dt><dd>{a.reading}</dd>
        <dt className="text-muted">Evidence basis</dt><dd>{a.basis}</dd>
        <dt className="text-muted">Likely source</dt><dd>{a.source}</dd>
        <dt className="text-muted">First seen</dt><dd>{new Date(a.createdAt).toLocaleString()} · seen {a.count}×</dd>
        <dt className="text-muted">Why it matters</dt><dd>{a.explanation}</dd>
        <dt className="text-muted">What to do</dt><dd>{a.action}</dd>
        <dt className="text-muted">Check again</dt><dd>{a.reassess}</dd>
        <dt className="text-muted">Escalation</dt><dd>{a.escalation}</dd>
      </dl>
      {(onAck || onResolve || onEscalate) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {onAck && a.status === "open" && <button className="btn-secondary btn-sm" onClick={onAck}>Acknowledge</button>}
          {onResolve && a.status !== "resolved" && <button className="btn-secondary btn-sm" onClick={onResolve}>Mark resolved</button>}
          {onEscalate && a.status !== "resolved" && <button className="btn-secondary btn-sm" onClick={onEscalate}>Prepare escalation message</button>}
        </div>
      )}
    </article>
  );
}

export function RoomSelect({ w, value, onChange, allowNone = true, id = "room" }: { w: Workspace; value: string; onChange: (v: string) => void; allowNone?: boolean; id?: string }) {
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {allowNone && <option value="">No room (just try it)</option>}
      {w.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}{r.building ? ` – ${r.building}` : ""}</option>)}
    </select>
  );
}
export const H2 = ({ children }: { children: ReactNode }) => <h2 className="mb-2 font-display text-[15px] font-semibold">{children}</h2>;
