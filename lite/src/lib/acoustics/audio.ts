/**
 * Audio feature extraction and noise fingerprinting (pure maths, no browser APIs, runs locally).
 *
 * The fingerprint is a transparent, rule-based heuristic on spectral and timing features – NOT a trained
 * classifier. It reports a confidence band (never certainty), the evidence behind it and alternatives, and it
 * refuses to classify when the signal is too quiet or too short. Thresholds were tuned on synthetic signals
 * (see tests/audio.test.ts) and have not been validated on a library of real rooms.
 */

/** In-place radix-2 FFT. `re`/`im` length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

const hann = (() => { const cache = new Map<number, Float64Array>(); return (n: number) => { let w = cache.get(n); if (!w) { w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)); cache.set(n, w); } return w; }; })();

export interface FrameFeatures {
  rms: number; rmsDb: number; peak: number;
  /** Share of 20 Hz–8 kHz energy in bands. */
  low: number; mid: number; high: number; voice: number;
  centroidHz: number; flatness: number;
  tonalHz: number; tonalProminenceDb: number;
}

const DB = (x: number) => 10 * Math.log10(Math.max(x, 1e-20));

export function frameFeatures(frame: ArrayLike<number>, sr: number): FrameFeatures {
  const n = frame.length; // power of two
  const w = hann(n);
  const re = new Float64Array(n), im = new Float64Array(n);
  let sum = 0, peak = 0;
  for (let i = 0; i < n; i++) { const v = frame[i]; sum += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); re[i] = v * w[i]; }
  const rms = Math.sqrt(sum / n);
  fft(re, im);
  const half = n / 2, binHz = sr / n;
  const p = new Float64Array(half);
  let total = 0, low = 0, mid = 0, high = 0, voice = 0, cNum = 0, logSum = 0, cnt = 0;
  for (let k = 1; k < half; k++) {
    const f = k * binHz;
    p[k] = re[k] * re[k] + im[k] * im[k];
    if (f < 20 || f > 8000) continue;
    total += p[k]; cNum += p[k] * f; logSum += Math.log(p[k] + 1e-20); cnt++;
    if (f < 250) low += p[k]; else if (f < 4000) mid += p[k]; else high += p[k];
    if (f >= 150 && f <= 4000) voice += p[k];
  }
  let tonalK = 0, tonalP = 0;
  for (let k = 2; k < half - 2; k++) { const f = k * binHz; if (f < 40 || f > 8000) continue; if (p[k] > tonalP) { tonalP = p[k]; tonalK = k; } }
  // Prominence of the strongest bin over the median power in a ±40-bin neighbourhood.
  const lo = Math.max(2, tonalK - 40), hi = Math.min(half - 1, tonalK + 40);
  const neigh: number[] = [];
  for (let k = lo; k <= hi; k++) if (Math.abs(k - tonalK) > 2) neigh.push(p[k]);
  neigh.sort((a, b) => a - b);
  const med = neigh.length ? neigh[Math.floor(neigh.length / 2)] : 1e-20;
  const t = total || 1e-20;
  return {
    rms, rmsDb: Math.max(-100, 20 * Math.log10(Math.max(rms, 1e-5))), peak,
    low: low / t, mid: mid / t, high: high / t, voice: voice / t,
    centroidHz: cNum / t, flatness: Math.exp(logSum / Math.max(1, cnt)) / (total / Math.max(1, cnt) + 1e-20),
    tonalHz: tonalK * binHz, tonalProminenceDb: DB(tonalP) - DB(med),
  };
}

// ───────────────────────────── Session features ─────────────────────────────

export interface SessionFeatures {
  frames: number; seconds: number; fps: number;
  meanDb: number; levelStd: number; spreadDb: number;
  low: number; mid: number; high: number; voice: number; centroidHz: number; flatness: number;
  /** How much of the level variation sits at syllable rate (1.5–10 Hz), 0 = none … 1 = all of it. */
  modulation: number;
  /** Rapid level jumps per second. */
  transientsPerSec: number;
  /** Share of frames whose strongest peak sits at the same frequency and stands out clearly. */
  tonalPersistence: number; tonalHz: number;
  /** Share of time the signal is within 6 dB of its median level (steadiness). */
  steadiness: number;
  /** Slow (≈0.05–0.5 Hz) fluctuation of the level, in dB. */
  slowDriftDb: number;
}

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const quant = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };

function goertzelPower(x: number[], fps: number, hz: number) {
  const w = (2 * Math.PI * hz) / fps; let re = 0, im = 0;
  for (let i = 0; i < x.length; i++) { re += x[i] * Math.cos(w * i); im -= x[i] * Math.sin(w * i); }
  return (re * re + im * im) / x.length;
}

export function sessionFeatures(frames: FrameFeatures[], times: number[]): SessionFeatures | null {
  if (frames.length < 8) return null;
  const seconds = (times[times.length - 1] - times[0]) / 1000;
  if (seconds <= 0) return null;
  const fps = (frames.length - 1) / seconds;
  const db = frames.map((f) => f.rmsDb);
  const med = quant(db, 0.5);
  const m = mean(db);
  const std = Math.sqrt(mean(db.map((d) => (d - m) ** 2)));
  const env = frames.map((f) => f.rms);
  const em = mean(env);
  const e0 = env.map((v) => v - em);
  const varTot = mean(e0.map((v) => v * v)) + 1e-20;
  let modP = 0, modN = 0; for (let h = 1.5; h <= 10; h += 0.1) { modP += goertzelPower(e0, fps, h); modN++; }
  // Relative spectral density of the envelope in the 2–8 Hz band vs its average: 1 for random (white) fluctuation,
  // up to fps/12 when all variation sits at syllable rate. Rescaled to 0 (none) … 1 (all of it).
  const rel = modP / modN / varTot;
  // Overlapping analysis windows smooth even steady noise, so also require a real swing in level (≥ ~2 dB std).
  const modulation = Math.max(0, Math.min(1, (rel - 1) / Math.max(0.5, fps / 2 / 8.5 - 1))) * Math.max(0, Math.min(1, (std - 1) / 2));
  let trans = 0;
  for (let i = 1; i < db.length; i++) if (db[i] - db[i - 1] > 10 && db[i] > med + 8) trans++;
  // tonal persistence
  const hist = new Map<number, number>();
  for (const f of frames) if (f.tonalProminenceDb > 15) { const key = Math.round(f.tonalHz / 10); hist.set(key, (hist.get(key) ?? 0) + 1); }
  let bestKey = 0, best = 0; for (const [k, c] of hist) { const c3 = c + (hist.get(k - 1) ?? 0) + (hist.get(k + 1) ?? 0); if (c3 > best) { best = c3; bestKey = k; } }
  // slow drift: std of 1-second block means
  const blk = Math.max(1, Math.round(fps)); const blocks: number[] = [];
  for (let i = 0; i + blk <= db.length; i += blk) blocks.push(mean(db.slice(i, i + blk)));
  const bm = mean(blocks); const drift = blocks.length > 2 ? Math.sqrt(mean(blocks.map((b) => (b - bm) ** 2))) : 0;
  return {
    frames: frames.length, seconds, fps, meanDb: m, levelStd: std, spreadDb: quant(db, 0.9) - quant(db, 0.1),
    low: mean(frames.map((f) => f.low)), mid: mean(frames.map((f) => f.mid)), high: mean(frames.map((f) => f.high)), voice: mean(frames.map((f) => f.voice)),
    centroidHz: mean(frames.map((f) => f.centroidHz)), flatness: mean(frames.map((f) => f.flatness)),
    modulation, transientsPerSec: trans / seconds, tonalPersistence: Math.min(1, best / frames.length), tonalHz: bestKey * 10,
    steadiness: db.filter((d) => Math.abs(d - med) <= 6).length / db.length, slowDriftDb: drift,
  };
}

// ───────────────────────────── Fingerprint ─────────────────────────────

export type NoiseClass = "hum" | "fan" | "traffic" | "mechanical" | "keyboard" | "voices" | "speech";
export const NOISE_LABEL: Record<NoiseClass, string> = {
  hum: "Continuous low-frequency noise (hum or rumble)",
  fan: "Fan or ventilation noise",
  traffic: "Traffic-like noise",
  mechanical: "Intermittent mechanical noise",
  keyboard: "Keyboard and office activity",
  voices: "Multiple overlapping voices",
  speech: "Speech (one talker, with pauses)",
};
export type ConfidenceBand = "low" | "medium" | "high";
export interface Candidate { id: NoiseClass; label: string; score: number; confidence: number; band: ConfidenceBand; evidence: string[] }
export interface FingerprintResult {
  status: "ok" | "too_quiet" | "too_short" | "unclear";
  top: Candidate | null; alternatives: Candidate[]; caveats: string[];
  features: SessionFeatures | null;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ramp = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
const MAX_CONF = 0.8; // a rule-based heuristic never earns more than this

export function fingerprint(f: SessionFeatures | null): FingerprintResult {
  const caveats = ["Heuristic analysis of one recording, not a trained model. Treat the label as a lead to check, not a finding."];
  if (!f || f.seconds < 4) return { status: "too_short", top: null, alternatives: [], caveats: [...caveats, "Record at least 5 seconds (10–30 s is better)."], features: f };
  if (f.meanDb < -75) return { status: "too_quiet", top: null, alternatives: [], caveats: [...caveats, "The recording is too quiet to analyse. Move the microphone closer or check the input is not muted."], features: f };

  const scores: Record<NoiseClass, { s: number; ev: string[] }> = {
    hum: { s: 0, ev: [] }, fan: { s: 0, ev: [] }, traffic: { s: 0, ev: [] }, mechanical: { s: 0, ev: [] }, keyboard: { s: 0, ev: [] }, voices: { s: 0, ev: [] }, speech: { s: 0, ev: [] },
  };
  const steady = f.steadiness, lowShare = f.low, tonal = f.tonalPersistence, mod = f.modulation, voice = f.voice;

  // hum / rumble: steady, energy mostly below 250 Hz, often a persistent tone
  scores.hum.s = 0.45 * ramp(lowShare, 0.45, 0.85) + 0.3 * ramp(steady, 0.7, 0.95) + 0.25 * ramp(tonal, 0.3, 0.8) - 0.3 * ramp(mod, 0.15, 0.4);
  scores.hum.ev.push(`${Math.round(lowShare * 100)}% of the energy is below 250 Hz`, `level stays steady ${Math.round(steady * 100)}% of the time`);
  if (tonal > 0.3) scores.hum.ev.push(`a steady tone near ${Math.round(f.tonalHz)} Hz is present`);

  // fan / ventilation: steady broadband, mid-weighted, no strong tone or modulation
  scores.fan.s = 0.35 * ramp(steady, 0.7, 0.95) + 0.3 * ramp(f.flatness, 0.05, 0.3) + 0.2 * ramp(1 - Math.abs(lowShare - 0.4) / 0.4, 0.3, 1) - 0.25 * ramp(tonal, 0.4, 0.8) - 0.3 * ramp(mod, 0.15, 0.4) - 0.15 * ramp(lowShare, 0.75, 0.95);
  scores.fan.ev.push("steady, broadband sound without a dominant tone", `centroid about ${Math.round(f.centroidHz)} Hz`);

  // traffic: low-heavy with slow irregular swells, little syllable modulation
  scores.traffic.s = 0.35 * ramp(lowShare, 0.35, 0.7) + 0.4 * ramp(f.slowDriftDb, 1.5, 4) + 0.15 * (1 - ramp(mod, 0.1, 0.3)) - 0.25 * ramp(tonal, 0.4, 0.8) - 0.25 * ramp(steady, 0.9, 0.99);
  scores.traffic.ev.push(`low-frequency weighted (${Math.round(lowShare * 100)}% below 250 Hz)`, `level drifts by about ${f.slowDriftDb.toFixed(1)} dB over seconds`);

  // intermittent mechanical: bursts of low/mid noise, big level swings, not speech-like
  scores.mechanical.s = 0.4 * ramp(f.levelStd, 4, 12) + 0.3 * ramp(1 - steady, 0.25, 0.6) + 0.2 * (1 - ramp(voice, 0.6, 0.85)) + 0.1 * ramp(f.transientsPerSec, 0.05, 0.4) - 0.3 * ramp(mod, 0.2, 0.45) - 0.3 * ramp(f.transientsPerSec, 2, 5) - 0.2 * ramp(f.high, 0.3, 0.6);
  scores.mechanical.ev.push(`level swings by ±${f.levelStd.toFixed(1)} dB`, "bursts rather than a constant sound");

  // keyboard / office: many short broadband clicks, high-frequency energy
  scores.keyboard.s = 0.45 * ramp(f.transientsPerSec, 0.8, 4) + 0.35 * ramp(f.high + f.mid * 0.3, 0.3, 0.6) + 0.2 * ramp(f.levelStd, 4, 10) - 0.3 * ramp(mod, 0.3, 0.5);
  scores.keyboard.ev.push(`${f.transientsPerSec.toFixed(1)} short clicks per second`, "energy extends above 4 kHz");

  // speech vs babble: voice band + syllable-rate modulation; babble has fewer pauses
  // Speech needs syllable-rate modulation; without it, voice-band energy alone is just noise in that band.
  const speechLike = (0.4 * ramp(voice, 0.55, 0.85) + 0.4 * ramp(mod, 0.12, 0.4) + 0.2 * ramp(f.levelStd, 3, 8)) * ramp(mod, 0.06, 0.2);
  scores.speech.s = speechLike * ramp(f.spreadDb, 12, 26) - 0.2 * ramp(steady, 0.85, 1);
  scores.voices.s = speechLike * (1 - ramp(f.spreadDb, 10, 22)) * 0.95 + 0.1 * ramp(voice, 0.7, 0.9);
  scores.speech.ev.push(`energy sits in the speech band (${Math.round(voice * 100)}%)`, `level rises and falls at syllable rate`, `clear pauses (${f.spreadDb.toFixed(0)} dB between loud and quiet parts)`);
  scores.voices.ev.push(`energy sits in the speech band (${Math.round(voice * 100)}%)`, "speech-like modulation with few pauses, as when several people talk at once");

  const ranked = (Object.keys(scores) as NoiseClass[]).map((id) => ({ id, s: Math.max(0, scores[id].s) })).sort((a, b) => b.s - a.s);
  const total = ranked.reduce((s, r) => s + r.s, 0);
  const mk = (r: { id: NoiseClass; s: number }): Candidate => {
    const conf = Math.min(MAX_CONF, clamp01(r.s) * 0.85 * (0.6 + 0.4 * clamp01(f.seconds / 15)) * (total > 0 ? 0.55 + 0.45 * (r.s / total) : 0));
    return { id: r.id, label: NOISE_LABEL[r.id], score: Math.round(r.s * 100) / 100, confidence: Math.round(conf * 100) / 100, band: conf < 0.45 ? "low" : conf < 0.65 ? "medium" : "high", evidence: scores[r.id].ev };
  };
  const top = mk(ranked[0]);
  const alts = ranked.slice(1, 3).filter((r) => r.s > 0.12).map(mk);
  if (ranked[0].s < 0.3) return { status: "unclear", top: null, alternatives: [top, ...alts].filter((c) => c.score > 0.12), caveats: [...caveats, "No pattern was strong enough to name a likely source."], features: f };
  if (alts[0] && top.score - alts[0].score < 0.08) caveats.push(`"${alts[0].label}" fits almost as well as "${top.label}".`);
  if (top.id === "voices") caveats.push("Telling one talker from several is difficult with one microphone; overlapping speech is suggested only when pauses are rare.");
  return { status: "ok", top, alternatives: alts, caveats, features: f };
}

// ───────────────────────────── Live tracker ─────────────────────────────

export interface FeedbackState { active: boolean; hz: number | null; persistenceS: number; growing: boolean }

/** Keeps a rolling window of frames and answers: session features, clipping, feedback. */
export class FeatureTracker {
  private frames: FrameFeatures[] = [];
  private times: number[] = [];
  constructor(private sr: number, private windowS = 20) {}
  push(frame: ArrayLike<number>, tMs: number): FrameFeatures {
    const f = frameFeatures(frame, this.sr);
    this.frames.push(f); this.times.push(tMs);
    const cutoff = tMs - this.windowS * 1000;
    while (this.times.length > 2 && this.times[0] < cutoff) { this.times.shift(); this.frames.shift(); }
    return f;
  }
  reset() { this.frames = []; this.times = []; }
  get count() { return this.frames.length; }
  session() { return sessionFeatures(this.frames, this.times); }
  fingerprint() { return fingerprint(this.session()); }
  /** Overloaded input: very recent peaks at full scale. */
  clipping(lastS = 1.5): boolean {
    const t1 = this.times[this.times.length - 1]; if (t1 === undefined) return false;
    const recent = this.frames.filter((_, i) => this.times[i] >= t1 - lastS * 1000);
    return recent.filter((f) => f.peak >= 0.98).length >= 2;
  }
  /** A narrow tone that stays put for several seconds is the typical sign of speaker feedback (or a real hum). */
  feedback(minS = 3): FeedbackState {
    const n = this.frames.length; if (n < 10) return { active: false, hz: null, persistenceS: 0, growing: false };
    const t1 = this.times[n - 1];
    const recent: { f: FrameFeatures; t: number }[] = [];
    for (let i = n - 1; i >= 0 && this.times[i] >= t1 - minS * 1000 - 500; i--) recent.unshift({ f: this.frames[i], t: this.times[i] });
    if ((recent[recent.length - 1].t - recent[0].t) / 1000 < minS - 0.3) return { active: false, hz: null, persistenceS: 0, growing: false };
    const strong = recent.filter((r) => r.f.tonalProminenceDb >= 20 && r.f.rmsDb > -50);
    if (strong.length / recent.length < 0.85) return { active: false, hz: null, persistenceS: 0, growing: false };
    const hz = mean(strong.map((r) => r.f.tonalHz));
    if (strong.some((r) => Math.abs(r.f.tonalHz - hz) > Math.max(40, hz * 0.06))) return { active: false, hz: null, persistenceS: 0, growing: false };
    const half = Math.floor(recent.length / 2);
    const growing = mean(recent.slice(half).map((r) => r.f.rmsDb)) - mean(recent.slice(0, half).map((r) => r.f.rmsDb)) > 1.5;
    return { active: true, hz, persistenceS: (recent[recent.length - 1].t - recent[0].t) / 1000, growing };
  }
}
