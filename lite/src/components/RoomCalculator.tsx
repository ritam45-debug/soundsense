"use client";
import { useEffect, useRef, useState } from "react";
import { Badge, Field, Notice, useToast } from "./ui";
import { call } from "@/lib/client";
import { CEILING_MATERIALS, FLOOR_MATERIALS, RoomAnalysis, RoomInput, WALL_MATERIALS } from "@/lib/acoustics/room";

export const DEFAULT_ROOM: RoomInput = { length_m: 8, width_m: 6, height_m: 3, occupants: 10, floor_material: "vinyl", wall_material: "gypsum", ceiling_material: "gypsum", glass_share: "some", soft_furnishings: "none", panels: "none" };

const RISK = { low: ["good", "Low reverberation risk"], moderate: ["warn", "Moderate reverberation risk"], high: ["bad", "High reverberation risk"] } as const;

export function RoomCalculator({ environment, initial, assessmentId, onSaved }: { environment: string; initial?: Partial<RoomInput> | null; assessmentId?: string; onSaved?: () => void }) {
  const [r, setR] = useState<RoomInput>({ ...DEFAULT_ROOM, ...(initial ?? {}) });
  const [a, setA] = useState<RoomAnalysis | null>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const seq = useRef(0);
  const num = (k: keyof RoomInput, min: number, max: number) => ({
    type: "number" as const, inputMode: "decimal" as const, className: "input", min, max, step: "any",
    value: Number.isFinite(r[k] as number) ? (r[k] as number) : "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => setR({ ...r, [k]: e.target.value === "" ? NaN : Number(e.target.value) }),
  });

  useEffect(() => {
    const ok = r.length_m >= 0.5 && r.width_m >= 0.5 && r.height_m >= 1.5 && r.occupants >= 0;
    if (!ok) { setA(null); return; }
    const id = ++seq.current;
    const t = setTimeout(() => {
      call<{ analysis: RoomAnalysis }>(`/api/assessments/${assessmentId ?? "preview"}/room`, { body: { ...r, environment } })
        .then((x) => id === seq.current && (setA(x.analysis), setErr("")))
        .catch((e) => id === seq.current && setErr(e.message));
    }, 350);
    return () => clearTimeout(t);
  }, [r, environment, assessmentId]);

  async function save() {
    if (!assessmentId) return;
    setSaving(true);
    try { await call(`/api/assessments/${assessmentId}/room`, { method: "PUT", body: r }); toast("Room details saved."); onSaved?.(); } catch (e: any) { toast(e.message, "bad"); } finally { setSaving(false); }
  }
  const sel = (k: "floor_material" | "wall_material" | "ceiling_material", list: { value: string; label: string }[], name: string) => (
    <select className="input" aria-label={name} value={r[k]} onChange={(e) => setR({ ...r, [k]: e.target.value })}>{list.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
  );
  const pick = <K extends "glass_share" | "soft_furnishings" | "panels">(k: K, opts: [RoomInput[K], string][], name: string) => (
    <select className="input" aria-label={name} value={r[k]} onChange={(e) => setR({ ...r, [k]: e.target.value as RoomInput[K] })}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Length (m)" htmlFor="rl"><input id="rl" {...num("length_m", 0.5, 200)} /></Field>
          <Field label="Width (m)" htmlFor="rw"><input id="rw" {...num("width_m", 0.5, 200)} /></Field>
          <Field label="Height (m)" htmlFor="rh"><input id="rh" {...num("height_m", 1.5, 40)} /></Field>
        </div>
        <Field label="Typical number of people" htmlFor="ro"><input id="ro" {...num("occupants", 0, 5000)} /></Field>
        <Field label="Floor"><>{sel("floor_material", FLOOR_MATERIALS, "Floor")}</></Field>
        <Field label="Walls"><>{sel("wall_material", WALL_MATERIALS, "Walls")}</></Field>
        <Field label="Ceiling"><>{sel("ceiling_material", CEILING_MATERIALS, "Ceiling")}</></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Glass"><>{pick("glass_share", [["none", "None"], ["some", "Some windows"], ["large", "Large glass areas"]], "Glass")}</></Field>
          <Field label="Curtains / soft items"><>{pick("soft_furnishings", [["none", "None"], ["some", "Some"], ["lots", "A lot"]], "Curtains and soft items")}</></Field>
          <Field label="Acoustic panels"><>{pick("panels", [["none", "None"], ["some", "Some"], ["extensive", "Extensive"]], "Acoustic panels")}</></Field>
        </div>
        {assessmentId && <button type="button" className="btn-primary" onClick={save} disabled={saving || !a}>{saving ? "Saving…" : "Save room details to this assessment"}</button>}
      </div>

      <div aria-live="polite">
        {err && <p className="err">{err}</p>}
        {!a ? <p className="text-sm text-muted">Enter the room size to see the estimate.</p> : (
          <div className="card space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2"><Badge tone={RISK[a.risk][0]}>{RISK[a.risk][1]}</Badge><span className="text-xs text-muted">Calculated estimate – not a measurement</span></div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted">Room volume</dt><dd className="font-display text-xl font-semibold tabular-nums">{a.volume.toFixed(0)} m³</dd></div>
              <div><dt className="text-muted">Floor area</dt><dd className="font-display text-xl font-semibold tabular-nums">{a.floorArea.toFixed(0)} m²</dd></div>
              <div><dt className="text-muted">Estimated RT60 (empty)</dt><dd className="font-display text-xl font-semibold tabular-nums">{a.rt60Unoccupied.toFixed(2)} s</dd></div>
              <div><dt className="text-muted">With people</dt><dd className="font-display text-xl font-semibold tabular-nums">{a.rt60Occupied.toFixed(2)} s</dd></div>
              <div><dt className="text-muted">Target for this room type</dt><dd className="font-semibold tabular-nums">≤ {a.target.toFixed(1)} s</dd></div>
              <div><dt className="text-muted">Estimated ÷ target</dt><dd className="font-semibold tabular-nums">{a.ratio.toFixed(1)}×</dd></div>
            </dl>
            <RtBar est={a.rt60Unoccupied} target={a.target} />
            <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed">{a.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            <details className="text-[13px]"><summary className="cursor-pointer font-semibold">How this is calculated</summary>
              <p className="mt-2 leading-relaxed text-muted">Sabine equation RT60 = 0.161 × volume ÷ total absorption, using mid-frequency (500 Hz–1 kHz) absorption coefficients for each surface and 0.5 m² of absorption per person. Target: {a.targetSource}. Schroeder frequency ≈ {Math.round(a.geometry.schroederHz)} Hz; critical distance ≈ {a.geometry.criticalDistanceM.toFixed(1)} m (assumes a speech source directivity of 2).</p>
              <table className="mt-2 w-full text-xs"><thead><tr><th className="th">Surface</th><th className="th">Area m²</th><th className="th">α</th></tr></thead><tbody>{a.surfaces.map((s) => <tr key={s.name} className="border-t border-line"><td className="td !py-1">{s.name}</td><td className="td !py-1 tabular-nums">{s.area.toFixed(0)}</td><td className="td !py-1 tabular-nums">{s.alpha}</td></tr>)}</tbody></table>
            </details>
            <Notice tone="info">{a.disclaimer}</Notice>
          </div>
        )}
      </div>
    </div>
  );
}

function RtBar({ est, target }: { est: number; target: number }) {
  const max = Math.max(est, target) * 1.25;
  return (
    <div role="img" aria-label={`Estimated reverberation ${est.toFixed(2)} seconds against a target of ${target} seconds`}>
      <div className="relative h-3 rounded-full bg-raised">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(est / max) * 100}%`, background: est > target ? "rgb(var(--c2))" : "rgb(var(--c3))" }} />
        <div className="absolute -top-1 bottom-[-4px] w-0.5 bg-ink" style={{ left: `${(target / max) * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted"><span>0 s</span><span>target {target} s</span></div>
    </div>
  );
}
