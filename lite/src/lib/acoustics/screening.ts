/**
 * Screening thresholds and the alert engine (pure functions, no browser APIs).
 *
 * The bands below are the operational screening values supplied in the SoundSense 2.0 brief. They are
 * indicative comfort/productivity screens for meeting rooms – NOT hearing-safety limits and NOT a standard.
 * Every number is configurable in Settings.
 *
 * Honesty rules built in:
 *   • A calibrated reading (single-point calibration against a reference meter) is classified at its value.
 *   • An uncalibrated reading is only an ESTIMATE (dBFS + assumed offset, ±20 dB). It is classified at the LOWER
 *     end of that range, so we never raise an alarm the data cannot support.
 *   • RED is reserved for a configured urgent safety condition on a CALIBRATED reading. A noisy meeting room
 *     alone can never produce RED.
 */
import { ASSUMED_OFFSET_DB, Calibration, LevelStats, ROUGH_UNCERTAINTY_DB, applyCalibration } from "./measurement";

export type Severity = "green" | "yellow" | "orange" | "red";
export type Band = "quiet" | "acceptable" | "caution" | "high" | "priority";
export type ReadingBasis = "calibrated" | "estimate";

export interface ScreeningConfig {
  /** Upper edges: quiet < b0; acceptable ≤ b1; caution ≤ b2; high ≤ b3; priority above b3. */
  bands: [number, number, number, number];
  hysteresisDb: number;
  cooldownMin: number;
  urgent: { enabled: boolean; leqDb: number };
  assumedOffsetDb: number;
}
export const DEFAULT_SCREENING: ScreeningConfig = {
  bands: [35, 45, 50, 55],
  hysteresisDb: 2,
  cooldownMin: 10,
  urgent: { enabled: true, leqDb: 85 },
  assumedOffsetDb: ASSUMED_OFFSET_DB,
};

export const BAND_LABEL: Record<Band, string> = { quiet: "Quiet", acceptable: "Generally acceptable", caution: "Caution", high: "High concern", priority: "Priority investigation" };
export const SEVERITY_LABEL: Record<Severity, string> = { green: "Normal", yellow: "Caution", orange: "High concern", red: "Urgent" };
const RANK: Record<Severity, number> = { green: 0, yellow: 1, orange: 2, red: 3 };
export const severityRank = (s: Severity) => RANK[s];

export function classifyBand(db: number, cfg: ScreeningConfig = DEFAULT_SCREENING): Band {
  const [a, b, c, d] = cfg.bands;
  if (db < a) return "quiet";
  if (db <= b) return "acceptable";
  if (db <= c) return "caution";
  if (db <= d) return "high";
  return "priority";
}
export const bandSeverity = (b: Band): Severity => (b === "quiet" || b === "acceptable" ? "green" : b === "caution" ? "yellow" : "orange");
const bandLowerEdge = (b: Band, cfg: ScreeningConfig) => (b === "caution" ? cfg.bands[1] : b === "high" ? cfg.bands[2] : b === "priority" ? cfg.bands[3] : -Infinity);

export interface LevelReading {
  basis: ReadingBasis;
  /** Equivalent continuous level used for screening (dB SPL if calibrated, estimated SPL otherwise). */
  value: number;
  low: number;
  high: number;
  band: Band;
  severity: Severity;
  urgent: boolean;
  /** Plain-language status line that always says how trustworthy the number is. */
  status: string;
}

/** Turn a recording's level statistics into a screening reading, honestly labelled. */
export function screenLevel(stats: LevelStats, cal: Calibration, cfg: ScreeningConfig = DEFAULT_SCREENING): LevelReading {
  const calibrated = applyCalibration(stats.leqDb, cal);
  if (calibrated !== null) {
    const band = classifyBand(calibrated, cfg);
    const urgent = cfg.urgent.enabled && calibrated >= cfg.urgent.leqDb;
    return {
      basis: "calibrated", value: calibrated, low: calibrated, high: calibrated, band,
      severity: urgent ? "red" : bandSeverity(band), urgent,
      status: "Calibrated measurement (single-point, not a certified measurement)",
    };
  }
  const value = Math.round(stats.leqDb + cfg.assumedOffsetDb);
  const low = value - ROUGH_UNCERTAINTY_DB;
  const high = value + ROUGH_UNCERTAINTY_DB;
  const shown = classifyBand(value, cfg);
  const cautious = classifyBand(low, cfg);
  return {
    basis: "estimate", value, low, high, band: shown,
    // Severity comes from the LOW end of the estimate; an estimate can never be RED.
    severity: bandSeverity(cautious), urgent: false,
    status: `Uncalibrated estimate ≈ ${value} dB (could be ${low}–${high}). Confirm with a sound level meter before acting on the number.`,
  };
}

// ───────────────────────────── Alert engine ─────────────────────────────

export type AlertStatus = "open" | "acknowledged" | "resolved";
export interface AlertRec {
  id: string;
  roomId: string | null;
  key: string;
  severity: Severity;
  title: string;
  reading: string;
  basis: string;
  source: string;
  explanation: string;
  action: string;
  reassess: string;
  escalation: string;
  status: AlertStatus;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
  count: number;
  clearBelow: number;
  acknowledgedAt?: string;
  resolvedAt?: string;
  resolvedBy?: "auto" | "user";
}
export interface Candidate {
  key: string;
  severity: Severity;
  title: string;
  reading: string;
  basis: string;
  source: string;
  explanation: string;
  action: string;
  reassess: string;
  escalation: string;
  /** Current value on the same scale as clearBelow (dB for level alerts; 1/0 for yes/no conditions). */
  value: number;
  /** The alert clears once value falls below this (band edge minus hysteresis). */
  clearBelow: number;
}
export type AlertEvent = { type: "created" | "escalated" | "reopened" | "resolved" | "downgraded"; alertId: string; notify: boolean };

/**
 * Apply one new observation to the alert list.
 *  • Same unchanged condition → no new alert and no new notification (deduplication).
 *  • Worse condition → escalate the existing alert and notify.
 *  • Improvement only counts after the value drops below the band edge minus hysteresis (no flapping).
 *  • A condition returning within the cooldown re-opens the previous alert silently instead of notifying again.
 */
export function applyObservation(
  alerts: AlertRec[], roomId: string | null, key: string, cand: Candidate | null, nowMs: number, cfg: ScreeningConfig = DEFAULT_SCREENING, newId: () => string = () => Math.random().toString(36).slice(2)
): { alerts: AlertRec[]; events: AlertEvent[] } {
  const now = new Date(nowMs).toISOString();
  const events: AlertEvent[] = [];
  const out = alerts.map((a) => ({ ...a }));
  const open = out.find((a) => a.roomId === roomId && a.key === key && a.status !== "resolved");

  if (!cand || cand.severity === "green") {
    if (open && (!cand || cand.value < open.clearBelow)) {
      open.status = "resolved"; open.resolvedAt = now; open.resolvedBy = "auto"; open.updatedAt = now;
      events.push({ type: "resolved", alertId: open.id, notify: false });
    } else if (open) open.lastSeenAt = now;
    return { alerts: out, events };
  }

  const fill = (a: AlertRec) => {
    a.title = cand.title; a.reading = cand.reading; a.basis = cand.basis; a.source = cand.source; a.explanation = cand.explanation;
    a.action = cand.action; a.reassess = cand.reassess; a.escalation = cand.escalation; a.clearBelow = cand.clearBelow; a.lastSeenAt = now; a.updatedAt = now;
  };

  if (open) {
    open.count += 1;
    if (severityRank(cand.severity) > severityRank(open.severity)) {
      open.severity = cand.severity; open.status = "open"; delete open.acknowledgedAt; fill(open);
      events.push({ type: "escalated", alertId: open.id, notify: true });
    } else if (severityRank(cand.severity) < severityRank(open.severity) && cand.value < open.clearBelow) {
      open.severity = cand.severity; fill(open);
      events.push({ type: "downgraded", alertId: open.id, notify: false });
    } else {
      open.lastSeenAt = now; open.reading = cand.reading; open.basis = cand.basis; // same condition: refresh numbers only
    }
    return { alerts: out, events };
  }

  const recent = out
    .filter((a) => a.roomId === roomId && a.key === key && a.status === "resolved" && a.resolvedAt && nowMs - Date.parse(a.resolvedAt) < cfg.cooldownMin * 60_000)
    .sort((a, b) => Date.parse(b.resolvedAt!) - Date.parse(a.resolvedAt!))[0];
  if (recent) {
    recent.status = "open"; recent.severity = cand.severity; recent.count += 1; delete recent.resolvedAt; delete recent.resolvedBy; fill(recent);
    events.push({ type: "reopened", alertId: recent.id, notify: false });
    return { alerts: out, events };
  }

  const rec: AlertRec = {
    id: newId(), roomId, key, severity: cand.severity, title: cand.title, reading: cand.reading, basis: cand.basis, source: cand.source, explanation: cand.explanation,
    action: cand.action, reassess: cand.reassess, escalation: cand.escalation, status: "open", createdAt: now, updatedAt: now, lastSeenAt: now, count: 1, clearBelow: cand.clearBelow,
  };
  out.unshift(rec);
  events.push({ type: "created", alertId: rec.id, notify: true });
  return { alerts: out, events };
}

// ───────────────────────────── Candidate builders ─────────────────────────────

const ESCALATION: Record<Severity, string> = {
  green: "No escalation needed.",
  yellow: "Note it and watch the trend. Escalate only if it repeats on several assessments.",
  orange: "Tell the person who looks after this room (facility or IT manager) and plan the recommended fix.",
  red: "Treat as urgent: limit time in the space and tell the responsible manager now. Hearing-safety decisions need a qualified professional and a calibrated meter.",
};

/** Level alert for one room from a recording. `source` is whatever fingerprinting/diagnosis found, or a prompt to find out. */
export function levelCandidate(r: LevelReading, source: string, cfg: ScreeningConfig = DEFAULT_SCREENING): Candidate {
  const band = r.band;
  const sev = r.severity;
  const edge = r.urgent ? cfg.urgent.leqDb : bandLowerEdge(classifyBand(r.basis === "estimate" ? r.low : r.value, cfg), cfg);
  const clearBelow = (Number.isFinite(edge) ? edge : 0) - cfg.hysteresisDb;
  const driver = r.basis === "estimate" ? r.low : r.value;
  const title = r.urgent ? "Urgent: configured safety level exceeded" : `${BAND_LABEL[classifyBand(driver, cfg)]} background noise`;
  return {
    key: "level", severity: sev, title,
    reading: r.basis === "calibrated" ? `${r.value} dB (calibrated, single-point)` : `≈ ${r.value} dB (uncalibrated estimate, ${r.low}–${r.high})`,
    basis: r.status, source,
    explanation: r.urgent
      ? `A calibrated reading is at or above the urgent level you configured (${cfg.urgent.leqDb} dB). This is a safety-style alert, separate from meeting-room comfort.`
      : `Meeting-room screening bands: quiet below ${cfg.bands[0]} dB, acceptable to ${cfg.bands[1]}, caution to ${cfg.bands[2]}, high concern to ${cfg.bands[3]}, priority investigation above. These are indicative screening values, not hearing-safety limits.`,
    action: sev === "red" ? "Reduce exposure now: leave or turn the source down, then have the level checked with a calibrated meter."
      : sev === "orange" ? "Find and reduce the main noise source (close doors, switch off or move equipment, check ventilation), then record again."
      : "Check for an obvious noise source (fan, AC, equipment, corridor) and record again at the same spot.",
    reassess: "Record 30 seconds of room noise again at the same place, with the room empty and the same device and settings, after any change.",
    escalation: ESCALATION[sev],
    value: driver, clearBelow,
  };
}

export function clippingCandidate(active: boolean, source = "Input level too high (gain or talker distance)"): Candidate {
  return {
    key: "clipping", severity: active ? "yellow" : "green", title: "Microphone input is overloaded", reading: active ? "Peaks reach full scale" : "No clipping", basis: "Relative input level (dBFS)",
    source, explanation: "The microphone signal is hitting the top of its range, which distorts speech and makes echo cancellers work badly.",
    action: "Turn the input gain down, move the microphone away from the loudest talker, or move the talker back.", reassess: "Speak at normal volume for 20 seconds and check that peaks stay below about −6 dBFS.",
    escalation: ESCALATION.yellow, value: active ? 1 : 0, clearBelow: 0.5,
  };
}

export function feedbackCandidate(active: boolean, hz: number | null): Candidate {
  return {
    key: "feedback", severity: active ? "orange" : "green", title: "Possible speaker feedback (a steady tone)", reading: active && hz ? `Persistent tone near ${Math.round(hz)} Hz` : "No steady tone",
    basis: "Spectral analysis of the microphone signal (indicator, not proof)", source: "Speaker-to-microphone loop",
    explanation: "A narrow tone that stays strong for several seconds is the typical signature of a feedback loop. It can also be a real hum or whistle, so treat this as an indicator.",
    action: "Turn speaker volume or microphone gain down, mute unused microphones and keep microphones away from the speaker fronts.", reassess: "Open the microphones again at meeting volume for 30 seconds and see whether the tone returns.",
    escalation: ESCALATION.orange, value: active ? 1 : 0, clearBelow: 0.5,
  };
}
