/** Meeting Readiness verdict. Every finding states what was actually checked; nothing is guessed. */
import type { Severity } from "./screening";
export type Verdict = "ready" | "warnings" | "attention";
export const VERDICT_LABEL: Record<Verdict, string> = { ready: "READY", warnings: "READY WITH WARNINGS", attention: "NEEDS ATTENTION" };
export interface ReadinessInput {
  micFound: boolean; speakerFound: boolean | null; speakerHeard: boolean | null;
  signal: boolean; clipping: boolean; feedback: boolean;
  noiseSeverity: Severity | null; noiseDb: number | null; noiseCalibrated: boolean;
  online: boolean | null; slowLink: boolean | null; echoReported: boolean;
}
export interface Finding { level: "ok" | "warn" | "fail"; text: string; fix?: string }
export function evaluateReadiness(i: ReadinessInput): { verdict: Verdict; findings: Finding[] } {
  const f: Finding[] = [];
  const add = (level: Finding["level"], text: string, fix?: string) => f.push({ level, text, fix });
  if (!i.micFound) add("fail", "No microphone was found by the browser.", "Plug in or enable a microphone and allow access for this site.");
  else add("ok", "A microphone was found.");
  if (i.micFound) {
    if (!i.signal) add("fail", "The microphone gave almost no signal.", "Check it is not muted, covered or set to the wrong input.");
    else add("ok", "The microphone is picking up sound.");
    if (i.clipping) add("warn", "The microphone input overloads (clipping).", "Lower the input level or move the microphone away from loud talkers.");
    if (i.feedback) add("fail", "A steady tone suggests speaker feedback.", "Turn the speaker down, mute unused microphones, move microphones away from speakers.");
    else if (i.signal) add("ok", "No feedback tone was detected during the test.");
  }
  if (i.speakerHeard === false) add("fail", "You reported not hearing the test tone.", "Check the output device, cables and volume in the meeting app and system settings.");
  else if (i.speakerHeard === true) add("ok", "You confirmed hearing the test tone.");
  else add("warn", "The speaker was not tested.", "Play the test tone and tell us whether you heard it.");
  if (i.speakerFound === false) add("warn", "No speaker (audio output) device was listed.", "Some browsers do not list outputs; the tone test is the reliable check.");
  if (i.noiseSeverity === "orange" || i.noiseSeverity === "red") add("fail", `Room noise looks high (about ${i.noiseDb} dB${i.noiseCalibrated ? "" : ", uncalibrated estimate"}).`, "Reduce the noise source and test again.");
  else if (i.noiseSeverity === "yellow") add("warn", `Room noise is on the high side (about ${i.noiseDb} dB${i.noiseCalibrated ? "" : ", uncalibrated estimate"}).`, "Close doors and switch off unneeded equipment.");
  else if (i.noiseSeverity === "green") add("ok", `Room noise looks acceptable (about ${i.noiseDb} dB${i.noiseCalibrated ? "" : ", uncalibrated estimate"}).`);
  if (i.online === false) add("fail", "The browser reports no internet connection.", "Reconnect before the meeting.");
  else if (i.slowLink) add("warn", "The connection reports as slow.", "Use a wired connection or move closer to the access point.");
  else if (i.online === true) add("ok", "The browser reports an internet connection (this is not a speed test).");
  if (i.echoReported) add("warn", "You reported that others hear an echo.", "Use a device with echo cancellation, lower the speaker volume or use a headset.");
  const verdict: Verdict = f.some((x) => x.level === "fail") ? "attention" : f.some((x) => x.level === "warn") ? "warnings" : "ready";
  return { verdict, findings: f };
}
