import { describe, expect, it } from "vitest";
import { FeatureTracker, fft, fingerprint, frameFeatures } from "@/lib/acoustics/audio";

const SR = 16000, N = 1024, FPS = 40; // 40 analysis frames per second
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Build a signal of `sec` seconds from a per-sample generator, then feed N-sample frames at FPS into a tracker. */
function run(sec: number, gen: (i: number, t: number) => number, windowS = 30) {
  const total = Math.floor(sec * SR); const x = new Float32Array(total);
  for (let i = 0; i < total; i++) x[i] = gen(i, i / SR);
  const tr = new FeatureTracker(SR, windowS); const hop = Math.round(SR / FPS);
  for (let s = 0; s + N <= total; s += hop) tr.push(x.subarray(s, s + N), (s / SR) * 1000);
  return tr;
}
function lowpassNoise(seed: number, alpha: number) { const r = rng(seed); let y = 0; return () => (y = y + alpha * ((r() * 2 - 1) - y)); }
const harmonics = (f0: number, t: number, maxHz = 3000) => { let s = 0; for (let k = 1; f0 * k < maxHz; k++) s += Math.sin(2 * Math.PI * f0 * k * t) / Math.sqrt(k); return s * 0.08; };
const syllable = (t: number, rate: number, phase: number, duty: number) => { const p = (t * rate + phase) % 1; return p < duty ? Math.sin((Math.PI * p) / duty) : 0; };

describe("FFT and frame features", () => {
  it("finds a pure tone at the right frequency", () => {
    const x = new Float32Array(N).map((_, i) => 0.3 * Math.sin((2 * Math.PI * 1000 * i) / SR));
    const f = frameFeatures(x, SR);
    expect(Math.abs(f.tonalHz - 1000)).toBeLessThan(25);
    expect(f.tonalProminenceDb).toBeGreaterThan(30);
    expect(f.rms).toBeCloseTo(0.3 / Math.SQRT2, 2);
  });
  it("fft of an impulse is flat", () => {
    const re = new Float64Array(8); re[0] = 1; const im = new Float64Array(8); fft(re, im);
    for (let k = 0; k < 8; k++) expect(Math.hypot(re[k], im[k])).toBeCloseTo(1, 6);
  });
});

describe("noise fingerprinting on synthetic signals", () => {
  it("steady 100 Hz hum → continuous low-frequency noise", () => {
    const r = run(15, (_, t) => 0.2 * Math.sin(2 * Math.PI * 100 * t) + 0.1 * Math.sin(2 * Math.PI * 200 * t) + 0.002 * (Math.random() - 0.5)).fingerprint();
    expect(r.top?.id).toBe("hum");
  });
  it("steady broadband noise → fan or ventilation", () => {
    const n = rng(1); const r = run(15, () => 0.1 * (n() * 2 - 1)).fingerprint();
    expect(r.top?.id).toBe("fan");
  });
  it("rapid short clicks over a quiet floor → keyboard and office activity", () => {
    const n = rng(2);
    const r = run(15, (i, t) => { const ph = (t * 7) % 1; const click = ph < 0.012 ? (n() * 2 - 1) * 0.5 : 0; return click + 0.002 * (n() - 0.5); }).fingerprint();
    expect(r.top?.id).toBe("keyboard");
  });
  it("one talker with pauses → speech, not several voices", () => {
    const r = run(15, (_, t) => harmonics(130, t) * syllable(t, 3.5, 0, 0.55) * (Math.floor(t / 2.5) % 2 === 0 ? 1 : 0.0)).fingerprint();
    expect(r.top?.id).toBe("speech");
  });
  it("several talkers with few pauses → overlapping voices", () => {
    const voices = [[110, 3.1, 0.0], [150, 4.3, 0.3], [190, 3.7, 0.6], [125, 4.9, 0.1]];
    const r = run(15, (_, t) => voices.reduce((s, [f0, rate, ph]) => s + harmonics(f0, t) * (0.1 + 0.9 * syllable(t, rate, ph, 0.55)), 0) * 0.5).fingerprint();
    expect(r.top?.id).toBe("voices");
  });
  it("low-pass noise with slow swells → traffic-like", () => {
    const lp = lowpassNoise(3, 0.04);
    const r = run(25, (_, t) => lp() * 1.5 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.12 * t) * Math.sin(2 * Math.PI * 0.07 * t + 1)) ).fingerprint();
    expect(["traffic", "hum"]).toContain(r.top?.id);
  });
  it("burst-and-pause low-mid noise → intermittent mechanical", () => {
    const lp = lowpassNoise(4, 0.2);
    const r = run(20, (_, t) => ((t % 2.5) < 0.9 ? 0.25 * lp() * 4 : 0.001 * lp())).fingerprint();
    expect(r.top?.id).toBe("mechanical");
  });
});

describe("honesty of the fingerprint", () => {
  it("refuses to classify a recording that is too short or too quiet", () => {
    expect(fingerprint(null).status).toBe("too_short");
    const q = run(10, () => 0.00001 * Math.sin(Math.random())).fingerprint();
    expect(q.status).toBe("too_quiet"); expect(q.top).toBeNull();
  });
  it("never reports certainty and always states it is a heuristic", () => {
    const n = rng(5); const r = run(30, () => 0.1 * (n() * 2 - 1)).fingerprint();
    expect(r.top!.confidence).toBeLessThanOrEqual(0.8);
    expect(r.caveats.join(" ")).toMatch(/not a trained model/);
    expect(r.top!.evidence.length).toBeGreaterThan(0);
  });
});

describe("clipping and feedback indicators", () => {
  it("clipping fires on repeated full-scale peaks and not on a healthy level", () => {
    const loud = run(3, (_, t) => Math.max(-1, Math.min(1, 3 * Math.sin(2 * Math.PI * 300 * t))));
    expect(loud.clipping()).toBe(true);
    const ok = run(3, (_, t) => 0.2 * Math.sin(2 * Math.PI * 300 * t));
    expect(ok.clipping()).toBe(false);
  });
  it("a steady growing tone is flagged as possible feedback; speech-like audio is not", () => {
    const fb = run(8, (_, t) => (0.02 + 0.06 * t) * Math.sin(2 * Math.PI * 2500 * t) + 0.003 * (Math.random() - 0.5));
    const s = fb.feedback(); expect(s.active).toBe(true); expect(Math.abs(s.hz! - 2500)).toBeLessThan(80); expect(s.growing).toBe(true);
    const n = rng(6); const sp = run(8, (_, t) => harmonics(140, t) * syllable(t, 3.5, 0, 0.6) + 0.01 * (n() - 0.5));
    expect(sp.feedback().active).toBe(false);
  });
});
