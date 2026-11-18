import { describe, expect, it } from "vitest";
import { changesBetween, compareEvidence, type Evidence } from "@/lib/acoustics/compare";
const e = (o: Partial<Evidence>): Evidence => ({ at: "2026-01-01T10:00:00Z", kind: "ambient", value: -50, unit: "dBFS", basis: "relative", device: "d1", durationS: 30, label: "x", ...o });
describe("before/after comparison", () => {
  it("reports a clear drop and never uses percentages or causation", () => {
    const c = compareEvidence(e({}), e({ at: "2026-01-02T10:00:00Z", value: -58 }));
    expect(c.comparable).toBe(true); expect(c.deltaDb).toBe(-8); expect(c.direction).toBe("quieter");
    expect(c.summary).not.toMatch(/%|percent|because|caused|thanks to/i); expect(c.summary).toMatch(/8 dB quieter/);
  });
  it("calls small differences 'no clear change'", () => {
    expect(compareEvidence(e({}), e({ at: "2026-01-02T10:00:00Z", value: -51.5 })).direction).toBe("no_clear_change");
  });
  it("refuses unfair comparisons", () => {
    const later = "2026-01-02T10:00:00Z";
    expect(compareEvidence(e({}), e({ at: later, device: "d2" })).comparable).toBe(false);
    expect(compareEvidence(e({}), e({ at: later, kind: "speech" })).comparable).toBe(false);
    expect(compareEvidence(e({}), e({ at: later, basis: "calibrated" })).comparable).toBe(false);
    expect(compareEvidence(e({}), e({ at: later, durationS: 4 })).comparable).toBe(false);
    expect(compareEvidence(e({}), e({ at: "2025-12-01T00:00:00Z" })).comparable).toBe(false);
    expect(compareEvidence(e({}), e({ at: later, unit: "dB" })).comparable).toBe(false);
    const bad = compareEvidence(e({}), e({ at: later, device: "d2" })); expect(bad.deltaDb).toBeNull(); expect(bad.summary).toMatch(/no change is reported/);
  });
  it("warns when the device is unknown and when uncalibrated", () => {
    const c = compareEvidence(e({ device: null }), e({ at: "2026-01-02T10:00:00Z", device: null, value: -60 }));
    expect(c.comparable).toBe(true); expect(c.caveats.join(" ")).toMatch(/device was not recorded/); expect(c.caveats.join(" ")).toMatch(/Uncalibrated/);
  });
  it("lists changes made between the two dates as context", () => {
    const ch = changesBetween({ a: "2026-01-01T12:00:00Z", b: "2026-02-01T00:00:00Z" }, (id) => id, "2026-01-01T10:00:00Z", "2026-01-02T10:00:00Z");
    expect(ch.map((x) => x.text)).toEqual(["a"]);
  });
});
