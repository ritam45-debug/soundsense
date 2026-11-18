import { describe, expect, it } from "vitest";
import { ACTIONS, detectIssues, planMitigation, needsProfessional } from "@/lib/acoustics/mitigation";
import { computeHealth } from "@/lib/acoustics/health";

describe("mitigation engine", () => {
  it("never invents prices: every cost is 'free' or 'needs local quote', and free means level 1", () => {
    for (const a of ACTIONS) { expect(["free", "needs local quote"]).toContain(a.cost); expect(a.action).not.toMatch(/[$₹€£]\s?\d|\d\s?(USD|INR|Rs)/i); if (a.level === 1) expect(a.cost).toBe("free"); else expect(a.cost).toBe("needs local quote"); }
  });
  it("every action states problem, benefit, difficulty and limitations", () => {
    for (const a of ACTIONS) for (const k of ["problem", "action", "benefit", "difficulty", "limitations"] as const) expect(a[k].length).toBeGreaterThan(3);
  });
  it("detects issues from evidence and ranks the heaviest first", () => {
    const input = { ambient: { splDb: 62, calibrated: false }, rt60Ratio: 1.4, problems: ["feedback"], equipment: ["laptop_mic"], occupants: 10 };
    const d = detectIssues(input, computeHealth(input));
    expect(d.map((x) => x.issue)).toEqual(expect.arrayContaining(["noise", "reverb", "feedback", "coverage"]));
    for (let i = 1; i < d.length; i++) expect(d[i - 1].weight).toBeGreaterThanOrEqual(d[i].weight);
    expect(d.find((x) => x.issue === "noise")!.why).toMatch(/uncalibrated/);
  });
  it("finds nothing for a healthy room", () => {
    expect(detectIssues({ ambient: { splDb: 38, calibrated: true }, rt60Ratio: 1.0, snrDb: 28, problems: [] })).toEqual([]);
  });
  it("puts free steps first and tracks completion", () => {
    const d = detectIssues({ ambient: { splDb: 58, calibrated: true }, rt60Ratio: 1.8 });
    const plan = planMitigation(d);
    expect(plan[0].level).toBe(1); expect(plan[0].priority).toBe("do first");
    const done = planMitigation(d, { [plan[0].id]: "2026-11-18" });
    expect(done.find((a) => a.id === plan[0].id)!.done).toBe(true);
    expect(done[done.length - 1].done).toBe(true); // completed items sink to the bottom
  });
  it("recommends professional help only for heavy issues or once cheaper steps are done", () => {
    const light = planMitigation(detectIssues({ ambient: { splDb: 47, calibrated: true } }));
    expect(needsProfessional(light)).toBe(false);
    const heavy = planMitigation(detectIssues({ ambient: { splDb: 70, calibrated: true }, rt60Ratio: 2.8 }));
    expect(needsProfessional(heavy)).toBe(true);
    const allDone = Object.fromEntries(ACTIONS.filter((a) => a.level < 3).map((a) => [a.id, "x"]));
    expect(needsProfessional(planMitigation(detectIssues({ ambient: { splDb: 47, calibrated: true } }), allDone))).toBe(true);
  });
  it("feedback and missing mic from the readiness check produce actions", () => {
    const d = detectIssues({ readiness: { micFound: false, feedback: true } });
    expect(d.map((x) => x.issue)).toEqual(expect.arrayContaining(["connection", "feedback"]));
  });
});
