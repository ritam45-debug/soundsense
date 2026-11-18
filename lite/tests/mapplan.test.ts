import { describe, expect, it } from "vitest";
import { distanceM, reflectionPoints, suggest } from "@/lib/workspace/mapPlan";
const d = { widthM: 6, lengthM: 8 };
const it_ = (kind: string, x: number, y: number, label?: string) => ({ id: `${kind}${x}${y}`, kind, x, y, label });
describe("map planning", () => {
  it("measures real distances from percentages", () => { expect(distanceM(it_("mic", 0, 0), it_("mic", 100, 0), d)).toBeCloseTo(6); expect(distanceM(it_("mic", 0, 0), it_("mic", 0, 100), d)).toBeCloseTo(8); });
  it("suggests a table mic and panel positions in an empty room", () => {
    const s = suggest([], d).map((x) => x.id); expect(s).toContain("no-mic"); expect(s).toEqual(expect.arrayContaining(["panel-l", "panel-r", "panel-b"]));
  });
  it("warns about a mic next to a speaker or noise source", () => {
    const s = suggest([it_("mic", 50, 50), it_("speaker", 55, 52), it_("noise", 52, 55, "AC unit")], d);
    expect(s.some((x) => x.id.startsWith("fb-") && x.severity === "warn")).toBe(true); expect(s.some((x) => x.id.startsWith("nz-") && /AC unit/.test(x.text))).toBe(true);
  });
  it("flags seats far from any microphone", () => { expect(suggest([it_("mic", 10, 10), it_("seat", 95, 95)], d).some((x) => x.id.startsWith("cov-"))).toBe(true); expect(suggest([it_("mic", 50, 50), it_("seat", 55, 55)], d).some((x) => x.id.startsWith("cov-"))).toBe(false); });
  it("does not suggest panels once panels exist", () => { expect(suggest([it_("panel", 2, 50), it_("mic", 50, 50)], d).some((x) => x.id.startsWith("panel-"))).toBe(false); });
  it("finds reflection points on the side walls inside the room", () => {
    const p = reflectionPoints([it_("speaker", 50, 5), it_("seat", 50, 60)], d); expect(p.length).toBe(2);
    for (const q of p) { expect([0, 100]).toContain(q.x); expect(q.y).toBeGreaterThan(5); expect(q.y).toBeLessThan(60); }
  });
});
