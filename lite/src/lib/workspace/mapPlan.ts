/**
 * Room map planning helpers. Coordinates are percentages of the room (x across the width, y along the length).
 * Output is PLANNING SUGGESTIONS from simple geometry rules, not an acoustic simulation, and is never validated against measurements.
 */
import type { MapItem } from "./store";
export const ITEM_KINDS = ["door", "window", "table", "mic", "speaker", "noise", "seat", "panel"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const KIND_LABEL: Record<ItemKind, string> = { door: "Door", window: "Window", table: "Table", mic: "Microphone", speaker: "Speaker", noise: "Noise source", seat: "Seat", panel: "Acoustic panel" };
export const KIND_GLYPH: Record<ItemKind, string> = { door: "D", window: "W", table: "T", mic: "M", speaker: "S", noise: "N", seat: "•", panel: "P" };
export interface Dim { widthM: number; lengthM: number }
export interface Suggestion { id: string; severity: "info" | "warn"; text: string; at?: { x: number; y: number } }
const dist = (a: MapItem, b: { x: number; y: number }, d: Dim) => Math.hypot(((a.x - b.x) / 100) * d.widthM, ((a.y - b.y) / 100) * d.lengthM);
export const distanceM = (a: MapItem, b: MapItem, d: Dim) => dist(a, b, d);
export const clampPct = (n: number) => Math.max(0, Math.min(100, n));

export function suggest(items: MapItem[], d: Dim): Suggestion[] {
  const out: Suggestion[] = []; const of = (k: ItemKind) => items.filter((i) => i.kind === k);
  const mics = of("mic"), spk = of("speaker"), noise = of("noise"), seats = of("seat"), panels = of("panel");
  if (!mics.length) out.push({ id: "no-mic", severity: "info", text: "No microphone placed. For a table-style meeting, a central table microphone gives the most even pickup.", at: { x: 50, y: 50 } });
  for (const m of mics) for (const s of spk) { const dm = dist(m, s, d); if (dm < 1.5) out.push({ id: `fb-${m.id}-${s.id}`, severity: "warn", text: `A microphone is only ${dm.toFixed(1)} m from a speaker, which raises feedback and echo risk. Aim for at least 1.5 m, with the microphone behind the speaker's front.`, at: { x: m.x, y: m.y } }); }
  for (const m of mics) for (const n of noise) { const dm = dist(m, n, d); if (dm < 2) out.push({ id: `nz-${m.id}-${n.id}`, severity: "warn", text: `A microphone is ${dm.toFixed(1)} m from a noise source ("${n.label || "noise source"}"). Move it further away or move the source.`, at: { x: m.x, y: m.y } }); }
  if (mics.length) for (const s of seats) { const nearest = Math.min(...mics.map((m) => dist(m, s, d))); if (nearest > 3) out.push({ id: `cov-${s.id}`, severity: "warn", text: `A seat is ${nearest.toFixed(1)} m from the nearest microphone. Quiet talkers there may be hard to hear. Consider another microphone.`, at: { x: s.x, y: s.y } }); }
  if (spk.length && seats.length === 0) out.push({ id: "no-seat", severity: "info", text: "Add seats to check microphone coverage." });
  if (!panels.length && d.widthM > 0) {
    out.push({ id: "panel-l", severity: "info", text: "Suggested panel position: left wall, level with the middle of the room (first-reflection area).", at: { x: 2, y: 50 } });
    out.push({ id: "panel-r", severity: "info", text: "Suggested panel position: right wall, level with the middle of the room.", at: { x: 98, y: 50 } });
    out.push({ id: "panel-b", severity: "info", text: "Suggested panel position: the wall behind the talkers or the speakers, to reduce reflections back into the room.", at: { x: 50, y: 98 } });
  }
  return out;
}
/** Rough first-reflection points on the side walls for each speaker-listener pair (mirror-image method, side walls only). */
export function reflectionPoints(items: MapItem[], d: Dim): { x: number; y: number; wall: "left" | "right" }[] {
  const spk = items.filter((i) => i.kind === "speaker"), lis = items.filter((i) => i.kind === "seat" || i.kind === "mic");
  const pts: { x: number; y: number; wall: "left" | "right" }[] = [];
  for (const s of spk) for (const l of lis) for (const wall of ["left", "right"] as const) {
    const wx = wall === "left" ? 0 : 100; const mx = 2 * wx - s.x; // mirror speaker across wall
    const t = (wx - l.x) === (mx - l.x) ? 0 : (wx - l.x) / (mx - l.x); // fraction of listener->image path at the wall
    if (!Number.isFinite(t) || t < 0 || t > 1) continue; pts.push({ x: wx, y: clampPct(l.y + t * (s.y - l.y)), wall });
  }
  void d; return pts.slice(0, 40);
}
