/**
 * Improvement goals and badges. Badges are earned only from EVIDENCE (measured comparisons, snapshots, a readiness check),
 * never from ticking boxes, so they cannot be gamed by clicking.
 */
import { compareEvidence } from "../acoustics/compare";
import type { LocalAssessment } from "../local/store";
import { evidenceFor, healthInputFor } from "./derive";
import { computeHealth, configFor } from "../acoustics/health";
import type { Workspace } from "./store";

export interface Badge { id: string; name: string; earned: boolean; rooms: string[]; how: string; progress: string }
export function badges(w: Workspace, assessments: LocalAssessment[]): Badge[] {
  const noise: string[] = [], ready: string[] = [], leader: string[] = [], consistent: string[] = [];
  let closed = 0;
  for (const room of w.rooms) {
    const a = assessments.find((x) => x.id === room.assessmentId) ?? null;
    const ev = evidenceFor(w, room, a).filter((e) => e.kind === "ambient");
    if (ev.length >= 2) { const c = compareEvidence(ev[ev.length - 1], ev[0]); if (c.comparable && c.direction === "quieter" && (c.deltaDb ?? 0) <= -3) noise.push(room.name); }
    const h = computeHealth(healthInputFor(w, room, a), configFor(room.roomType, w.settings.weights)); const rd = w.readiness[room.id];
    if (rd?.verdict === "ready" && h.overall !== null && h.overall >= 80 && h.grade === "includes_measurements") ready.push(room.name);
    const snaps = w.snapshots.filter((s) => s.roomId === room.id && s.overall !== null).sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
    if (snaps.length >= 2 && snaps[snaps.length - 1].overall! - snaps[0].overall! >= 5) { leader.push(room.name); closed++; }
    const weeks = new Set(snaps.map((s) => Math.floor(Date.parse(s.at) / (7 * 86_400_000)))); if (snaps.length >= 4 && weeks.size >= 3) consistent.push(room.name);
  }
  return [
    { id: "noise", name: "Noise Reduction Champion", earned: noise.length > 0, rooms: noise, how: "Two comparable room-noise recordings show the room got at least 3 dB quieter.", progress: `${noise.length} room${noise.length === 1 ? "" : "s"}` },
    { id: "ready", name: "Meeting-Ready Room", earned: ready.length > 0, rooms: ready, how: "A Test my room result of READY and a health score of 80 or more that includes measured evidence.", progress: `${ready.length} room${ready.length === 1 ? "" : "s"}` },
    { id: "leader", name: "Acoustic Improvement Leader", earned: leader.length > 0, rooms: leader, how: "A room's saved health score rose by at least 5 points between snapshots.", progress: `${closed} room${closed === 1 ? "" : "s"}` },
    { id: "consistent", name: "Consistency Champion", earned: consistent.length > 0, rooms: consistent, how: "At least 4 score snapshots for a room, spread over at least 3 different weeks.", progress: `${consistent.length} room${consistent.length === 1 ? "" : "s"}` },
  ];
}
export function goalProgress(w: Workspace, assessments: LocalAssessment[], g: Workspace["goals"][number]): { current: number | null; done: boolean; note: string } {
  const room = w.rooms.find((r) => r.id === g.roomId); if (!room || g.kind !== "score") return { current: null, done: false, note: "Goal needs a room." };
  const a = assessments.find((x) => x.id === room.assessmentId) ?? null; const h = computeHealth(healthInputFor(w, room, a), configFor(room.roomType, w.settings.weights));
  if (h.overall === null) return { current: null, done: false, note: "Not enough evidence for a score yet." };
  const done = h.overall >= g.target;
  return { current: h.overall, done, note: done && h.grade === "reported_only" ? "Reached on reported answers only. Record the room to confirm it with a measurement." : done ? "Reached." : `${g.target - h.overall} points to go.` };
}
