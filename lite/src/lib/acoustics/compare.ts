/**
 * Before/after comparison. It only reports a change when the two recordings can fairly be compared, never converts dB
 * into percentages, and never claims that a particular fix caused the change.
 */
export interface Evidence { at: string; kind: "ambient" | "speech" | "live"; value: number; unit: "dBFS" | "dB"; basis: "calibrated" | "estimate" | "relative"; device?: string | null; durationS?: number | null; label: string }
export interface Comparison {
  comparable: boolean;
  issues: string[];
  caveats: string[];
  deltaDb: number | null;
  direction: "quieter" | "louder" | "no_clear_change" | null;
  summary: string;
}
export const MIN_SECONDS = 10;
/** Changes smaller than this are within normal session-to-session variation for phone and laptop microphones (rule of thumb, not a standard). */
export const CLEAR_CHANGE_DB = 3;

export function compareEvidence(before: Evidence, after: Evidence): Comparison {
  const issues: string[] = []; const caveats: string[] = [];
  if (Date.parse(after.at) <= Date.parse(before.at)) issues.push("The 'after' recording is not later than the 'before' recording.");
  if (before.kind !== after.kind) issues.push("The two recordings are different kinds (for example room noise vs speech).");
  if (before.unit !== after.unit) issues.push("The two readings use different units, so they cannot be subtracted.");
  if ((before.basis === "calibrated") !== (after.basis === "calibrated")) issues.push("One reading is calibrated and the other is not.");
  if (before.device && after.device && before.device !== after.device) issues.push("The recordings were made on different devices; microphones differ by tens of dB.");
  for (const [n, e] of [["before", before], ["after", after]] as const) if (e.durationS != null && e.durationS < MIN_SECONDS) issues.push(`The ${n} recording is shorter than ${MIN_SECONDS} seconds.`);
  if (issues.length) return { comparable: false, issues, caveats, deltaDb: null, direction: null, summary: "These two readings cannot be compared fairly, so no change is reported." };
  if (!before.device || !after.device) caveats.push("The device was not recorded for one or both readings. Make sure both were taken with the same device, in the same position and with the same settings.");
  if (before.basis !== "calibrated") caveats.push("Uncalibrated readings are valid for comparing on the same device only. The size of the change in real dB SPL is not known.");
  caveats.push("Room occupancy, time of day, doors and equipment state also change the reading. Repeat the recording a few times for a firm conclusion.");
  const d = Math.round((after.value - before.value) * 10) / 10;
  const direction = Math.abs(d) < CLEAR_CHANGE_DB ? "no_clear_change" : d < 0 ? "quieter" : "louder";
  const summary = direction === "no_clear_change" ? `The level changed by ${d > 0 ? "+" : ""}${d} dB, which is within normal variation, so there is no clear change.` : `The after recording reads ${Math.abs(d)} dB ${direction} than the before recording.`;
  return { comparable: true, issues, caveats, deltaDb: d, direction, summary };
}
export interface Change { text: string; at: string }
/** Changes made between two dates, shown as context. Listing them never implies they caused the difference. */
export const changesBetween = (done: Record<string, string> | undefined, label: (id: string) => string, fromIso: string, toIso: string): Change[] =>
  Object.entries(done ?? {}).filter(([, at]) => at >= fromIso && at <= toIso).map(([id, at]) => ({ text: label(id), at })).sort((a, b) => a.at.localeCompare(b.at));
