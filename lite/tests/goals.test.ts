import { describe, expect, it } from "vitest";
import { badges, goalProgress } from "@/lib/workspace/goals";
import { addRoom, emptyWs } from "@/lib/workspace/store";
import { addReading } from "@/lib/workspace/ops";
const snap = (roomId: string, day: number, overall: number) => ({ id: `${day}`, roomId, at: new Date(2026, 0, day).toISOString(), overall, categories: {}, input: {} });
describe("goals and badges", () => {
  it("ticking mitigation boxes alone earns nothing", () => {
    const w = emptyWs(); const r = addRoom(w, { name: "A" }); w.mitigationDone[r.id] = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`x${i}`, "2026-01-01"]));
    expect(badges(w, []).every((b) => !b.earned)).toBe(true);
  });
  it("Noise Reduction Champion needs two comparable readings that really dropped ≥3 dB", () => {
    const w = emptyWs(); const r = addRoom(w, { name: "A" });
    addReading(w, { roomId: r.id, source: "live", basis: "estimate", value: 60, label: "", at: "2026-01-01T00:00:00Z" });
    addReading(w, { roomId: r.id, source: "live", basis: "estimate", value: 58, label: "", at: "2026-02-01T00:00:00Z" });
    expect(badges(w, []).find((b) => b.id === "noise")!.earned).toBe(false);
    addReading(w, { roomId: r.id, source: "live", basis: "estimate", value: 52, label: "", at: "2026-03-01T00:00:00Z" });
    expect(badges(w, []).find((b) => b.id === "noise")!.earned).toBe(true);
  });
  it("Improvement Leader needs a real score rise; Consistency needs spread-out snapshots", () => {
    const w = emptyWs(); const r = addRoom(w, { name: "A" });
    w.snapshots.push(snap(r.id, 1, 50), snap(r.id, 2, 52), snap(r.id, 3, 53), snap(r.id, 4, 54));
    expect(badges(w, []).find((b) => b.id === "leader")!.earned).toBe(false); expect(badges(w, []).find((b) => b.id === "consistent")!.earned).toBe(false);
    w.snapshots.push(snap(r.id, 20, 60), snap(r.id, 40, 62));
    expect(badges(w, []).find((b) => b.id === "leader")!.earned).toBe(true); expect(badges(w, []).find((b) => b.id === "consistent")!.earned).toBe(true);
  });
  it("goal progress is honest when evidence is thin or only reported", () => {
    const w = emptyWs(); const r = addRoom(w, { name: "A" }); const g = { id: "g", roomId: r.id, title: "t", kind: "score" as const, target: 80, createdAt: "" };
    expect(goalProgress(w, [], g).current).toBeNull();
    const a: any = { id: "a", answers: { q2_problems: [], q7_repeat: "never", f_clap: "short" }, measurements: [], room: null }; r.assessmentId = "a";
    const p = goalProgress(w, [a], { ...g, target: 50 }); expect(p.done).toBe(true); expect(p.note).toMatch(/reported answers only/);
  });
});
