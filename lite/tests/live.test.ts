import { describe, expect, it } from "vitest";
import { evaluateLive, sourceText } from "@/lib/workspace/live";
import { emptyWs } from "@/lib/workspace/store";
const stats = (leq: number) => ({ n: 300, minDb: leq - 5, maxDb: leq + 5, leqDb: leq, l10Db: leq + 3, l50Db: leq, l90Db: leq - 3 });
const noFb = { active: false, hz: null, persistenceS: 0, growing: false };
describe("live evaluation", () => {
  it("raises no level alert before enough data", () => {
    const w = emptyWs(); evaluateLive(w, null, { stats: null, clipping: false, feedback: noFb, fingerprint: null }, { status: "uncalibrated" });
    expect(w.alerts).toHaveLength(0);
  });
  it("uncalibrated loud room: alert never red and labelled as an estimate", () => {
    const w = emptyWs(); const { reading } = evaluateLive(w, null, { stats: stats(-20), clipping: false, feedback: noFb, fingerprint: null }, { status: "uncalibrated" });
    expect(reading!.basis).toBe("estimate"); expect(w.alerts.every((a) => a.severity !== "red")).toBe(true);
    expect(w.alerts[0].reading).toMatch(/uncalibrated estimate/); expect(w.alerts[0].source).toMatch(/not identified/);
  });
  it("calibrated high level above the urgent setting is red; below is not", () => {
    const cal = { status: "single_point" as const, offsetDb: 100, referenceDb: 94, referenceInstrument: "meter" };
    const w = emptyWs(); evaluateLive(w, null, { stats: stats(-10), clipping: false, feedback: noFb, fingerprint: null }, cal);
    expect(w.alerts.find((a) => a.key === "level")!.severity).toBe("red");
    const w2 = emptyWs(); evaluateLive(w2, null, { stats: stats(-45), clipping: false, feedback: noFb, fingerprint: null }, cal);
    expect(w2.alerts.find((a) => a.key === "level")!.severity).not.toBe("red");
  });
  it("feedback and clipping raise their own alerts and clear when gone", () => {
    const w = emptyWs(); const t0 = Date.now();
    evaluateLive(w, "r", { stats: null, clipping: true, feedback: { active: true, hz: 2500, persistenceS: 4, growing: true }, fingerprint: null }, { status: "uncalibrated" }, t0);
    expect(w.alerts.map((a) => a.key).sort()).toEqual(["clipping", "feedback"]);
    evaluateLive(w, "r", { stats: null, clipping: false, feedback: noFb, fingerprint: null }, { status: "uncalibrated" }, t0 + 1000);
    expect(w.alerts.every((a) => a.status === "resolved")).toBe(true);
  });
  it("source text is honest about low confidence", () => {
    expect(sourceText(null)).toMatch(/not identified/);
    expect(sourceText({ status: "ok", top: { id: "fan", label: "x", score: 1, confidence: 0.5, band: "medium", evidence: [] }, alternatives: [], caveats: [], features: null })).toMatch(/Possibly fan.*medium confidence, heuristic/);
    expect(sourceText({ status: "ok", top: { id: "fan", label: "x", score: 1, confidence: 0.3, band: "low", evidence: [] }, alternatives: [], caveats: [], features: null })).toMatch(/not identified/);
  });
});
