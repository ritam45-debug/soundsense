/**
 * Measurement maths – pure functions shared by the browser meter and the server.
 *
 * Three DIFFERENT things are kept apart on purpose:
 *   1. RELATIVE INPUT  – dBFS: level relative to digital full scale of THIS device/browser. Always available.
 *      It is NOT a sound pressure level. Phone/laptop mics have unknown sensitivity, and browsers/OSs may
 *      apply automatic gain control or noise suppression (we request them OFF, but cannot guarantee it).
 *   2. ROUGH ESTIMATE  – dBFS + an ASSUMED sensitivity offset. Wide uncertainty (±20 dB) – a guide to
 *      "quiet / normal / loud" only. Not researched per device; the offset is an assumption.
 *   3. SINGLE-POINT CALIBRATED – dBFS + offset derived from a simultaneous reading on a calibrated
 *      reference meter. Better, but still NOT a certified measurement: no A-weighting / time-weighting
 *      per IEC 61672, only valid near the calibration level, and sensitive to device processing.
 *      (NIOSH found that only 4 of 10 iOS sound-meter apps that met their selection criteria stayed
 *       within ±2 dB of a Type 1 meter, and calibrated external mics were needed for compliance claims.)
 */
export type CalibrationStatus = "uncalibrated" | "single_point";

export interface Calibration {
  status: CalibrationStatus;
  /** dB to ADD to dBFS to approximate SPL (only when status = single_point). */
  offsetDb?: number;
  referenceDb?: number;
  referenceInstrument?: string;
  note?: string;
}

export interface LevelStats {
  n: number;
  minDb: number;
  maxDb: number;
  /** Energy-average (equivalent continuous level) in dBFS. */
  leqDb: number;
  /** Level exceeded 10 % / 50 % / 90 % of the time. L90 ≈ background floor, L10 ≈ speech peaks. */
  l10Db: number;
  l50Db: number;
  l90Db: number;
}

export const SILENCE_DB = -100;
export const rmsToDbfs = (rms: number) => Math.max(SILENCE_DB, 20 * Math.log10(Math.max(rms, 1e-5)));

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];

export function computeStats(levelsDb: number[]): LevelStats {
  if (levelsDb.length === 0) throw new Error("No samples");
  const sorted = [...levelsDb].sort((a, b) => a - b);
  const meanEnergy = levelsDb.reduce((s, d) => s + 10 ** (d / 10), 0) / levelsDb.length;
  const r = (x: number) => Math.round(x * 10) / 10;
  return {
    n: levelsDb.length,
    minDb: r(sorted[0]),
    maxDb: r(sorted[sorted.length - 1]),
    leqDb: r(10 * Math.log10(meanEnergy)),
    l10Db: r(pct(sorted, 0.9)),
    l50Db: r(pct(sorted, 0.5)),
    l90Db: r(pct(sorted, 0.1)),
  };
}

/** Reduce a long level trace to ≤ maxPoints by block-averaging energy (keeps storage small). */
export function downsample(levelsDb: number[], maxPoints = 240): number[] {
  if (levelsDb.length <= maxPoints) return levelsDb.map((d) => Math.round(d * 10) / 10);
  const block = levelsDb.length / maxPoints;
  const out: number[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const a = Math.floor(i * block);
    const b = Math.max(a + 1, Math.floor((i + 1) * block));
    const slice = levelsDb.slice(a, b);
    const e = slice.reduce((s, d) => s + 10 ** (d / 10), 0) / slice.length;
    out.push(Math.round(10 * Math.log10(e) * 10) / 10);
  }
  return out;
}

export const ASSUMED_OFFSET_DB = 100; // ASSUMPTION – typical-ish phone mic, genuinely varies ±20 dB between devices
export const ROUGH_UNCERTAINTY_DB = 20;

export function roughEstimate(dbfs: number) {
  const v = Math.round(dbfs + ASSUMED_OFFSET_DB);
  return { value: v, lowDb: v - ROUGH_UNCERTAINTY_DB, highDb: v + ROUGH_UNCERTAINTY_DB, label: levelWord(v) };
}

export function levelWord(approxSpl: number) {
  if (approxSpl < 35) return "very quiet";
  if (approxSpl < 45) return "quiet";
  if (approxSpl < 60) return "moderate";
  if (approxSpl < 75) return "loud";
  return "very loud";
}

export function makeCalibration(referenceDb: number, measuredDbfs: number, instrument: string): Calibration {
  if (!Number.isFinite(referenceDb) || referenceDb < 20 || referenceDb > 130) throw new Error("Reference level must be between 20 and 130 dB");
  return {
    status: "single_point",
    offsetDb: Math.round((referenceDb - measuredDbfs) * 10) / 10,
    referenceDb,
    referenceInstrument: instrument.slice(0, 120),
    note: "Single-point offset. Not a certified measurement.",
  };
}

export const applyCalibration = (dbfs: number, cal: Calibration) => (cal.status === "single_point" && cal.offsetDb !== undefined ? Math.round((dbfs + cal.offsetDb) * 10) / 10 : null);

export type SnrRating = "poor" | "marginal" | "good";
/**
 * Relative signal-to-noise: talker level minus room-noise level, both measured with the SAME device and
 * settings, so unknown mic sensitivity cancels out. Guidance (Biamp support): at least 10 dB is required,
 * closer to 25 dB is best for speech intelligibility.
 */
export function relativeSnr(speech: LevelStats, ambient: LevelStats) {
  const snr = Math.round((speech.leqDb - ambient.leqDb) * 10) / 10;
  const rating: SnrRating = snr < 10 ? "poor" : snr < 25 ? "marginal" : "good";
  return { snrDb: snr, rating };
}

export const MEASUREMENT_INSTRUCTIONS = [
  "Place the phone or laptop where the microphone normally picks up speech – on the meeting table, not in a pocket or bag.",
  "Keep the microphone opening uncovered and face it towards the room, about 1 m above the floor if possible.",
  "Record 'Room noise' first: everyone silent, doors closed, normal AC running – for at least 30 seconds.",
  "Then record 'Speech': one person speaks at normal meeting volume from their usual seat for 30 seconds.",
  "Repeat from the seat where the problem is worst. Add a note for each recording.",
];
