import { describe, expect, it } from "vitest";
import { applyObservation, classifyBand, clippingCandidate, DEFAULT_SCREENING, levelCandidate, screenLevel, severityRank } from "@/lib/acoustics/screening";
import type { LevelStats } from "@/lib/acoustics/measurement";

const stats = (leq: number): LevelStats => ({ n: 100, minDb: leq - 10, maxDb: leq + 10, leqDb: leq, l10Db: leq + 3, l50Db: leq, l90Db: leq - 5 });
const UNCAL = { status: "uncalibrated" as const };
const cal = (offset: number) => ({ status: "single_point" as const, offsetDb: offset });

describe("screening bands from the brief", () => {
  it.each([[30, "quiet"], [35, "acceptable"], [45, "acceptable"], [45.1, "caution"], [50, "caution"], [52, "high"], [55, "high"], [56, "priority"]])("%s dB → %s", (db, band) => {
    expect(classifyBand(db as number)).toBe(band);
  });
  it("is configurable", () => expect(classifyBand(48, { ...DEFAULT_SCREENING, bands: [30, 40, 45, 50] })).toBe("high"));
});

describe("honest levels", () => {
  it("an uncalibrated recording is only ever an estimate with a ±20 dB range", () => {
    const r = screenLevel(stats(-45), UNCAL);
    expect(r.basis).toBe("estimate");
    expect(r.value).toBe(55); expect(r.low).toBe(35); expect(r.high).toBe(75);
    expect(r.status).toMatch(/Uncalibrated estimate/);
  });
  it("an estimate is judged at the low end of its range, and can never be RED", () => {
    expect(screenLevel(stats(-45), UNCAL).severity).toBe("green"); // low end 35 dB → acceptable
    const loud = screenLevel(stats(-5), UNCAL); // estimate 95, low 75
    expect(loud.severity).toBe("orange");
    expect(loud.urgent).toBe(false);
  });
  it("a calibrated reading is judged at its value", () => {
    const r = screenLevel(stats(-50), cal(105)); // 55 dB
    expect(r.basis).toBe("calibrated"); expect(r.value).toBe(55); expect(r.severity).toBe("orange");
  });
  it("RED needs a calibrated reading at the configured urgent level; ordinary room noise never qualifies", () => {
    expect(screenLevel(stats(-10), cal(100)).severity).toBe("red"); // 90 dB calibrated
    expect(screenLevel(stats(-10), cal(100), { ...DEFAULT_SCREENING, urgent: { enabled: false, leqDb: 85 } }).severity).toBe("orange");
    expect(screenLevel(stats(-40), cal(100)).severity).toBe("orange"); // 60 dB: priority investigation, still not urgent
    expect(["green", "yellow", "orange"]).toContain(screenLevel(stats(-5), UNCAL).severity);
  });
});

describe("alert deduplication, cooldown and hysteresis", () => {
  const T0 = Date.parse("2026-11-18T10:00:00Z");
  const min = (m: number) => T0 + m * 60_000;
  const id = (() => { let n = 0; return () => `a${++n}`; })();
  const cand = (db: number) => levelCandidate(screenLevel(stats(db - 100), cal(100)), "Not yet identified");

  it("an unchanged condition makes one alert and one notification, however often it is observed", () => {
    let al: any[] = []; let notified = 0;
    for (let i = 0; i < 20; i++) { const r = applyObservation(al, "r1", "level", cand(52), min(i), DEFAULT_SCREENING, id); al = r.alerts; notified += r.events.filter((e) => e.notify).length; }
    expect(al.length).toBe(1); expect(notified).toBe(1); expect(al[0].count).toBe(20);
  });
  it("a worse condition escalates the same alert and notifies once more", () => {
    let r = applyObservation([], "r1", "level", cand(47), min(0), DEFAULT_SCREENING, id);
    expect(r.alerts[0].severity).toBe("yellow");
    r = applyObservation(r.alerts, "r1", "level", cand(53), min(1), DEFAULT_SCREENING, id);
    expect(r.alerts.length).toBe(1); expect(r.alerts[0].severity).toBe("orange"); expect(r.events[0]).toMatchObject({ type: "escalated", notify: true });
  });
  it("does not flap: it clears only after dropping below the band edge minus the hysteresis", () => {
    let r = applyObservation([], "r1", "level", cand(47), min(0), DEFAULT_SCREENING, id); // yellow, clears below 43
    r = applyObservation(r.alerts, "r1", "level", cand(44.5), min(1), DEFAULT_SCREENING, id);
    expect(r.alerts[0].status).toBe("open");
    r = applyObservation(r.alerts, "r1", "level", cand(42), min(2), DEFAULT_SCREENING, id);
    expect(r.alerts[0].status).toBe("resolved"); expect(r.alerts[0].resolvedBy).toBe("auto");
  });
  it("a condition that returns inside the cooldown re-opens the old alert silently", () => {
    let r = applyObservation([], "r1", "level", cand(47), min(0), DEFAULT_SCREENING, id);
    r = applyObservation(r.alerts, "r1", "level", cand(40), min(1), DEFAULT_SCREENING, id);
    r = applyObservation(r.alerts, "r1", "level", cand(48), min(3), DEFAULT_SCREENING, id);
    expect(r.alerts.length).toBe(1); expect(r.events[0]).toMatchObject({ type: "reopened", notify: false });
    r = applyObservation(r.alerts, "r1", "level", cand(40), min(4), DEFAULT_SCREENING, id);
    r = applyObservation(r.alerts, "r1", "level", cand(48), min(30), DEFAULT_SCREENING, id);
    expect(r.alerts.length).toBe(2); expect(r.events[0]).toMatchObject({ type: "created", notify: true });
  });
  it("an acknowledged alert stays quiet until it gets worse", () => {
    let r = applyObservation([], "r1", "level", cand(47), min(0), DEFAULT_SCREENING, id);
    r.alerts[0].status = "acknowledged";
    r = applyObservation(r.alerts, "r1", "level", cand(48), min(1), DEFAULT_SCREENING, id);
    expect(r.events.length).toBe(0); expect(r.alerts[0].status).toBe("acknowledged");
    r = applyObservation(r.alerts, "r1", "level", cand(52), min(2), DEFAULT_SCREENING, id);
    expect(r.alerts[0].status).toBe("open"); expect(r.events[0].type).toBe("escalated");
  });
  it("alerts for different rooms or different conditions are independent", () => {
    let r = applyObservation([], "r1", "level", cand(47), min(0), DEFAULT_SCREENING, id);
    r = applyObservation(r.alerts, "r2", "level", cand(47), min(0), DEFAULT_SCREENING, id);
    r = applyObservation(r.alerts, "r1", "clipping", clippingCandidate(true), min(0), DEFAULT_SCREENING, id);
    expect(r.alerts.length).toBe(3);
  });
  it("every alert carries the fields the brief requires", () => {
    const a = applyObservation([], "r1", "level", cand(53), min(0), DEFAULT_SCREENING, id).alerts[0];
    for (const f of ["title", "reading", "basis", "severity", "createdAt", "source", "explanation", "action", "reassess", "escalation"] as const) expect(String(a[f]).length).toBeGreaterThan(0);
    expect(severityRank(a.severity)).toBeGreaterThan(0);
  });
});
