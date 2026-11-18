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

function run(overrides: Record<string, any>, base = "A", meas?: any[], priceScale = 1) {
  const s = SCENARIOS[base];
  const answers = { ...s.answers, ...overrides };
  const v = validateAnswers(answers, true);
  expect(v.errors).toEqual({});
  const room = s.room ? analyseRoom({ ...s.room, occupants: answers.q4_occupants ?? s.room.occupants }, answers.environment) : null;
  const d = diagnose(buildFacts(v.clean, room, meas));
  const cat = priceScale === 1 ? catalogue : catalogue.map((c) => ({ ...c, price_min: c.price_min * priceScale, price_max: c.price_max * priceScale }));
  return { d, r: recommend(d, v.clean, cat as any) };
}
const stats = (leqDb: number, maxDb: number) => ({ n: 100, minDb: -90, maxDb, leqDb, l10Db: leqDb + 3, l50Db: leqDb - 3, l90Db: leqDb - 15 });
const fired = (d: any, id: string) => d.explanation.some((e: any) => e.id === id);

describe("triggers: echo and feedback respect how the space is used", () => {
  it("echo in an in-person-only room does not implicate the conferencing system", () => {
    const { d } = run({ q5_mode: "offline", q6_remote: "no", f_echo_remote: undefined });
    expect(fired(d, "R-CONF-ECHO-ONLINE")).toBe(false);
    expect(d.scores.conference).toBeLessThanOrEqual(0.5);
    expect(d.primary).toBe("room");
  });
  it("the same echo in a hybrid meeting still counts toward the conferencing set-up", () => {
    const { d } = run({ q5_mode: "both", q6_remote: "yes" });
    expect(fired(d, "R-CONF-ECHO-ONLINE")).toBe(true);
    expect(d.scores.conference).toBeGreaterThan(0);
  });
  it("feedback in a venue with no remote participants is a speaker/room matter, not conferencing", () => {
    const { d } = run({ q5_mode: "offline", q6_remote: "no", q2_problems: ["feedback"], f_echo_remote: undefined, f_clap: undefined });
    expect(fired(d, "R-CONF-FEEDBACK-ONLINE")).toBe(false);
    expect(d.scores.speaker).toBeGreaterThan(d.scores.conference);
  });
});

describe("triggers: measured and calculated evidence", () => {
  it("an overloaded speech recording points at microphone gain/distance and is labelled measured", () => {
    const { d } = run({ q2_problems: ["distorted_speech"], f_echo_remote: undefined, f_clap: undefined }, "A", [{ kind: "speech", stats: stats(-18, -1) }]);
    const rule = d.explanation.find((e) => e.id === "R-MIC-CLIP");
    expect(rule?.basis).toBe("measured");
    expect(d.scores.microphone).toBeGreaterThan(0);
  });
  it("a very quiet speech recording is flagged, and a healthy one is not", () => {
    const quiet = run({ q2_problems: ["poor_mic_pickup"], f_echo_remote: undefined, f_clap: undefined }, "A", [{ kind: "speech", stats: stats(-58, -30) }]);
    expect(fired(quiet.d, "R-MIC-LOW-LEVEL")).toBe(true);
    const ok = run({ q2_problems: ["poor_mic_pickup"], f_echo_remote: undefined, f_clap: undefined }, "A", [{ kind: "speech", stats: stats(-30, -12) }]);
    expect(fired(ok.d, "R-MIC-LOW-LEVEL")).toBe(false);
    expect(fired(ok.d, "R-MIC-CLIP")).toBe(false);
  });
  it("the severe-RT60 rule fires exactly when the estimate is more than 2× the target", () => {
    for (const id of Object.keys(SCENARIOS)) {
      const sc = SCENARIOS[id];
      const { d } = run({}, id);
      const ratio = sc.room ? analyseRoom(sc.room, sc.answers.environment).ratio : 0;
      expect(fired(d, "R-ROOM-RT60-SEVERE")).toBe(ratio > 2);
    }
  });
  it("budget is not counted as missing diagnostic data", () => {
    for (const id of Object.keys(SCENARIOS)) expect(run({}, id).d.dataQuality.missing.join(" ")).not.toMatch(/budget/i);
  });
});

describe("not-recommended list follows the evidence", () => {
  it("rules out purchases the evidence does not support", () => {
    const { d } = run({}, "B");
    expect(d.notRecommended.join(" ")).toMatch(/acoustic treatment|panels/i);
    expect(new Set(d.notRecommended).size).toBe(d.notRecommended.length);
  });
});

describe("recommendations: ranking, phasing and fit", () => {
  it("every category carries its evidence and a rank; the strongest cause is told to start first", () => {
    const { r } = run({}, "F");
    expect(r.categories.map((c) => c.rank)).toEqual(r.categories.map((_, i) => i + 1));
    expect(r.categories[0].whyBestFit[0]).toMatch(/^Evidence: score/);
    if (r.categories.length > 1) expect(r.categories[0].whyBestFit[0]).toMatch(/start here/i);
  });
  it("a budget too small for every fix defers the lower-ranked ones and keeps the total honest", () => {
    const { r } = run({ q13_budget: "under_25k" }, "F", undefined, 3); // prices x3 so the two fixes cannot both fit in ₹25,000
    expect(r.categories.length).toBeGreaterThan(1);
    expect(r.categories[0].deferred).toBe(false);
    expect(r.categories.some((c) => c.deferred)).toBe(true);
    const live = r.categories.filter((c) => !c.deferred);
    expect(r.bestFitTotal.min).toBe(live.reduce((s, c) => s + (c.items[c.bestFit]?.priceMin ?? 0), 0));
    r.categories.filter((c) => c.deferred).forEach((c) => expect(c.whyBestFit.join(" ")).toMatch(/Phase 2/));
    expect(r.roadmap.some((p) => /Later/.test(p.phase))).toBe(true);
  });
  it("with a generous budget nothing is deferred", () => {
    const { r } = run({ q13_budget: "above_15l" }, "F");
    expect(r.categories.every((c) => !c.deferred)).toBe(true);
  });
  it("premium is still never auto-selected", () => {
    for (const id of Object.keys(SCENARIOS)) expect(run({}, id).r.categories.every((c) => c.bestFit !== "premium")).toBe(true);
  });
});
