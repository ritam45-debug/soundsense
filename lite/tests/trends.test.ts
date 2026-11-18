import { describe, expect, it } from "vitest";
import { DEFAULT_SCREENING } from "@/lib/acoustics/screening";
import { elevatedNoise, scoreTrend, trendNotes } from "@/lib/workspace/trends";
const rd = (i: number, value: number, basis: "estimate" | "calibrated" = "calibrated") => ({ id: `${i}`, roomId: "r", at: new Date(2026, 0, i + 1).toISOString(), source: "live" as const, basis, value, low: basis === "estimate" ? value - 20 : undefined, label: "" });
const sn = (day: number, overall: number) => ({ id: `${day}`, roomId: "r", at: new Date(2026, 0, day).toISOString(), overall, categories: {}, input: {} });
describe("trend notes", () => {
  it("says nothing with fewer than 3 data points", () => { expect(elevatedNoise([rd(1, 60), rd(2, 60)], DEFAULT_SCREENING)).toBeNull(); expect(scoreTrend([sn(1, 50), sn(10, 60)])).toBeNull(); expect(trendNotes([], [], DEFAULT_SCREENING)).toEqual([]); });
  it("counts elevated readings in the latest five", () => {
    const rs = [rd(1, 40), rd(2, 52), rd(3, 53), rd(4, 55), rd(5, 56), rd(6, 40)];
    expect(elevatedNoise(rs, DEFAULT_SCREENING)).toMatch(/elevated in 4 of the last 5/);
  });
  it("judges uncalibrated estimates at the low end, so a loud-looking estimate is not 'elevated' on its own", () => {
    expect(elevatedNoise([rd(1, 62, "estimate"), rd(2, 63, "estimate"), rd(3, 62, "estimate")], DEFAULT_SCREENING)).toMatch(/acceptable range/);
  });
  it("describes rising, falling and steady scores without predicting", () => {
    expect(scoreTrend([sn(1, 50), sn(15, 58), sn(30, 66)])!.text).toMatch(/rising/);
    expect(scoreTrend([sn(1, 70), sn(15, 62), sn(30, 52)])!.text).toMatch(/falling/);
    expect(scoreTrend([sn(1, 70), sn(15, 71), sn(30, 70)])!.text).toMatch(/steady/);
    expect(JSON.stringify(trendNotes([rd(1, 60), rd(2, 60), rd(3, 60)], [sn(1, 50), sn(15, 55), sn(30, 60)], DEFAULT_SCREENING))).not.toMatch(/will |forecast|predict/i);
  });
});
