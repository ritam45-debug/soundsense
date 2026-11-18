import { SEED_PRODUCTS } from "../acoustics/catalogue";
import { analyseRoom } from "../acoustics/room";
import { buildFacts, diagnose } from "../acoustics/diagnostic";
import { ProductRow, recommend } from "../acoustics/recommend";
import { summarise } from "../acoustics/summary";
import { relativeSnr, LevelStats } from "../acoustics/measurement";
import { Answers } from "../acoustics/questionnaire";
import { newId, LocalAssessment } from "./store";
import { REPORT_LIMITATIONS, ReportPayload } from "../report/payload";

/** The catalogue is bundled with the app. Prices are the team's indicative estimates, not vendor quotes. */
export const PRODUCTS: ProductRow[] = SEED_PRODUCTS.map((p) => ({
  id: p.sku, sku: p.sku, name: p.name, solution_group: p.group, problem_category: p.category, tier: p.tier, description: p.description,
  price_min: p.min, price_max: p.max, currency: "INR", price_basis: "indicative_estimate", advantages: p.advantages, limitations: p.limitations,
  suitability: p.suitability, maintenance: p.maintenance, expected_improvement: p.improvement, complexity: p.complexity,
}));

export const roomOf = (a: LocalAssessment) => (a.room ? analyseRoom({ ...a.room } as any, a.answers.environment ?? "other") : null);

/** Diagnosis + recommendations, same engines as the full platform. */
export function runAnalysis(a: LocalAssessment) {
  const answers: Answers = a.answers ?? {};
  const room = roomOf(a);
  const facts = buildFacts(answers, room, a.measurements.map((m) => ({ kind: m.kind, stats: m.stats as LevelStats, calibrated: m.calibration?.status === "single_point" })));
  const diagnosis = diagnose(facts);
  const plan = recommend(diagnosis, answers, PRODUCTS);
  const diagnosticId = newId();
  a.diagnostic = { id: diagnosticId, createdAt: new Date().toISOString(), diagnosis, plan, room };
  a.recommendations = [];
  for (const c of plan.categories) {
    for (const tier of ["budget", "recommended", "premium"] as const) {
      const it = (c.items as any)[tier];
      if (!it) continue;
      a.recommendations.push({
        id: newId(), assessment_id: a.id, diagnostic_id: diagnosticId, problem_category: c.category, tier, is_best_fit: c.bestFit === tier, product_id: it.productId ?? null,
        title: it.title, detail: { ...it, whyBestFit: c.bestFit === tier ? c.whyBestFit : [] }, price_min: it.priceMin, price_max: it.priceMax, consultant_modified: false,
      });
    }
  }
  a.summary = summarise(answers);
}

export function buildPayload(a: LocalAssessment, status: "preliminary" | "final", version: number): ReportPayload {
  const answers: Answers = a.answers ?? {};
  const summary = summarise(answers);
  const d = a.diagnostic;
  if (!d) throw new Error("Run the analysis before generating a report.");
  const room: any = a.room ? { ...a.room, analysis: a.room.computed } : null;
  const ms = a.measurements;
  const ambient = [...ms].reverse().find((m) => m.kind === "ambient");
  const speech = [...ms].reverse().find((m) => m.kind === "speech");
  const snr = ambient && speech ? relativeSnr(speech.stats, ambient.stats) : null;
  return {
    ref: a.ref,
    generatedAt: new Date().toISOString(),
    status,
    version,
    customer: { name: answers.contact_name ?? "", email: answers.contact_email ?? "", phone: answers.contact_phone, designation: answers.designation },
    organisation: { name: answers.organisation ?? "", location: answers.location },
    environment: { type: summary.environment, occupants: summary.occupants, mode: summary.mode },
    room: room ? {
      length: Number(room.length_m), width: Number(room.width_m), height: Number(room.height_m),
      floorArea: room.analysis.floorArea, volume: room.analysis.volume, rt60: room.analysis.rt60Unoccupied, rt60Occupied: room.analysis.rt60Occupied,
      target: room.analysis.target, risk: room.analysis.risk, notes: room.analysis.notes,
      materials: { floor: room.floor_material.replace(/_/g, " "), walls: room.wall_material.replace(/_/g, " "), ceiling: room.ceiling_material.replace(/_/g, " "), glass: room.glass_share, softFurnishings: room.soft_furnishings, panels: room.panels },
    } : null,
    problems: summary.problems,
    impact: summary.impact,
    summary,
    measurements: ms.map((m) => ({
      label: m.label || (m.kind === "ambient" ? "Room noise" : m.kind === "speech" ? "Speech" : "Recording"),
      kind: m.kind, when: new Date(m.started_at).toISOString(), durationS: Number(m.duration_s), leq: m.stats.leqDb, l10: m.stats.l10Db, l90: m.stats.l90Db,
      calibration: m.calibration?.status === "single_point" ? `Single-point offset ${m.calibration.offsetDb} dB vs ${m.calibration.referenceInstrument ?? "reference meter"} (not certified)` : "Uncalibrated – relative dBFS only",
      notes: m.notes ?? undefined,
    })),
    relativeSnr: snr,
    diagnosis: d.diagnosis,
    plan: d.plan,
    recommendations: a.recommendations.map((r) => ({
      category: r.problem_category, tier: r.tier, best: r.is_best_fit, title: r.title, priceMin: r.price_min, priceMax: r.price_max,
      why: r.detail?.whyBestFit ?? [], advantages: r.detail?.advantages ?? [], limitations: r.detail?.limitations ?? [], maintenance: r.detail?.maintenance ?? "", improvement: r.detail?.expectedImprovement ?? "",
      suitability: r.detail?.suitability ?? "", complexity: r.detail?.complexity ?? "", modified: false,
    })),
    consultantRemarks: "",
    customerNotes: [],
    consultantName: null,
    limitations: [...REPORT_LIMITATIONS, "SoundSense Lite runs entirely in your browser: this report was generated on your device and no consultant has reviewed it."],
  };
}

export function addReport(a: LocalAssessment, status: "preliminary" | "final" = "preliminary") {
  const version = (a.reports.reduce((m, r) => Math.max(m, r.version), 0)) + 1;
  const payload = buildPayload(a, status, version);
  const r = { id: newId(), version, status, consultant_remarks: null, created_at: new Date().toISOString(), payload };
  a.reports.unshift(r);
  return r;
}
