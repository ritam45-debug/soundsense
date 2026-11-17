import { Queryable, j } from "../db";
import { getAssessmentFull } from "./assessments";
import { summarise } from "../acoustics/summary";
import { relativeSnr, LevelStats } from "../acoustics/measurement";
import { Answers, optionLabel } from "../acoustics/questionnaire";

/** Immutable snapshot used to render the PDF – later catalogue/price edits never rewrite an issued report. */
export interface ReportPayload {
  ref: string;
  generatedAt: string;
  status: "preliminary" | "final";
  version: number;
  customer: { name: string; email: string; phone?: string; designation?: string };
  organisation: { name: string; location?: string };
  environment: { type: string; occupants: number | null; mode: string };
  room: null | { length: number; width: number; height: number; floorArea: number; volume: number; rt60: number; rt60Occupied: number; target: number; risk: string; notes: string[]; materials: Record<string, string> };
  problems: string[];
  impact: ReturnType<typeof summarise>["impact"];
  summary: ReturnType<typeof summarise>;
  measurements: { label: string; kind: string; when: string; durationS: number; leq: number; l10: number; l90: number; calibration: string; notes?: string }[];
  relativeSnr: null | { snrDb: number; rating: string };
  diagnosis: any;
  plan: any;
  recommendations: { category: string; tier: string; best: boolean; title: string; priceMin: number; priceMax: number; why: string[]; advantages: string[]; limitations: string[]; maintenance: string; improvement: string; suitability: string; complexity: string; modified: boolean }[];
  consultantRemarks: string;
  customerNotes: string[];
  consultantName: string | null;
  limitations: string[];
}

export const REPORT_LIMITATIONS = [
  "This report is a screening assessment produced from customer-declared information, optional browser microphone recordings and rule-based analysis. It is not a certified acoustic survey.",
  "Browser-microphone levels are RELATIVE (dBFS) unless a single-point calibration against an external reference meter was entered; even then they are not IEC 61672 compliant measurements.",
  "Reverberation times are Sabine estimates from declared surface materials and may differ materially from measured RT60.",
  "Prices are indicative estimates set by SoundSense, not vendor quotes. Obtain written quotations before purchase.",
  "Root causes are hypotheses until the recommended tests are completed; an expert inspection is advised where flagged.",
];

export async function buildReportPayload(q: Queryable, assessmentId: string, opts: { status: "preliminary" | "final"; version: number; remarks?: string }): Promise<ReportPayload> {
  const full = await getAssessmentFull(q, assessmentId);
  const a = full.assessment;
  const answers: Answers = a.answers ?? {};
  const summary = summarise(answers);
  const d = full.diagnostic;
  if (!d) throw new Error("Run the analysis before generating a report.");
  const room = full.room as any;
  const roomLabel = (list: string, v: string) => v.replace(/_/g, " ") + (list ? "" : "");
  const statsOf = (m: any) => m.stats as LevelStats;
  const ambient = [...full.measurements].reverse().find((m: any) => m.kind === "ambient");
  const speech = [...full.measurements].reverse().find((m: any) => m.kind === "speech");
  const snr = ambient && speech ? relativeSnr(statsOf(speech), statsOf(ambient)) : null;

  return {
    ref: a.ref,
    generatedAt: new Date().toISOString(),
    status: opts.status,
    version: opts.version,
    customer: { name: answers.contact_name ?? full.customer?.name ?? "", email: answers.contact_email ?? full.customer?.email ?? "", phone: answers.contact_phone, designation: answers.designation },
    organisation: { name: answers.organisation ?? "", location: answers.location },
    environment: { type: summary.environment, occupants: summary.occupants, mode: summary.mode },
    room: room
      ? {
          length: Number(room.length_m), width: Number(room.width_m), height: Number(room.height_m),
          floorArea: room.analysis.floorArea, volume: room.analysis.volume, rt60: room.analysis.rt60Unoccupied, rt60Occupied: room.analysis.rt60Occupied,
          target: room.analysis.target, risk: room.analysis.risk, notes: room.analysis.notes,
          materials: { floor: roomLabel("", room.floor_material), walls: roomLabel("", room.wall_material), ceiling: roomLabel("", room.ceiling_material), glass: room.glass_share, softFurnishings: room.soft_furnishings, panels: room.panels },
        }
      : null,
    problems: summary.problems,
    impact: summary.impact,
    summary,
    measurements: full.measurements.map((m: any) => ({
      label: m.label || (m.kind === "ambient" ? "Room noise" : m.kind === "speech" ? "Speech" : "Recording"),
      kind: m.kind,
      when: new Date(m.started_at).toISOString(),
      durationS: Number(m.duration_s),
      leq: m.stats.leqDb, l10: m.stats.l10Db, l90: m.stats.l90Db,
      calibration: m.calibration?.status === "single_point" ? `Single-point offset ${m.calibration.offsetDb} dB vs ${m.calibration.referenceInstrument ?? "reference meter"} (not certified)` : "Uncalibrated – relative dBFS only",
      notes: m.notes ?? undefined,
    })),
    relativeSnr: snr,
    diagnosis: d.diagnosis,
    plan: d.plan,
    recommendations: full.recommendations.map((r: any) => ({
      category: r.problem_category, tier: r.tier, best: r.is_best_fit, title: r.title, priceMin: r.price_min, priceMax: r.price_max,
      why: r.detail?.whyBestFit ?? [], advantages: r.detail?.advantages ?? [], limitations: r.detail?.limitations ?? [], maintenance: r.detail?.maintenance ?? "", improvement: r.detail?.expectedImprovement ?? "",
      suitability: r.detail?.suitability ?? "", complexity: r.detail?.complexity ?? "", modified: r.consultant_modified,
    })),
    consultantRemarks: opts.remarks ?? "",
    customerNotes: full.notes.filter((n: any) => n.visibility === "customer").map((n: any) => `${n.author}: ${n.body}`),
    consultantName: full.consultant?.name ?? null,
    limitations: REPORT_LIMITATIONS,
  };
}

export async function createReport(q: Queryable, assessmentId: string, userId: string, opts: { status: "preliminary" | "final"; remarks?: string }) {
  const v = await q.query<{ v: number }>("select coalesce(max(version),0)::int + 1 as v from reports where assessment_id = $1", [assessmentId]);
  const version = v.rows[0].v;
  const payload = await buildReportPayload(q, assessmentId, { status: opts.status, version, remarks: opts.remarks });
  const r = await q.query<{ id: string }>(
    "insert into reports(assessment_id, version, status, consultant_remarks, payload, generated_by) values ($1,$2,$3,$4,$5::jsonb,$6) returning id",
    [assessmentId, version, opts.status, opts.remarks ?? null, j(payload), userId]
  );
  return { id: r.rows[0].id, version, payload };
}

export { optionLabel };
