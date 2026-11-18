/**
 * Trend notes: plain-language observations about what has ALREADY happened (for example "elevated in 4 of the last 5 readings").
 * These describe past data. They are not forecasts, and nothing is said until there are at least 3 data points.
 */
import { bandSeverity, classifyBand, severityRank, type ScreeningConfig } from "../acoustics/screening";
import type { Reading, Snapshot } from "./store";
export const MIN_POINTS = 3;
const isElevated = (r: Reading, cfg: ScreeningConfig) => severityRank(bandSeverity(classifyBand(r.basis === "estimate" && r.low !== undefined ? r.low : r.value!, cfg))) >= 1;

export function elevatedNoise(readings: Reading[], cfg: ScreeningConfig, last = 5): string | null {
  const rs = readings.filter((r) => r.value !== null && (r.basis === "estimate" || r.basis === "calibrated")).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, last);
  if (rs.length < MIN_POINTS) return null;
  const n = rs.filter((r) => isElevated(r, cfg)).length;
  if (n === 0) return `Noise was within the acceptable range in all of the last ${rs.length} readings.`;
  return `Noise was elevated in ${n} of the last ${rs.length} readings${n === rs.length ? ", every time" : ""}. Uncalibrated readings are judged at the low end of their range.`;
}
/** Least-squares slope of the health score, in points per 30 days. */
export function scoreTrend(snaps: Snapshot[]): { slopePer30d: number; text: string } | null {
  const pts = snaps.filter((s) => s.overall !== null).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-6);
  if (pts.length < MIN_POINTS) return null;
  const t0 = Date.parse(pts[0].at); const xs = pts.map((p) => (Date.parse(p.at) - t0) / 86_400_000), ys = pts.map((p) => p.overall as number);
  const span = xs[xs.length - 1]; if (span < 1) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const per30 = Math.round(slope * 30 * 10) / 10;
  const text = Math.abs(per30) < 2 ? `The health score has been steady over the last ${pts.length} snapshots.` : per30 > 0 ? `The health score has been rising, about ${per30} points per month over the last ${pts.length} snapshots.` : `The health score has been falling, about ${Math.abs(per30)} points per month over the last ${pts.length} snapshots.`;
  return { slopePer30d: per30, text };
}
export const trendNotes = (readings: Reading[], snaps: Snapshot[], cfg: ScreeningConfig): string[] => [elevatedNoise(readings, cfg), scoreTrend(snaps)?.text ?? null].filter((x): x is string => !!x);
