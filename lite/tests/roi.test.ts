import { describe, expect, it } from "vitest";
import { roi } from "@/lib/acoustics/roi";
const base = { people: 6, hourlyCost: 1000, meetingsPerWeek: 10, minutesLostPerMeeting: 5, reductionPct: 50, investment: 100000, yearlyUpkeep: 0 };
describe("ROI calculator", () => {
  it("computes lost time cost from the inputs only", () => { expect(roi(base).yearlyLostCost).toBe(Math.round(6 * 1000 * (5 / 60) * 10 * 46)); });
  it("gives cautious / as entered / optimistic scenarios in order, with payback", () => {
    const r = roi(base); expect(r.scenarios.map((s) => s.name)).toEqual(["Cautious", "As entered", "Optimistic"]);
    expect(r.scenarios[0].yearlySaving).toBeLessThan(r.scenarios[1].yearlySaving); expect(r.scenarios[1].yearlySaving).toBeLessThan(r.scenarios[2].yearlySaving);
    expect(r.scenarios[1].paybackMonths).toBeCloseTo((100000 / r.scenarios[1].yearlyNet) * 12, 0); expect(r.scenarios[1].threeYearNet).toBe(r.scenarios[1].yearlyNet * 3 - 100000);
  });
  it("reports no payback when savings do not cover upkeep, and caps optimistic at 100 %", () => {
    expect(roi({ ...base, yearlyUpkeep: 1e9 }).scenarios[1].paybackMonths).toBeNull(); expect(roi({ ...base, reductionPct: 90 }).scenarios[2].reductionPct).toBe(100);
  });
  it("rejects invalid input instead of dividing by zero", () => {
    expect(roi({ ...base, people: 0 }).valid).toBe(false); expect(roi({ ...base, reductionPct: 120 }).valid).toBe(false); expect(roi({ ...base, hourlyCost: NaN }).problems.length).toBeGreaterThan(0);
    expect(roi({ ...base, minutesLostPerMeeting: 0 }).scenarios[1].paybackMonths).toBeNull();
  });
  it("states that results are assumptions, not guarantees", () => { expect(roi(base).assumptions.join(" ")).toMatch(/not a guarantee/); });
});
