import type { HealthInput } from "../acoustics/health";
import { screenLevel } from "../acoustics/screening";
import { relativeSnr } from "../acoustics/measurement";
import type { LocalAssessment } from "../local/store";
import type { Room, Workspace } from "./store";

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

/** Build the health-score input for a room from everything on this device: the linked assessment, its recordings, live readings and the readiness check. */
export function healthInputFor(w: Workspace, room: Room, a: LocalAssessment | null): HealthInput {
  const inp: HealthInput = { roomType: room.roomType || (a?.answers.environment as string | undefined) };
  const cfg = w.settings.screening;
  let ambient: { at: number; splDb: number; calibrated: boolean } | undefined;
  if (a) {
    const ans = a.answers as Record<string, any>;
    if (Array.isArray(ans.q2_problems)) inp.problems = arr(ans.q2_problems).filter((p) => p !== "none");
    if (ans.f_clap === "lingers" || ans.f_clap === "short") inp.clap = ans.f_clap;
    if (["never", "rarely", "sometimes", "often"].includes(ans.q7_repeat)) inp.repeats = ans.q7_repeat;
    if (Array.isArray(ans.q9_equipment)) inp.equipment = arr(ans.q9_equipment);
    const occ = Number(ans.q4_occupants); if (Number.isFinite(occ) && occ > 0) inp.occupants = occ;
    if (a.room?.computed?.ratio !== undefined) inp.rt60Ratio = a.room.computed.ratio;
    const ms = a.measurements ?? [];
    const amb = [...ms].filter((m) => m.kind === "ambient").sort((x, y) => Date.parse(y.started_at) - Date.parse(x.started_at));
    const sp = [...ms].filter((m) => m.kind === "speech").sort((x, y) => Date.parse(y.started_at) - Date.parse(x.started_at));
    if (amb[0]) { const r = screenLevel(amb[0].stats, amb[0].calibration ?? { status: "uncalibrated" }, cfg); ambient = { at: Date.parse(amb[0].started_at), splDb: r.value, calibrated: r.basis === "calibrated" }; }
    if (amb[0] && sp[0]) inp.snrDb = relativeSnr(sp[0].stats, amb[0].stats).snrDb;
  }
  if (!inp.occupants && room.occupants) inp.occupants = room.occupants;
  const live = w.readings.find((r) => r.roomId === room.id && r.value !== null && (r.basis === "estimate" || r.basis === "calibrated"));
  if (live && (!ambient || Date.parse(live.at) > ambient.at)) ambient = { at: Date.parse(live.at), splDb: live.value!, calibrated: live.basis === "calibrated" };
  if (ambient) inp.ambient = { splDb: ambient.splDb, calibrated: ambient.calibrated };
  const rd = w.readiness[room.id];
  if (rd) { inp.readiness = { micFound: rd.micFound, speakerFound: rd.speakerFound ?? undefined, signal: rd.signal, clipping: rd.clipping, feedback: rd.feedback }; if (rd.echoReported) inp.problems = [...(inp.problems ?? []), "echo"]; }
  return inp;
}

import type { Evidence } from "../acoustics/compare";
/** All recordings that could be compared for a room, newest first. Levels are on the same estimated-dB scale (assumed offset) unless calibrated. */
export function evidenceFor(w: Workspace, room: Room, a: LocalAssessment | null): Evidence[] {
  const out: Evidence[] = []; const cfg = w.settings.screening;
  for (const m of a?.measurements ?? []) {
    if (m.kind !== "ambient" && m.kind !== "speech") continue;
    const r = screenLevel(m.stats, m.calibration ?? { status: "uncalibrated" }, cfg);
    out.push({ at: m.started_at, kind: m.kind, value: r.value, unit: "dB", basis: r.basis === "calibrated" ? "calibrated" : "estimate", device: m.device_note ?? null, durationS: m.duration_s ?? null, label: `${m.label || (m.kind === "ambient" ? "Room noise" : "Speech")} (assessment recording)` });
  }
  for (const r of w.readings) if (r.roomId === room.id && r.value !== null && (r.basis === "estimate" || r.basis === "calibrated") && r.source !== "readiness") out.push({ at: r.at, kind: "ambient", value: r.value, unit: "dB", basis: r.basis === "calibrated" ? "calibrated" : "estimate", device: null, durationS: null, label: "Live monitoring reading" });
  return out.sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
}
