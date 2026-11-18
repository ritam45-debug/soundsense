import { beforeEach, describe, expect, it } from "vitest";
import { addRoom, clearWs, emptyWs, loadWs, normalise, removeRoom, updateWs, resetWsCache, parseWorkspaceBackup } from "@/lib/workspace/store";
import { acknowledge, addReading, completeSchedule, dueSchedules, escalationMessage, observe, openAlerts, resolveAlert, unreadCount } from "@/lib/workspace/ops";
import { levelCandidate, screenLevel } from "@/lib/acoustics/screening";

const cand = (leq: number) => levelCandidate(screenLevel({ leq, p95: leq, max: leq } as any, { mode: "uncalibrated" } as any), "test");

describe("workspace store and operations", () => {
  beforeEach(() => { resetWsCache(); clearWs(); });
  it("round-trips rooms and survives partial or old data", () => {
    updateWs((w) => { addRoom(w, { name: "Board room", building: "HQ", floor: "3" }); return w; });
    resetWsCache();
    expect(loadWs().rooms[0].name).toBe("Board room");
    const n = normalise({ v: 1, rooms: [{ id: "x", name: "R" }] });
    expect(n.settings.screening.bands).toHaveLength(4); expect(n.alerts).toEqual([]);
    expect(normalise({ v: 99 })).toEqual(emptyWs());
    expect(normalise("junk")).toEqual(emptyWs());
  });
  it("deleting a room removes everything tied to it", () => {
    const w = emptyWs(); const r = addRoom(w, { name: "A" });
    observe(w, r.id, "level", cand(60)); addReading(w, { roomId: r.id, source: "live", basis: "estimate", value: 60, label: "x" });
    w.mitigationDone[r.id] = { n1: "d" }; removeRoom(w, r.id);
    expect(w.rooms).toHaveLength(0); expect(w.alerts).toHaveLength(0); expect(w.readings).toHaveLength(0); expect(w.notifications).toHaveLength(0); expect(w.mitigationDone[r.id]).toBeUndefined();
  });
  it("creates one notification per new alert (deduplicated) and records history", () => {
    const w = emptyWs(); const r = addRoom(w, { name: "A" });
    for (let i = 0; i < 5; i++) observe(w, r.id, "level", cand(80), 1000 + i);
    expect(w.alerts).toHaveLength(1); expect(w.notifications).toHaveLength(1); expect(w.alerts[0].count).toBe(5);
    expect(unreadCount(w)).toBe(1); expect(w.audit.some((a) => /Alert created/.test(a.text))).toBe(true);
  });
  it("respects the in-app notification preference", () => {
    const w = emptyWs(); w.settings.notify.inApp = false; observe(w, null, "level", cand(80));
    expect(w.alerts).toHaveLength(1); expect(w.notifications).toHaveLength(0);
  });
  it("acknowledge and resolve change state and are audited", () => {
    const w = emptyWs(); observe(w, null, "level", cand(80));
    const id = w.alerts[0].id; acknowledge(w, id); expect(w.alerts[0].status).toBe("acknowledged"); expect(openAlerts(w)).toHaveLength(1);
    resolveAlert(w, id); expect(w.alerts[0].status).toBe("resolved"); expect(openAlerts(w)).toHaveLength(0);
    expect(w.audit.map((a) => a.text).join("|")).toMatch(/acknowledged.*\|?|resolved by user/);
  });
  it("builds a copyable escalation message containing the evidence basis and caveat, without sending anything", () => {
    const w = emptyWs(); const r = addRoom(w, { name: "Hall 2", building: "North" }); observe(w, r.id, "level", cand(80));
    const m = escalationMessage(w, w.alerts[0].id)!;
    expect(m.subject).toMatch(/Hall 2/); expect(m.body).toMatch(/Evidence basis/); expect(m.body).toMatch(/not a hearing-safety measurement/i);
    expect(escalationMessage(w, "nope")).toBeNull();
  });
  it("schedules come due and roll forward", () => {
    const w = emptyWs(); const r = addRoom(w, { name: "A" });
    w.schedules.push({ id: "s", roomId: r.id, everyDays: 30, nextDue: new Date(Date.now() - 1000).toISOString(), note: "" });
    expect(dueSchedules(w)).toHaveLength(1); completeSchedule(w, "s"); expect(dueSchedules(w)).toHaveLength(0);
    expect(Date.parse(w.schedules[0].nextDue)).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  });
  it("backup extraction ignores files without a workspace", () => {
    expect(parseWorkspaceBackup({ data: {} })).toBeNull();
    expect(parseWorkspaceBackup({ workspace: emptyWs() })).not.toBeNull();
  });
});
