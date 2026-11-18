/**
 * Mitigation Centre engine. Three levels:
 *   1 = free / no-purchase changes, 2 = affordable additions, 3 = professional help.
 * COST HONESTY: an action's cost is only ever "free" or "needs local quote". This module never invents prices;
 * indicative placeholder prices, where shown, come from the marketing-catalogue file and are labelled as placeholders.
 */
import { computeHealth, type HealthInput, type HealthResult } from "./health";

export type Level = 1 | 2 | 3;
export type Difficulty = "easy" | "moderate" | "needs a professional";
export type Cost = "free" | "needs local quote";
export type Priority = "do first" | "next" | "later";
export type IssueId = "noise" | "reverb" | "intelligibility" | "feedback" | "clipping" | "connection" | "coverage" | "overlap";

export interface Action {
  id: string; issue: IssueId; level: Level;
  problem: string; action: string; cost: Cost; benefit: string; difficulty: Difficulty; limitations: string;
}
export interface PlannedAction extends Action { priority: Priority; reason: string; done: boolean; doneAt?: string }

const A = (a: Action) => a;
export const ACTIONS: Action[] = [
  // noise
  A({ id: "n1", issue: "noise", level: 1, problem: "Background noise", action: "Switch off or move the loudest nearby source (fan, projector, vending machine) during meetings and close doors and windows.", cost: "free", benefit: "Often the largest single drop in room noise.", difficulty: "easy", limitations: "Only helps if the source can be switched off or moved." }),
  A({ id: "n2", issue: "noise", level: 1, problem: "Background noise", action: "Move the microphone closer to talkers (about 30–60 cm for a desk mic) so speech rises above the noise.", cost: "free", benefit: "Each halving of distance gives about 6 dB more speech level in free space.", difficulty: "easy", limitations: "Does not lower the noise itself." }),
  A({ id: "n3", issue: "noise", level: 2, problem: "Background noise", action: "Add door seals or a door sweep, and soft furnishing on the side facing the noise.", cost: "needs local quote", benefit: "Reduces leakage from corridors and neighbouring rooms.", difficulty: "moderate", limitations: "Gaps are only part of the path; walls and ceilings also leak." }),
  A({ id: "n4", issue: "noise", level: 3, problem: "Persistent noise from building services or outside", action: "Ask an acoustic consultant to measure with a calibrated meter and identify the transmission path (HVAC, structure-borne, façade).", cost: "needs local quote", benefit: "Finds the real cause so money is not spent on the wrong fix.", difficulty: "needs a professional", limitations: "Fixes may involve the building owner." }),
  // reverb
  A({ id: "r1", issue: "reverb", level: 1, problem: "Echo or reverberation", action: "Close curtains or blinds, bring in rugs or soft items, and move speakers and microphones away from bare walls and glass.", cost: "free", benefit: "Soft surfaces absorb reflections that blur speech.", difficulty: "easy", limitations: "A modest change; large hard rooms need more." }),
  A({ id: "r2", issue: "reverb", level: 2, problem: "Echo or reverberation", action: "Add acoustic panels at first-reflection points on the side walls and the wall behind talkers, plus a ceiling cloud if the ceiling is hard.", cost: "needs local quote", benefit: "Shortens the reverberation time, improving speech clarity.", difficulty: "moderate", limitations: "Thin foam mainly absorbs high frequencies; boomy low-frequency echo needs thicker treatment." }),
  A({ id: "r3", issue: "reverb", level: 3, problem: "Severe reverberation (large or very hard room)", action: "Commission an acoustic design with a measured RT60 before and after.", cost: "needs local quote", benefit: "A design sized to the room, with a verified result.", difficulty: "needs a professional", limitations: "Takes time and may need approvals." }),
  // intelligibility
  A({ id: "i1", issue: "intelligibility", level: 1, problem: "Hard to hear or understand speech", action: "Seat people closer to the microphone, ask for one speaker at a time, and set the speaker volume to a comfortable level rather than the maximum.", cost: "free", benefit: "Raises speech above the noise and cuts overlap.", difficulty: "easy", limitations: "Depends on meeting habits." }),
  A({ id: "i2", issue: "intelligibility", level: 2, problem: "Hard to hear or understand speech", action: "Use a dedicated conference microphone or speakerphone sized for the room, placed centrally on the table.", cost: "needs local quote", benefit: "Better pickup than a laptop microphone for groups.", difficulty: "easy", limitations: "Cannot fix a very noisy or very echoey room on its own." }),
  A({ id: "i3", issue: "intelligibility", level: 3, problem: "Large room or critical speech (hearings, teaching halls)", action: "Have an AV integrator design microphone coverage and a speech-reinforcement layout.", cost: "needs local quote", benefit: "Even coverage and verified speech intelligibility.", difficulty: "needs a professional", limitations: "Design depends on room measurements." }),
  // feedback
  A({ id: "f1", issue: "feedback", level: 1, problem: "Whistling or feedback", action: "Turn the speaker volume down, point microphones away from speakers, and mute microphones that are not in use.", cost: "free", benefit: "Stops the loop between speaker and microphone.", difficulty: "easy", limitations: "A temporary fix if the system gain is set too high." }),
  A({ id: "f2", issue: "feedback", level: 2, problem: "Whistling or feedback", action: "Use a device with built-in echo cancellation, or a mixer with feedback suppression.", cost: "needs local quote", benefit: "Allows more volume before feedback starts.", difficulty: "moderate", limitations: "Tuning matters; poor placement still causes feedback." }),
  A({ id: "f3", issue: "feedback", level: 3, problem: "Persistent feedback in a fixed installation", action: "Ask an AV integrator to tune the DSP (gain structure, echo cancellation, notch filters).", cost: "needs local quote", benefit: "Stable operation across the room.", difficulty: "needs a professional", limitations: "Needs access to the installed system." }),
  // clipping
  A({ id: "c1", issue: "clipping", level: 1, problem: "Microphone input overloads (clipping)", action: "Lower the microphone input level in the system sound settings and speak or play from a little further away.", cost: "free", benefit: "Removes harsh distortion.", difficulty: "easy", limitations: "Too low a level adds noise; adjust in small steps." }),
  // connection
  A({ id: "k1", issue: "connection", level: 1, problem: "Audio drops, devices not recognised", action: "Select the correct input and output device in the meeting app and system settings, update the app, and reconnect cables or Bluetooth.", cost: "free", benefit: "Fixes most dropped or wrong-device problems.", difficulty: "easy", limitations: "Hardware faults need replacement." }),
  A({ id: "k2", issue: "connection", level: 2, problem: "Repeated drops over wireless", action: "Replace Bluetooth with a wired or USB connection for the room's main device.", cost: "needs local quote", benefit: "More stable than wireless in busy rooms.", difficulty: "easy", limitations: "Needs cabling." }),
  // coverage
  A({ id: "v1", issue: "coverage", level: 2, problem: "A laptop or single microphone for a big group", action: "Add a table or ceiling microphone and a room speaker sized for the group.", cost: "needs local quote", benefit: "Everyone is picked up at a similar level.", difficulty: "moderate", limitations: "Check placement relative to the speakers." }),
  // overlap
  A({ id: "o1", issue: "overlap", level: 1, problem: "Voices overlap", action: "Agree a simple turn-taking rule and use a hand-raise or mute-by-default habit for remote participants.", cost: "free", benefit: "Cheap and immediate.", difficulty: "easy", limitations: "Relies on people following it." }),
];

export interface Detected { issue: IssueId; why: string; weight: number }

/** Work out which issues exist from the same evidence the health score uses. */
export function detectIssues(i: HealthInput, h?: HealthResult | null): Detected[] {
  const out = new Map<IssueId, Detected>();
  const add = (issue: IssueId, why: string, weight: number) => { const o = out.get(issue); if (!o || o.weight < weight) out.set(issue, { issue, why, weight }); };
  const hh = h ?? computeHealth(i);
  const cat = (id: string) => hh.categories.find((c) => c.id === id);
  const p = i.problems ?? [];
  if (i.ambient && i.ambient.splDb > 45) add("noise", `Room noise ${i.ambient.calibrated ? "measured" : "estimated"} around ${Math.round(i.ambient.splDb)} dB${i.ambient.calibrated ? "" : " (uncalibrated)"}`, Math.min(100, 100 - (cat("noise")?.score ?? 60)));
  else if (p.includes("background_noise")) add("noise", "Background noise was reported", 45);
  if (i.rt60Ratio !== undefined && i.rt60Ratio > 1.2) add("reverb", `Calculated reverberation is ${i.rt60Ratio.toFixed(1)}× the target`, Math.min(100, 100 - (cat("reverb")?.score ?? 60)));
  else if (i.clap === "lingers" || p.includes("echo") || p.includes("reverb")) add("reverb", "Echo was reported or a clap rings on", 50);
  if (i.snrDb !== undefined && i.snrDb < 25) add("intelligibility", `Speech is only ${Math.round(i.snrDb)} dB above room noise on your recordings`, Math.min(100, 100 - (cat("intelligibility")?.score ?? 60)));
  else if (p.includes("poor_mic_pickup") || p.includes("distorted_speech") || i.repeats === "often") add("intelligibility", "People are hard to hear or ask for repeats", 45);
  if (p.includes("feedback") || i.readiness?.feedback) add("feedback", i.readiness?.feedback ? "A steady tone was detected on the microphone" : "Feedback was reported", 60);
  if (i.readiness?.clipping || p.includes("distorted_speech")) { if (i.readiness?.clipping) add("clipping", "The microphone input overloads", 40); }
  if (p.some((x) => ["bt_disconnect", "device_not_recognised", "intermittent_audio"].includes(x)) || i.readiness?.micFound === false || i.readiness?.signal === false) add("connection", i.readiness?.micFound === false ? "No microphone found by the browser" : "Connection problems were reported or no signal was detected", 55);
  if ((i.equipment ?? []).includes("laptop_mic") && (i.occupants ?? 0) > 4 && !(i.equipment ?? []).some((e) => ["conf_bar", "ceiling_mic", "dsp_mixer"].includes(e))) add("coverage", `A laptop microphone is the only pickup for about ${i.occupants} people`, 35);
  if (p.includes("overlapping_voices")) add("overlap", "Overlapping voices were reported", 25);
  return [...out.values()].sort((a, b) => b.weight - a.weight);
}

/** Build the plan: severity of the issue decides priority; free steps always come before paid ones for the same issue. */
export function planMitigation(detected: Detected[], done: Record<string, string> = {}): PlannedAction[] {
  const plan: PlannedAction[] = [];
  detected.forEach((d, idx) => {
    const acts = ACTIONS.filter((a) => a.issue === d.issue).sort((a, b) => a.level - b.level);
    // Level 3 only when the issue is heavy (weight ≥ 50) or the free/affordable steps are already done.
    const lowerDone = acts.filter((a) => a.level < 3).every((a) => done[a.id]);
    for (const a of acts) {
      if (a.level === 3 && d.weight < 50 && !lowerDone) continue;
      const priority: Priority = a.level === 1 && idx < 3 ? "do first" : a.level <= 2 && idx < 3 ? "next" : "later";
      plan.push({ ...a, priority, reason: d.why, done: !!done[a.id], doneAt: done[a.id] });
    }
  });
  const order: Record<Priority, number> = { "do first": 0, next: 1, later: 2 };
  return plan.sort((a, b) => Number(a.done) - Number(b.done) || order[a.priority] - order[b.priority] || a.level - b.level);
}

export const LEVEL_LABEL: Record<Level, string> = { 1: "Level 1 · Free", 2: "Level 2 · Affordable", 3: "Level 3 · Professional" };
export const COST_LABEL: Record<Cost, string> = { free: "Free", "needs local quote": "Needs a local quote" };

/** Outstanding professional-help need: heavy issue with level 3 action. */
export const needsProfessional = (plan: PlannedAction[]) => plan.some((a) => a.level === 3 && !a.done);
