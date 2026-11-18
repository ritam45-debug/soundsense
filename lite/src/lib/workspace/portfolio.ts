import { computeHealth, configFor, scoreBand, type HealthResult } from "../acoustics/health";
import { severityRank, type Severity } from "../acoustics/screening";
import type { LocalAssessment } from "../local/store";
import { healthInputFor } from "./derive";
import { trendNotes } from "./trends";
import type { Room, Workspace } from "./store";

export interface RoomRow { room: Room; health: HealthResult; band: string; openAlerts: number; topSeverity: Severity | null; noise: { value: number; calibrated: boolean } | null; lastActivity: string | null; notes: string[] }
export interface Filters { building: string; floor: string; department: string; roomType: string; severity: "" | Severity; from: string; to: string }
export const NO_FILTERS: Filters = { building: "", floor: "", department: "", roomType: "", severity: "", from: "", to: "" };

export function portfolio(w: Workspace, assessments: LocalAssessment[]): RoomRow[] {
  return w.rooms.map((room) => {
    const a = assessments.find((x) => x.id === room.assessmentId) ?? null;
    const input = healthInputFor(w, room, a); const health = computeHealth(input, configFor(room.roomType, w.settings.weights));
    const open = w.alerts.filter((x) => x.roomId === room.id && x.status !== "resolved");
    const top = open.reduce<Severity | null>((m, x) => (m === null || severityRank(x.severity) > severityRank(m) ? x.severity : m), null);
    const acts = [...w.readings.filter((r) => r.roomId === room.id).map((r) => r.at), ...w.snapshots.filter((s) => s.roomId === room.id).map((s) => s.at), ...(a ? [a.updated_at] : [])].sort();
    return { room, health, band: scoreBand(health.overall), openAlerts: open.length, topSeverity: top, noise: input.ambient ? { value: input.ambient.splDb, calibrated: input.ambient.calibrated } : null, lastActivity: acts[acts.length - 1] ?? null, notes: trendNotes(w.readings.filter((r) => r.roomId === room.id), w.snapshots.filter((s) => s.roomId === room.id), w.settings.screening) };
  });
}
export function applyFilters(rows: RoomRow[], f: Filters): RoomRow[] {
  return rows.filter((r) => (!f.building || r.room.building === f.building) && (!f.floor || r.room.floor === f.floor) && (!f.department || r.room.department === f.department) && (!f.roomType || r.room.roomType === f.roomType)
    && (!f.severity || r.topSeverity === f.severity) && (!f.from || (r.lastActivity !== null && r.lastActivity.slice(0, 10) >= f.from)) && (!f.to || (r.lastActivity !== null && r.lastActivity.slice(0, 10) <= f.to)));
}
export const distinct = (rows: RoomRow[], k: "building" | "floor" | "department" | "roomType") => [...new Set(rows.map((r) => r.room[k]).filter(Boolean))].sort();
const q = (s: string | number | null) => `"${String(s ?? "").replace(/"/g, '""')}"`;
export function toCsv(rows: RoomRow[]): string {
  const head = ["Room", "Building", "Floor", "Department", "Type", "Health score", "Band", "Open alerts", "Highest severity", "Noise (dB)", "Noise basis", "Last activity"];
  return [head.map(q).join(","), ...rows.map((r) => [r.room.name, r.room.building, r.room.floor, r.room.department, r.room.roomType, r.health.overall ?? "Insufficient data", r.band, r.openAlerts, r.topSeverity ?? "", r.noise ? Math.round(r.noise.value) : "", r.noise ? (r.noise.calibrated ? "calibrated" : "uncalibrated estimate") : "", r.lastActivity ?? ""].map(q).join(","))].join("\n");
}
