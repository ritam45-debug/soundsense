import { describe, expect, it } from "vitest";
import { computeHealth, configFor, healthDelta, scoreBand } from "@/lib/acoustics/health";

describe("acoustic health score", () => {
  it("says 'Insufficient data' instead of inventing a number when evidence is thin", () => {
    const r = computeHealth({});
    expect(r.status).toBe("insufficient"); expect(r.overall).toBeNull(); expect(r.missing.length).toBe(5);
    const one = computeHealth({ ambient: { splDb: 40, calibrated: false } });
    expect(one.status).toBe("insufficient");
  });
  it("never scores an unavailable category (it is left out and the weight is redistributed)", () => {
    const r = computeHealth({ ambient: { splDb: 40, calibrated: true }, rt60Ratio: 1.0 });
    expect(r.status).toBe("ok");
    expect(r.categories.find((c) => c.id === "intelligibility")!.score).toBeNull();
    expect(r.categories.find((c) => c.id === "intelligibility")!.basis).toBe("unavailable");
    expect(r.overall).toBe(Math.round((curveAt40() * 0.25 + 100 * 0.2) / 0.45));
  });
  it("labels the evidence behind each category", () => {
    const r = computeHealth({ ambient: { splDb: 52, calibrated: false }, rt60Ratio: 1.8, problems: ["echo"], snrDb: 12 });
    const b = Object.fromEntries(r.categories.map((c) => [c.id, c.basis]));
    expect(b.noise).toBe("estimated"); expect(b.reverb).toBe("calculated"); expect(b.intelligibility).toBe("estimated"); expect(b.reported).toBe("reported");
    expect(computeHealth({ problems: ["echo"], clap: "lingers", repeats: "often" }).grade).toBe("reported_only");
    expect(r.grade).toBe("includes_measurements");
  });
  it("explains every deduction and sorts the biggest first; opportunities add up to real gains", () => {
    const r = computeHealth({ ambient: { splDb: 58, calibrated: true }, rt60Ratio: 2.5, snrDb: 6, problems: ["echo", "background_noise"] });
    expect(r.deductions.length).toBeGreaterThan(0);
    for (let i = 1; i < r.deductions.length; i++) expect(r.deductions[i - 1].points).toBeGreaterThanOrEqual(r.deductions[i].points);
    const lost = 100 - r.overall!;
    const sum = r.deductions.filter((d) => ["noise", "reverb", "intelligibility", "reported"].includes(d.category)).reduce((s, d) => s + d.points, 0);
    expect(Math.abs(sum - lost)).toBeLessThan(2.5);
    expect(r.opportunities[0].gain).toBeGreaterThan(0);
  });
  it("is monotone: worse readings never score better", () => {
    const at = (spl: number) => computeHealth({ ambient: { splDb: spl, calibrated: true }, rt60Ratio: 1.1 }).overall!;
    expect(at(35)).toBeGreaterThanOrEqual(at(45)); expect(at(45)).toBeGreaterThan(at(55)); expect(at(55)).toBeGreaterThan(at(70));
    const rt = (x: number) => computeHealth({ ambient: { splDb: 40, calibrated: true }, rt60Ratio: x }).overall!;
    expect(rt(1)).toBeGreaterThan(rt(1.5)); expect(rt(1.5)).toBeGreaterThan(rt(2.5));
  });
  it("weights are configurable and have room-type presets", () => {
    const input = { ambient: { splDb: 60, calibrated: true }, rt60Ratio: 1.0 } as const;
    const studio = computeHealth(input, configFor("studio")).overall!;
    const hall = computeHealth(input, configFor("auditorium")).overall!;
    expect(studio).toBeLessThan(hall); // noise matters more in a studio
    const custom = computeHealth(input, configFor("studio", { noise: 0, reverb: 1 })).overall!;
    expect(custom).toBe(100);
  });
  it("readiness faults lower the equipment score and flag feedback", () => {
    const r = computeHealth({ problems: [], repeats: "never", equipment: ["laptop_mic"], occupants: 10, readiness: { micFound: true, clipping: true, feedback: true } });
    const e = r.categories.find((c) => c.id === "equipment")!;
    expect(e.score).toBeLessThan(60); expect(e.deductions.map((d) => d.text).join(" ")).toMatch(/feedback/);
  });
  it("compares with a previous assessment and bands the score", () => {
    const a = computeHealth({ ambient: { splDb: 58, calibrated: true }, rt60Ratio: 2 }); const b = computeHealth({ ambient: { splDb: 44, calibrated: true }, rt60Ratio: 1.1 });
    expect(healthDelta(a, b)).toBeGreaterThan(0); expect(healthDelta(null, b)).toBeNull();
    expect(scoreBand(null)).toBe("Insufficient data"); expect(scoreBand(85)).toBe("Healthy"); expect(scoreBand(30)).toBe("Poor");
  });
});
function curveAt40() { return 85 + (100 - 85) * (45 - 40) / (45 - 35); } // between 35→100 and 45→85
