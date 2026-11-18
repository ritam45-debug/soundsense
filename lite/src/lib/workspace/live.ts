import { clippingCandidate, feedbackCandidate, levelCandidate, screenLevel, type AlertEvent, type LevelReading } from "../acoustics/screening";
import { NOISE_LABEL, type FingerprintResult, type FeedbackState } from "../acoustics/audio";
import type { Calibration, LevelStats } from "../acoustics/measurement";
import { observe } from "./ops";
import type { Workspace } from "./store";

export interface LiveInput { stats: LevelStats | null; clipping: boolean; feedback: FeedbackState; fingerprint: FingerprintResult | null }

/** Likely source text for an alert: only claims what the fingerprint can support. */
export function sourceText(fp: FingerprintResult | null): string {
  if (fp?.status === "ok" && fp.top && fp.top.band !== "low") return `Possibly ${NOISE_LABEL[fp.top.id].toLowerCase()} (${fp.top.band} confidence, heuristic)`;
  return "Source not identified yet. Listen for fans, air conditioning, equipment, corridor or street noise";
}

/** One evaluation step of live monitoring. Needs ≥10 s of level data (stats) before any level alert is raised. */
export function evaluateLive(w: Workspace, roomId: string | null, live: LiveInput, cal: Calibration, nowMs = Date.now()): { events: AlertEvent[]; reading: LevelReading | null } {
  const cfg = w.settings.screening; const events: AlertEvent[] = [];
  let reading: LevelReading | null = null;
  if (live.stats) {
    reading = screenLevel(live.stats, cal, cfg);
    events.push(...observe(w, roomId, "level", levelCandidate(reading, sourceText(live.fingerprint), cfg), nowMs));
  }
  events.push(...observe(w, roomId, "clipping", clippingCandidate(live.clipping), nowMs));
  events.push(...observe(w, roomId, "feedback", feedbackCandidate(live.feedback.active, live.feedback.hz), nowMs));
  return { events, reading };
}
