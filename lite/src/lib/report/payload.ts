import { summarise } from "../acoustics/summary";

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

