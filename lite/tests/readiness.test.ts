import { describe, expect, it } from "vitest";
import { evaluateReadiness, type ReadinessInput } from "@/lib/acoustics/readiness";
const base: ReadinessInput = { micFound: true, speakerFound: true, speakerHeard: true, signal: true, clipping: false, feedback: false, noiseSeverity: "green", noiseDb: 40, noiseCalibrated: false, online: true, slowLink: false, echoReported: false };
describe("meeting readiness", () => {
  it("READY when everything checks out", () => expect(evaluateReadiness(base).verdict).toBe("ready"));
  it("NEEDS ATTENTION for no mic, no signal, feedback, unheard tone, offline or high noise", () => {
    for (const p of [{ micFound: false }, { signal: false }, { feedback: true }, { speakerHeard: false }, { online: false }, { noiseSeverity: "orange" as const }]) expect(evaluateReadiness({ ...base, ...p }).verdict).toBe("attention");
  });
  it("READY WITH WARNINGS for clipping, caution noise, echo, slow link or untested speaker", () => {
    for (const p of [{ clipping: true }, { noiseSeverity: "yellow" as const }, { echoReported: true }, { slowLink: true }, { speakerHeard: null }]) expect(evaluateReadiness({ ...base, ...p }).verdict).toBe("warnings");
  });
  it("never claims a speed test and flags estimates as uncalibrated", () => {
    const t = evaluateReadiness(base).findings.map((x) => x.text).join(" ");
    expect(t).toMatch(/not a speed test/); expect(t).toMatch(/uncalibrated estimate/);
  });
  it("every failure or warning comes with something to do", () => {
    const r = evaluateReadiness({ ...base, micFound: false, feedback: true, echoReported: true, clipping: true });
    for (const x of r.findings.filter((y) => y.level !== "ok")) expect(x.fix).toBeTruthy();
  });
});
