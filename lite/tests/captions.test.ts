import { describe, expect, it } from "vitest";
import { mergeResults, MAX_LINES } from "@/lib/acoustics/captions";
const res = (t: string, f: boolean, c = 0.9) => ({ isFinal: f, 0: { transcript: t, confidence: c } });
describe("captions", () => {
  it("keeps finished lines and replaces the interim one", () => {
    let id = 0; const next = () => ++id;
    let l = mergeResults([], [res("hello", false)], 0, next); expect(l).toHaveLength(1); expect(l[0].final).toBe(false);
    l = mergeResults(l, [res("hello there", true)], 0, next); expect(l.map((x) => x.text)).toEqual(["hello there"]);
    l = mergeResults(l, [res("hello there", true), res("how are", false)], 1, next); expect(l.map((x) => x.text)).toEqual(["hello there", "how are"]);
  });
  it("flags low confidence and ignores empty results", () => {
    expect(mergeResults([], [res("mumble", true, 0.3), res("  ", true)], 0, () => 1).map((l) => l.lowConfidence)).toEqual([true]);
  });
  it("caps memory use", () => {
    let l: any[] = []; for (let i = 0; i < 200; i++) l = mergeResults(l, [res(`line ${i}`, true)], 0, () => i); expect(l.length).toBe(MAX_LINES);
  });
});
