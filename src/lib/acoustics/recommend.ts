import { Answers, budgetMax } from "./questionnaire";
import { Diagnosis } from "./diagnostic";
import { CATEGORY_SHORT, CategoryId, PRICE_DISCLAIMER, Tier, formatInr, formatRange } from "./types";

/**
 * Recommendation engine.
 * Principle: DIAGNOSE FIRST, RECOMMEND SECOND, SELL LAST.
 *   • Free / low-cost steps always come first.
 *   • The "best fit" tier is never chosen simply because it is the most expensive: premium is never
 *     auto-selected, low-confidence diagnoses default to the budget tier until they are confirmed, and the
 *     stated budget caps the choice.
 */
export interface ProductRow {
  id?: string;
  sku: string;
  name: string;
  solution_group: "equipment" | "room" | "software";
  problem_category: CategoryId;
  tier: Tier;
  description: string;
  price_min: number;
  price_max: number;
  currency: string;
  price_basis: string;
  advantages: string[];
  limitations: string[];
  suitability: { minOccupants?: number; maxOccupants?: number; environments?: string[] };
  maintenance: string | null;
  expected_improvement: string | null;
  complexity: "low" | "medium" | "high";
}

export interface RecItem {
  productId?: string;
  sku: string;
  title: string;
  group: ProductRow["solution_group"];
  tier: Tier;
  description: string;
  priceMin: number;
  priceMax: number;
  priceBasis: string;
  advantages: string[];
  limitations: string[];
  suitability: string;
  maintenance: string;
  expectedImprovement: string;
  complexity: "low" | "medium" | "high";
  fitNotes: string[];
}

export interface CategoryRecommendation {
  category: CategoryId;
  label: string;
  items: Record<Tier, RecItem | null>;
  alsoConsider: RecItem[];
  bestFit: Tier;
  whyBestFit: string[];
  /** 1 = strongest evidence. Fix the lowest rank first and re-test before spending on the rest. */
  rank: number;
  /** True when the budget only covers the higher-ranked fixes; this one waits until they are verified. */
  deferred: boolean;
}

export interface RecommendationSet {
  categories: CategoryRecommendation[];
  bestFitTotal: { min: number; max: number };
  budgetMax: number | null;
  withinBudget: boolean | null;
  costCategory: "low" | "moderate" | "high" | "none";
  roadmap: { phase: string; timeframe: string; actions: string[] }[];
  freeFirstSteps: string[];
  notRecommended: string[];
  priceDisclaimer: string;
}

const TIERS: Tier[] = ["budget", "recommended", "premium"];

function suitabilityScore(p: ProductRow, env: string, occupants: number | null): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];
  const s = p.suitability ?? {};
  if (s.environments?.length) {
    if (s.environments.includes(env)) {
      score += 3;
      notes.push("designed for this type of venue");
    } else score -= 5;
  }
  if (occupants !== null) {
    if (s.minOccupants !== undefined && occupants < s.minOccupants) {
      score -= 2;
      notes.push(`designed for at least ${s.minOccupants} people, so it may be more than a room of ${occupants} needs`);
    } else if (s.maxOccupants !== undefined && occupants > s.maxOccupants) {
      score -= 3;
      notes.push(`covers up to about ${s.maxOccupants} people, so it may be undersized for ${occupants}`);
    } else if (s.minOccupants !== undefined || s.maxOccupants !== undefined) {
      score += 2;
      notes.push(`suits about ${occupants} people`);
    }
  }
  return { score, notes };
}

const suitabilityText = (s: ProductRow["suitability"]) => {
  const parts: string[] = [];
  if (s?.minOccupants || s?.maxOccupants) parts.push(`${s.minOccupants ?? 1}–${s.maxOccupants ?? "any"} people`);
  if (s?.environments?.length) parts.push("large venues / halls");
  return parts.length ? parts.join("; ") : "Most spaces";
};

function toItem(p: ProductRow, notes: string[]): RecItem {
  return {
    productId: p.id,
    sku: p.sku,
    title: p.name,
    group: p.solution_group,
    tier: p.tier,
    description: p.description,
    priceMin: p.price_min,
    priceMax: p.price_max,
    priceBasis: p.price_basis,
    advantages: p.advantages,
    limitations: p.limitations,
    suitability: suitabilityText(p.suitability),
    maintenance: p.maintenance ?? "—",
    expectedImprovement: p.expected_improvement ?? "—",
    complexity: p.complexity,
    fitNotes: notes,
  };
}

export function recommend(d: Diagnosis, answers: Answers, catalogue: ProductRow[]): RecommendationSet {
  const env: string = answers.environment ?? "other";
  const occupants: number | null = typeof answers.q4_occupants === "number" ? answers.q4_occupants : null;
  const budget = budgetMax(answers);
  const cats = d.contributing.length ? d.contributing : [];
  const ordered = [...cats].sort((a, b) => d.scores[b] - d.scores[a]);

  const categories: CategoryRecommendation[] = ordered.map((category) => {
    const items = { budget: null, recommended: null, premium: null } as Record<Tier, RecItem | null>;
    const alsoConsider: RecItem[] = [];
    for (const tier of TIERS) {
      const candidates = catalogue
        .filter((p) => p.problem_category === category && p.tier === tier)
        .map((p) => ({ p, ...suitabilityScore(p, env, occupants) }))
        .filter((c) => c.score > -5)
        .sort((a, b) => b.score - a.score || a.p.price_min - b.p.price_min);
      if (!candidates.length) continue;
      items[tier] = toItem(candidates[0].p, candidates[0].notes);
      if (tier !== "premium") for (const extra of candidates.slice(1, 2)) if (extra.score >= 0) alsoConsider.push(toItem(extra.p, extra.notes));
    }
    return { category, label: CATEGORY_SHORT[category], items, alsoConsider, bestFit: "recommended", whyBestFit: [], rank: 0, deferred: false };
  });
  categories.forEach((c, i) => (c.rank = i + 1));

  // ── choose best-fit tier per category ──
  const lowConfidence = d.confidenceLevel === "low";
  const tierOrder: Tier[] = ["budget", "recommended"]; // premium is never auto-selected
  for (const c of categories) {
    const why: string[] = [];
    let tier: Tier = lowConfidence ? "budget" : "recommended";
    if (lowConfidence) why.push("The diagnosis is not yet confirmed, so the lowest-cost step is suggested first – confirm the cause before spending more.");
    if (!c.items[tier]) tier = tierOrder.find((t) => c.items[t]) ?? "budget";
    // Configuration-type problems: the free/cheap step is tried FIRST; spend only if it does not work.
    const first = c.items.budget;
    if (tier === "recommended" && first && first.priceMin === 0 && ["connectivity", "conference", "hybrid"].includes(c.category)) {
      tier = "budget";
      const up = c.items.recommended;
      why.push(
        `Try this first – it is configuration/process rather than purchase.${up ? ` If the fault persists, step up to: ${up.title} (${formatRange(up.priceMin, up.priceMax)}).` : ""}`
      );
    }
    c.bestFit = tier;
    c.whyBestFit = why;
  }

  // Fit the whole plan into the stated budget. Step 1: lower the least-important categories to the budget tier.
  // Step 2: if it still does not fit, defer the least-important categories to a second phase (never the top-ranked
  // one) and say so, instead of showing a plan the budget cannot pay for.
  const live = () => categories.filter((c) => !c.deferred);
  const total = () => live().reduce((s, c) => s + (c.items[c.bestFit]?.priceMin ?? 0), 0);
  if (budget !== null) {
    for (let i = categories.length - 1; i >= 0 && total() > budget; i--) {
      const c = categories[i];
      if (c.bestFit === "recommended" && c.items.budget) {
        c.bestFit = "budget";
        c.whyBestFit.push(`Stepped down to the budget option so the plan fits your budget (${formatInr(budget)}).`);
      }
    }
    for (let i = categories.length - 1; i >= 1 && total() > budget; i--) {
      const c = categories[i];
      if (c.items[c.bestFit]) {
        c.deferred = true;
        c.whyBestFit.push("Phase 2: left out of the total so that phase 1 fits your budget. Fix the higher-ranked cause first, repeat the assessment, and only then decide whether this is still needed.");
      }
    }
  }

  for (const c of categories) {
    const it = c.items[c.bestFit];
    if (!it) continue;
    if (c.bestFit === "recommended") c.whyBestFit.push("Best balance of effectiveness and cost for the diagnosed cause – the budget option may leave part of the problem unsolved, and the premium option is best costed only after an expert inspection.");
    if (it.fitNotes.length) c.whyBestFit.push(`Suitability: ${it.fitNotes.join("; ")}.`);
    if (budget !== null && !c.deferred && it.priceMax <= budget) c.whyBestFit.push(`Upper estimate (${formatInr(it.priceMax)}) is within the stated budget.`);
    if (budget !== null && !c.deferred && it.priceMin > budget) c.whyBestFit.push(`Even the lowest estimate (${formatInr(it.priceMin)}) is above the stated budget – phase the work or review the budget with a consultant.`);
  }

  // Why this order: show the evidence behind each category so the ranking is never a black box.
  const scoreSum = Object.values(d.scores).reduce((a, b) => a + b, 0) || 1;
  for (const c of categories) {
    const share = Math.round((d.scores[c.category] / scoreSum) * 100);
    const lead = `Evidence: score ${d.scores[c.category]} (${share}% of all evidence found).`;
    const order = categories.length < 2 ? "" : c.rank === 1 ? " Strongest cause: start here." : c.deferred ? "" : ` Ranked #${c.rank}: do this after #1 and repeat the assessment to see if it is still needed.`;
    c.whyBestFit.unshift(lead + order);
  }

  const min = live().reduce((s, c) => s + (c.items[c.bestFit]?.priceMin ?? 0), 0);
  const max = live().reduce((s, c) => s + (c.items[c.bestFit]?.priceMax ?? 0), 0);
  const costCategory = categories.length === 0 ? "none" : max <= 25_000 ? "low" : max <= 150_000 ? "moderate" : "high";

  const roadmap: RecommendationSet["roadmap"] = [
    { phase: "1. Free checks", timeframe: "Days 1–3 (indicative)", actions: d.freeFirstSteps.slice(0, 4) },
  ];
  if (d.expertInspection.needed) roadmap.push({ phase: "2. Expert confirmation", timeframe: "Week 1–2 (indicative)", actions: ["Book a consultation to confirm the cause", ...d.expertInspection.reasons.slice(0, 2)] });
  roadmap.push({
    phase: d.expertInspection.needed ? "3. Implement best-fit solution" : "2. Implement best-fit solution",
    timeframe: "Weeks 2–6 (indicative)",
    actions: live().map((c) => c.items[c.bestFit]).filter(Boolean).map((i) => `${i!.title} (${formatRange(i!.priceMin, i!.priceMax)} – ${i!.complexity} complexity)`),
  });
  const later = categories.filter((c) => c.deferred).map((c) => c.items[c.bestFit]).filter(Boolean);
  if (later.length) roadmap.push({ phase: "Later, only if still needed", timeframe: "After phase 1 is verified", actions: later.map((i) => `${i!.title} (${formatRange(i!.priceMin, i!.priceMax)})`) });
  roadmap.push({ phase: "Verify", timeframe: "After installation", actions: ["Repeat the SoundSense recording and compare relative SNR", "Ask remote participants to rate clarity", "Submit feedback so we can improve"] });

  return {
    categories,
    bestFitTotal: { min, max },
    budgetMax: budget,
    withinBudget: budget === null ? null : min <= budget,
    costCategory,
    roadmap,
    freeFirstSteps: d.freeFirstSteps,
    notRecommended: d.notRecommended,
    priceDisclaimer: PRICE_DISCLAIMER,
  };
}
