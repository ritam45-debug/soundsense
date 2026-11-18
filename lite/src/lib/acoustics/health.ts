/**
 * Acoustic Health Score (0–100) – an ILLUSTRATIVE, transparent model.
 *
 * Five categories, each scored only from evidence that exists. A category with no evidence is "unavailable" and is
 * left out (its weight is redistributed over the others) – it is never scored as if it had been measured.
 * Every point lost is listed in `deductions`. Weights are configurable and have room-type presets.
 * The mapping curves are team judgement (documented in docs/SCORING.md); they are not a published standard.
 * If fewer than two categories (or under 40 % of the weight) have evidence the result is "Insufficient data".
 */
export type CatId = "noise" | "reverb" | "intelligibility" | "equipment" | "reported";
export type HBasis = "calibrated" | "estimated" | "calculated" | "reported" | "unavailable";
export const CAT_LABEL: Record<CatId, string> = { noise: "Background noise", reverb: "Reverberation", intelligibility: "Speech intelligibility", equipment: "Audio equipment", reported: "Reported issues" };
export const CAT_IDS: CatId[] = ["noise", "reverb", "intelligibility", "equipment", "reported"];

export interface HealthInput {
  roomType?: string;
  /** Latest room-noise recording. `splDb` is dB SPL if calibrated, else the uncalibrated estimate. */
  ambient?: { splDb: number; calibrated: boolean };
  /** Relative speech-minus-noise level from two recordings on the same device. */
  snrDb?: number;
  /** Sabine screening estimate vs target (ratio 1.0 = on target). */
  rt60Ratio?: number;
  clap?: "lingers" | "short" | "unsure";
  problems?: string[];
  equipment?: string[];
  occupants?: number;
  repeats?: "never" | "rarely" | "sometimes" | "often";
  /** Result of the Meeting Readiness check, if run. */
  readiness?: { micFound?: boolean; speakerFound?: boolean; signal?: boolean; clipping?: boolean; feedback?: boolean };
}
export interface HealthConfig { weights: Record<CatId, number>; minCategories: number; minCoverage: number }
export const DEFAULT_WEIGHTS: Record<CatId, number> = { noise: 0.25, reverb: 0.2, intelligibility: 0.25, equipment: 0.15, reported: 0.15 };
export const WEIGHT_PRESETS: Record<string, Record<CatId, number>> = {
  default: DEFAULT_WEIGHTS,
  conference_room: { noise: 0.2, reverb: 0.2, intelligibility: 0.3, equipment: 0.15, reported: 0.15 },
  auditorium: { noise: 0.1, reverb: 0.3, intelligibility: 0.25, equipment: 0.2, reported: 0.15 },
  temple_public: { noise: 0.1, reverb: 0.3, intelligibility: 0.25, equipment: 0.2, reported: 0.15 },
  education: { noise: 0.25, reverb: 0.25, intelligibility: 0.25, equipment: 0.1, reported: 0.15 },
  home_office: { noise: 0.3, reverb: 0.15, intelligibility: 0.25, equipment: 0.15, reported: 0.15 },
  studio: { noise: 0.3, reverb: 0.3, intelligibility: 0.1, equipment: 0.2, reported: 0.1 },
};
export const configFor = (roomType?: string, override?: Partial<Record<CatId, number>>): HealthConfig => ({
  weights: { ...(WEIGHT_PRESETS[roomType ?? ""] ?? DEFAULT_WEIGHTS), ...(override ?? {}) }, minCategories: 2, minCoverage: 0.4,
});

export interface Deduction { text: string; points: number }
export interface CategoryScore { id: CatId; label: string; score: number | null; basis: HBasis; weight: number; deductions: Deduction[]; improve: string }
export interface HealthResult {
  status: "ok" | "insufficient";
  overall: number | null;
  grade: "reported_only" | "includes_measurements" | "none";
  gradeText: string;
  coverage: number;
  categories: CategoryScore[];
  /** Largest point losses first, in overall-score points. */
  deductions: (Deduction & { category: CatId })[];
  opportunities: { text: string; gain: number }[];
  missing: string[];
}

/** Piecewise-linear lookup: points = [[x, score], …] sorted by x. */
function curve(x: number, pts: [number, number][]) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  return pts[pts.length - 1][1];
}
const round = (n: number) => Math.round(n);
const has = (a: string[] | undefined, ...ids: string[]) => !!a && ids.some((i) => a.includes(i));

const NOISE_CURVE: [number, number][] = [[35, 100], [45, 85], [50, 65], [55, 45], [65, 20], [75, 5]];
const SNR_CURVE: [number, number][] = [[0, 10], [10, 45], [25, 90], [30, 100]];
const RT_CURVE: [number, number][] = [[1.0, 100], [1.3, 75], [2.0, 40], [3.0, 10]];

function scoreNoise(i: HealthInput): Omit<CategoryScore, "id" | "label" | "weight"> {
  if (i.ambient) {
    const s = round(curve(i.ambient.splDb, NOISE_CURVE));
    return { score: s, basis: i.ambient.calibrated ? "calibrated" : "estimated", deductions: s < 100 ? [{ text: `Room noise ${i.ambient.calibrated ? "measured at" : "estimated at about"} ${round(i.ambient.splDb)} dB${i.ambient.calibrated ? "" : " (uncalibrated, ±20 dB)"}; quiet meeting rooms sit near 35–45 dB`, points: 100 - s }] : [], improve: "Reduce the main noise source and re-record the room noise." };
  }
  if (has(i.problems, "background_noise", "poor_noise_cancel")) return { score: 55, basis: "reported", deductions: [{ text: "Background noise was reported (no recording to confirm how much)", points: 45 }], improve: "Record 30 s of room noise to measure it." };
  return { score: null, basis: "unavailable", deductions: [], improve: "Record 30 s of room noise." };
}
function scoreReverb(i: HealthInput): Omit<CategoryScore, "id" | "label" | "weight"> {
  if (i.rt60Ratio !== undefined) {
    const s = round(curve(i.rt60Ratio, RT_CURVE));
    return { score: s, basis: "calculated", deductions: s < 100 ? [{ text: `Estimated reverberation is ${i.rt60Ratio.toFixed(1)}× the target for this kind of room (screening calculation)`, points: 100 - s }] : [], improve: "Add absorption (curtains, rugs, panels) and confirm with a measured RT60." };
  }
  if (i.clap === "lingers" || has(i.problems, "echo", "reverb")) return { score: i.clap === "lingers" ? 40 : 55, basis: "reported", deductions: [{ text: i.clap === "lingers" ? "A clap in the room rings on (reported)" : "Echo or reverberation was reported", points: i.clap === "lingers" ? 60 : 45 }], improve: "Enter the room size and materials so reverberation can be calculated." };
  if (i.clap === "short") return { score: 90, basis: "reported", deductions: [{ text: "A clap sounds short and dry (reported)", points: 10 }], improve: "Add the room size and materials to confirm." };
  return { score: null, basis: "unavailable", deductions: [], improve: "Enter the room size and materials." };
}
function scoreIntel(i: HealthInput): Omit<CategoryScore, "id" | "label" | "weight"> {
  if (i.snrDb !== undefined) {
    const s = round(curve(i.snrDb, SNR_CURVE));
    return { score: s, basis: "estimated", deductions: s < 100 ? [{ text: `Speech is only ${i.snrDb.toFixed(0)} dB above the room noise on your recordings (relative; at least 10 dB is needed, about 25 dB is good)`, points: 100 - s }] : [], improve: "Bring the microphone closer to talkers or cut the room noise, then record both again." };
  }
  const d: Deduction[] = [];
  if (has(i.problems, "poor_mic_pickup")) d.push({ text: "People are hard to hear or cut out (reported)", points: 25 });
  if (has(i.problems, "distorted_speech")) d.push({ text: "Speech sounds distorted or unclear (reported)", points: 25 });
  if (has(i.problems, "overlapping_voices")) d.push({ text: "Voices overlap in meetings (reported)", points: 15 });
  if (i.repeats === "often") d.push({ text: "People often ask others to repeat themselves (reported)", points: 20 });
  else if (i.repeats === "sometimes") d.push({ text: "People sometimes ask others to repeat themselves (reported)", points: 8 });
  if (d.length === 0 && !i.problems && !i.repeats) return { score: null, basis: "unavailable", deductions: [], improve: "Record room noise and speech to measure the speech-to-noise gap." };
  return { score: Math.max(10, 100 - d.reduce((s, x) => s + x.points, 0)), basis: "reported", deductions: d, improve: "Record room noise and speech to measure the speech-to-noise gap." };
}
function scoreEquipment(i: HealthInput): Omit<CategoryScore, "id" | "label" | "weight"> {
  const d: Deduction[] = []; let known = false;
  const r = i.readiness;
  if (r) {
    known = true;
    if (r.micFound === false) d.push({ text: "No microphone was found by the browser", points: 50 });
    if (r.speakerFound === false) d.push({ text: "No speaker/output device was found by the browser", points: 20 });
    if (r.signal === false) d.push({ text: "The microphone gave no usable signal", points: 30 });
    if (r.clipping) d.push({ text: "The microphone input overloads (clipping)", points: 15 });
    if (r.feedback) d.push({ text: "A steady tone suggests feedback", points: 25 });
  }
  if (i.equipment && i.equipment.length) {
    known = true;
    const e = i.equipment, n = i.occupants ?? 0;
    if (has(e, "laptop_mic") && n > 4 && !has(e, "conf_bar", "ceiling_mic", "dsp_mixer")) d.push({ text: `A laptop microphone is the only pickup for about ${n} people (reported)`, points: 25 });
    if (has(e, "laptop_speaker", "tv_speakers") && n > 6) d.push({ text: `Laptop or TV speakers serve about ${n} people (reported)`, points: 15 });
  }
  if (has(i.problems, "bt_disconnect", "device_not_recognised", "intermittent_audio")) { known = true; d.push({ text: "Connection faults were reported (drops, not recognised, cutting out)", points: 25 }); }
  if (has(i.problems, "feedback")) { known = true; d.push({ text: "Whistling or feedback was reported", points: 15 }); }
  if (!known) return { score: null, basis: "unavailable", deductions: [], improve: "Run the Meeting Readiness check and list the equipment." };
  return { score: Math.max(10, 100 - d.reduce((s, x) => s + x.points, 0)), basis: r ? "estimated" : "reported", deductions: d, improve: "Fix connection faults and match the microphone and speakers to the room size." };
}
function scoreReported(i: HealthInput): Omit<CategoryScore, "id" | "label" | "weight"> {
  if (!i.problems && !i.repeats) return { score: null, basis: "unavailable", deductions: [], improve: "Complete the questionnaire." };
  const n = (i.problems ?? []).filter((p) => p !== "none").length;
  const d: Deduction[] = [];
  if (n > 0) d.push({ text: `${n} sound problem${n > 1 ? "s" : ""} reported`, points: Math.min(60, n * 12) });
  if (i.repeats === "often") d.push({ text: "Meetings are often disrupted by repeats", points: 15 });
  return { score: Math.max(10, 100 - d.reduce((s, x) => s + x.points, 0)), basis: "reported", deductions: d, improve: "Fix the biggest reported problem first, then reassess." };
}

export function computeHealth(input: HealthInput, cfg: HealthConfig = configFor(input.roomType)): HealthResult {
  const parts: Record<CatId, Omit<CategoryScore, "id" | "label" | "weight">> = {
    noise: scoreNoise(input), reverb: scoreReverb(input), intelligibility: scoreIntel(input), equipment: scoreEquipment(input), reported: scoreReported(input),
  };
  const categories: CategoryScore[] = CAT_IDS.map((id) => ({ id, label: CAT_LABEL[id], weight: cfg.weights[id], ...parts[id] }));
  const avail = categories.filter((c) => c.score !== null);
  const wSum = avail.reduce((s, c) => s + c.weight, 0);
  const wAll = categories.reduce((s, c) => s + c.weight, 0) || 1;
  const coverage = wSum / wAll;
  const missing = categories.filter((c) => c.score === null).map((c) => `${c.label}: ${c.improve}`);
  const measured = avail.some((c) => ["calibrated", "estimated", "calculated"].includes(c.basis));
  if (avail.length < cfg.minCategories || coverage < cfg.minCoverage) {
    return { status: "insufficient", overall: null, grade: "none", gradeText: "Insufficient data: add the items below to get a score.", coverage, categories, deductions: [], opportunities: [], missing };
  }
  const overall = round(avail.reduce((s, c) => s + c.score! * c.weight, 0) / wSum);
  const deductions = avail.flatMap((c) => c.deductions.map((d) => ({ ...d, category: c.id, points: Math.round((d.points * c.weight / wSum) * 10) / 10 }))).filter((d) => d.points > 0).sort((a, b) => b.points - a.points);
  const opportunities = avail.filter((c) => c.score! < 90).map((c) => ({ text: c.improve, gain: Math.round(((100 - c.score!) * c.weight / wSum) * 10) / 10 })).sort((a, b) => b.gain - a.gain).slice(0, 3);
  return {
    status: "ok", overall, grade: measured ? "includes_measurements" : "reported_only",
    gradeText: measured ? `Based on ${avail.length} of 5 areas. Measured or calculated data is included where marked; estimates from phone or laptop microphones are uncalibrated.` : `Based on ${avail.length} of 5 areas, all from what was reported. Record the room to add measured evidence.`,
    coverage, categories, deductions, opportunities, missing,
  };
}

export const scoreBand = (s: number | null) => (s === null ? "Insufficient data" : s >= 80 ? "Healthy" : s >= 60 ? "Fair" : s >= 40 ? "Needs attention" : "Poor");
export const scoreTone = (s: number | null): "neutral" | "good" | "warn" | "bad" => (s === null ? "neutral" : s >= 80 ? "good" : s >= 60 ? "warn" : "bad");

export const healthDelta = (prev: HealthResult | null | undefined, cur: HealthResult) =>
  prev && prev.overall !== null && cur.overall !== null ? cur.overall - prev.overall : null;
