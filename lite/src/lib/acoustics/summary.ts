import { Answers, optionLabel } from "./questionnaire";

/** Plain-language assessment summary shown at the end of the questionnaire (before/independent of diagnosis). */
export interface AssessmentSummary {
  headline: string;
  environment: string;
  problems: string[];
  occupants: number | null;
  mode: string;
  impact: { frequency: string; lostTime: string; repeats: string; remoteAffected: string };
  equipment: string[];
  triedAlready: string[];
  buying: { decider: string; payer: string; budget: string };
  idealSolution: string;
  severity: { score: number; label: "low" | "moderate" | "high" };
}

const L = (q: string, v?: string) => (v ? optionLabel(q, v) : "Not answered");
const LL = (q: string, v?: string[]) => (Array.isArray(v) ? v.map((x) => optionLabel(q, x)) : []);

export function summarise(a: Answers): AssessmentSummary {
  const freq = { daily: 3, weekly: 2, monthly: 1, rarely: 0 }[a.q1_frequency as string] ?? 0;
  const lost = { none: 0, under_5: 1, "5_15": 2, over_15: 3 }[a.q8_lost as string] ?? 0;
  const rep = { often: 2, sometimes: 1, rarely: 0, never: 0 }[a.q7_repeat as string] ?? 0;
  const prob = Math.min(3, Array.isArray(a.q2_problems) ? a.q2_problems.length : 0);
  const score = freq + lost + rep + (prob >= 3 ? 1 : 0); // 0–9
  const label = score >= 6 ? "high" : score >= 3 ? "moderate" : "low";
  const problems = LL("q2_problems", a.q2_problems);
  const env = a.environment === "other" && a.environment_other ? `Other – ${a.environment_other}` : L("environment", a.environment);
  return {
    headline: `${problems.slice(0, 2).join(" and ") || "Sound issues"} in ${env.toLowerCase()}${a.q4_occupants ? ` (about ${a.q4_occupants} people)` : ""}`,
    environment: env,
    problems,
    occupants: typeof a.q4_occupants === "number" ? a.q4_occupants : null,
    mode: L("q5_mode", a.q5_mode),
    impact: {
      frequency: L("q1_frequency", a.q1_frequency),
      lostTime: L("q8_lost", a.q8_lost),
      repeats: L("q7_repeat", a.q7_repeat),
      remoteAffected: a.q6_remote ? L("q6_remote", a.q6_remote) : "Not applicable",
    },
    equipment: LL("q9_equipment", a.q9_equipment),
    triedAlready: LL("q10_attempted", a.q10_attempted),
    buying: { decider: L("q11_decider", a.q11_decider), payer: L("q12_payer", a.q12_payer), budget: L("q13_budget", a.q13_budget) },
    idealSolution: a.q14_ideal ?? "",
    severity: { score, label },
  };
}
