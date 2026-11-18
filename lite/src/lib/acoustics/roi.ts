/**
 * Simple payback calculator. Everything it outputs follows from numbers the person types in: it knows nothing about their
 * organisation, and the "reduction in lost time" is an assumption, not a measured or promised result.
 */
export interface RoiInput { people: number; hourlyCost: number; meetingsPerWeek: number; minutesLostPerMeeting: number; reductionPct: number; investment: number; yearlyUpkeep: number; weeksPerYear?: number }
export interface Scenario { name: "Cautious" | "As entered" | "Optimistic"; reductionPct: number; yearlySaving: number; yearlyNet: number; paybackMonths: number | null; threeYearNet: number }
export interface RoiResult { valid: boolean; problems: string[]; yearlyLostCost: number; scenarios: Scenario[]; assumptions: string[] }
const r0 = (n: number) => Math.round(n);

export function roi(i: RoiInput): RoiResult {
  const problems: string[] = []; const weeks = i.weeksPerYear ?? 46;
  for (const [k, label, min] of [["people", "People in a typical meeting", 1], ["hourlyCost", "Cost of an hour of one person's time", 0], ["meetingsPerWeek", "Meetings per week", 0], ["minutesLostPerMeeting", "Minutes lost per meeting", 0], ["investment", "Cost of the fix", 0], ["yearlyUpkeep", "Yearly upkeep", 0]] as const) if (!Number.isFinite(i[k]) || i[k] < min) problems.push(`${label} must be ${min === 0 ? "zero or more" : `at least ${min}`}.`);
  if (!Number.isFinite(i.reductionPct) || i.reductionPct < 0 || i.reductionPct > 100) problems.push("Expected reduction must be between 0 and 100 %.");
  if (problems.length) return { valid: false, problems, yearlyLostCost: 0, scenarios: [], assumptions: [] };
  const lost = i.people * i.hourlyCost * (i.minutesLostPerMeeting / 60) * i.meetingsPerWeek * weeks;
  const mk = (name: Scenario["name"], pct: number): Scenario => {
    const saving = lost * (pct / 100); const net = saving - i.yearlyUpkeep;
    return { name, reductionPct: Math.round(pct * 10) / 10, yearlySaving: r0(saving), yearlyNet: r0(net), paybackMonths: net > 0 ? Math.round((i.investment / net) * 12 * 10) / 10 : null, threeYearNet: r0(net * 3 - i.investment) };
  };
  return {
    valid: true, problems: [], yearlyLostCost: r0(lost),
    scenarios: [mk("Cautious", i.reductionPct / 2), mk("As entered", i.reductionPct), mk("Optimistic", Math.min(100, i.reductionPct * 1.5))],
    assumptions: [`${weeks} meeting weeks a year.`, "The time lost per meeting and the reduction the fix achieves are your own estimates, not measurements.", "Counts only time. It ignores stress, missed information, and any change in how people use the room.", "A positive result is not a guarantee. Re-measure after the fix to see what actually changed.", "Costs are what you enter; SoundSense does not know local prices."],
  };
}
