import { describe, expect, it } from "vitest";
import { SCENARIOS } from "./fixtures";
import { buildFacts, diagnose } from "@/lib/acoustics/diagnostic";
import { analyseRoom } from "@/lib/acoustics/room";
import { recommend } from "@/lib/acoustics/recommend";
import { SEED_PRODUCTS } from "@/lib/acoustics/catalogue";
import { validateAnswers } from "@/lib/acoustics/questionnaire";

const catalogue = SEED_PRODUCTS.map((p) => ({
  sku: p.sku, name: p.name, solution_group: p.group, problem_category: p.category, tier: p.tier, description: p.description,
  price_min: p.min, price_max: p.max, currency: "INR", price_basis: "indicative_estimate", advantages: p.advantages,
  limitations: p.limitations, suitability: p.suitability, maintenance: p.maintenance, expected_improvement: p.improvement, complexity: p.complexity,
}));

function run(id: string) {
  const s = SCENARIOS[id];
  const v = validateAnswers(s.answers, true);
  expect(v.errors).toEqual({});
  const room = s.room ? analyseRoom(s.room, s.answers.environment) : null;
  const d = diagnose(buildFacts(v.clean, room));
  const r = recommend(d, v.clean, catalogue as any);
  return { d, r, room };
}

describe("diagnostic scenarios A–F", () => {
  it("A: large glass room with echo → room acoustics, expert inspection, panels not microphones", () => {
    const { d, r, room } = run("A");
    expect(room!.risk).not.toBe("low");
    expect(d.primary).toBe("room");
    expect(d.expertInspection.needed).toBe(true);
    expect(d.confirmedObservations.some((o) => o.basis === "calculated")).toBe(true);
    expect(r.categories[0].category).toBe("room");
    expect(r.categories[0].items.recommended?.sku).toBe("ROOM-R-PANELS");
  });

  it("B: open office noise → background noise, headset-level budget solution", () => {
    const { d, r } = run("B");
    expect(d.primary).toBe("noise");
    expect(r.categories[0].category).toBe("noise");
    expect(r.categories[0].bestFit).toBe("budget"); // budget under ₹25k
    expect(r.categories[0].items.budget?.sku).toBe("NOISE-B-HEADSET");
    expect(r.bestFitTotal.min).toBeLessThanOrEqual(25_000);
  });

  it("C: low mic pickup → microphone problem, not room", () => {
    const { d, r } = run("C");
    expect(d.primary).toBe("microphone");
    expect(d.scores.microphone).toBeGreaterThan(d.scores.room);
    expect(r.categories[0].category).toBe("microphone");
  });

  it("D: hybrid overlap + remote echo → hybrid and conference system interact", () => {
    const { d, r } = run("D");
    expect(["hybrid", "multiple"]).toContain(d.primary);
    expect(d.contributing).toEqual(expect.arrayContaining(["hybrid", "conference"]));
    expect(d.scores.room).toBeLessThan(d.scores.hybrid);
    // configuration first: free/cheap steps are the best fit, with the upgrade path named
    expect(r.categories.every((c) => c.bestFit === "budget")).toBe(true);
    expect(r.categories[0].whyBestFit.join(" ")).toMatch(/step up to/);
  });

  it("E: Bluetooth fault → connectivity; never recommends acoustic panels or room items", () => {
    const { d, r } = run("E");
    expect(d.primary).toBe("connectivity");
    expect(r.categories.every((c) => c.category === "connectivity")).toBe(true);
    const skus = r.categories.flatMap((c) => Object.values(c.items)).filter(Boolean).map((i) => i!.sku);
    expect(skus.some((s) => s.startsWith("ROOM"))).toBe(false);
    expect(d.notRecommended.join(" ")).toMatch(/panels/i);
    expect(r.costCategory).toBe("low");
    expect(r.categories[0].items[r.categories[0].bestFit]?.sku).toBe("CONN-B-FIX");
  });

  it("F: temple PA → speaker + room interact, expert survey, PA-specific products", () => {
    const { d, r } = run("F");
    expect(d.contributing).toEqual(expect.arrayContaining(["speaker", "room"]));
    expect(d.expertInspection.needed).toBe(true);
    const skus = r.categories.flatMap((c) => Object.values(c.items)).filter(Boolean).map((i) => i!.sku);
    expect(skus).toEqual(expect.arrayContaining(["SPK-R-PA-COLUMN"]));
    expect(skus).not.toContain("SPK-R-BAR");
  });

  it("confidence is capped without measurements (self-reported evidence never reads as 'high')", () => {
    for (const id of Object.keys(SCENARIOS)) {
      const { d } = run(id);
      expect(d.confidence).toBeLessThanOrEqual(d.confirmedObservations.some((o) => o.basis === "calculated") ? 0.74 : 0.68);
      expect(d.confidenceLevel).not.toBe("high");
    }
  });

  it("a real measurement can raise confidence above the self-report ceiling", () => {
    const s = SCENARIOS.B;
    const v = validateAnswers(s.answers, true);
    const mk = (leq: number) => ({ n: 100, minDb: leq - 5, maxDb: leq + 5, leqDb: leq, l10Db: leq + 3, l50Db: leq, l90Db: leq - 3 });
    const d = diagnose(buildFacts(v.clean, null, [{ kind: "ambient", stats: mk(-30) }, { kind: "speech", stats: mk(-25) }]));
    expect(d.confirmedObservations.some((o) => o.basis === "measured")).toBe(true);
    expect(d.confidence).toBeGreaterThan(0.68);
  });

  it("engine is transparent and never claims certainty", () => {
    for (const id of Object.keys(SCENARIOS)) {
      const { d } = run(id);
      expect(d.explanation.length).toBeGreaterThan(0);
      expect(d.confidence).toBeLessThanOrEqual(0.92);
      expect(d.rootCauses.every((c) => ["possible", "likely"].includes(c.status))).toBe(true);
      expect(d.caveat).toMatch(/not a certified/i);
    }
  });

  it("premium tier is never auto-selected as best fit", () => {
    for (const id of Object.keys(SCENARIOS)) {
      const { r } = run(id);
      expect(r.categories.every((c) => c.bestFit !== "premium")).toBe(true);
    }
  });

  it("low-information input yields low confidence and no invented diagnosis", () => {
    const v = validateAnswers({ environment: "other", q2_problems: ["echo"] }, false);
    const d = diagnose(buildFacts(v.clean, null));
    expect(d.confidenceLevel).toBe("low");
    expect(d.expertInspection.needed).toBe(true);
  });
});
