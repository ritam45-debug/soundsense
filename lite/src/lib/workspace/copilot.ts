/**
 * Room copilot: rule-based answers built from the room's own evidence (health score, alerts, mitigation plan).
 * It is NOT an AI language model. A real model needs a server to hold an API key safely, which a static site does not have.
 */
import type { HealthResult } from "../acoustics/health";
import { needsProfessional, type Detected, type IssueId, type PlannedAction } from "../acoustics/mitigation";
import type { AlertRec } from "../acoustics/screening";
import type { ReadinessRecord, Room } from "./store";

export interface CopilotCtx { room: Room | null; health: HealthResult | null; detected: Detected[]; plan: PlannedAction[]; alerts: AlertRec[]; readiness: ReadinessRecord | null; hasDimensions: boolean }
export interface CopilotReply { answer: string; immediate: string[]; longer: string[]; why: string | null; followUp: string | null; professional: boolean }

const TOPIC: [RegExp, IssueId][] = [
  [/echo|reverb|boom|hollow|ring/i, "reverb"], [/noise|loud|quiet|hum|fan|\bac\b|air.?con|hvac/i, "noise"],
  [/hear|understand|clear|clarity|intellig|mic|speech|mumbl|repeat/i, "intelligibility"], [/feedback|whistl|squeal|screech/i, "feedback"],
  [/clip|distort|overload/i, "clipping"], [/bluetooth|connect|drop|recogni[sz]e|cut/i, "connection"],
];
const clip = (s: string, n = 140) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export function copilotReply(q: string, c: CopilotCtx): CopilotReply {
  const name = c.room?.name ?? "this room";
  const none: CopilotReply = { answer: "", immediate: [], longer: [], why: null, followUp: null, professional: false };
  if (!c.room) return { ...none, answer: "Pick a room first so I can use its evidence.", followUp: "Which room do you want help with?" };
  if (/cost|price|budget|how much|cheap/i.test(q)) return { ...none, answer: `I can't give prices: they depend on your area and supplier. In ${name}, Level 1 steps are free; Level 2 and 3 steps need a local quote.`, immediate: c.plan.filter((p) => p.level === 1 && !p.done).slice(0, 2).map((p) => clip(p.action)), longer: ["Ask two or three local suppliers for quotes on the Level 2 items."], followUp: "What is your rough budget, so I can order the steps?" };
  if (/ready|tomorrow|today.*meeting|meeting.*today/i.test(q)) {
    if (!c.readiness) return { ...none, answer: `${name} has not had a readiness check yet.`, followUp: "Do you have 10 seconds to run Test my room?" };
    return { ...none, answer: `Last readiness check (${new Date(c.readiness.at).toLocaleDateString()}): ${c.readiness.verdict === "ready" ? "ready" : c.readiness.verdict === "warnings" ? "ready with warnings" : "needs attention"}.`, immediate: c.readiness.findings.slice(0, 3), longer: [], why: "From your last Test my room result.", professional: false, followUp: null };
  }
  if (/score|health|why.*low|points/i.test(q) && c.health) {
    if (c.health.status !== "ok") return { ...none, answer: "There is not enough evidence for a score yet.", immediate: c.health.missing.slice(0, 2), followUp: null };
    const d = c.health.deductions.slice(0, 3); return { ...none, answer: `${name} scores ${c.health.overall}/100.`, why: d.map((x) => `${x.text} (−${x.points})`).join("; ") || "No points lost on the evidence we have.", immediate: c.health.opportunities.slice(0, 2).map((o) => o.text), longer: [] };
  }
  const topic = TOPIC.find(([re]) => re.test(q))?.[1];
  const issue = (topic && c.detected.find((d) => d.issue === topic)) ?? (topic ? undefined : c.detected[0]);
  if (!c.detected.length && (!c.health || c.health.status !== "ok")) {
    const m = c.health?.missing[0]; return { ...none, answer: `I don't have enough evidence about ${name} yet to say what is wrong.`, followUp: m ? m.split(": ")[1] ?? m : "Can you record 30 seconds of room noise?" };
  }
  if (topic && !issue) {
    const nothing = `I don't see evidence of a ${topic} problem in ${name} right now.`;
    return { ...none, answer: nothing, followUp: topic === "reverb" && !c.hasDimensions ? "How big is the room (length × width × height) and what are the walls and floor made of?" : "What exactly do you hear, and when?" };
  }
  if (!issue) return { ...none, answer: `Nothing stands out in ${name} from the evidence we have.`, followUp: null };
  const steps = c.plan.filter((p) => p.issue === issue.issue && !p.done);
  const immediate = steps.filter((p) => p.level === 1).slice(0, 2).map((p) => clip(p.action));
  const longer = steps.filter((p) => p.level >= 2).slice(0, 2).map((p) => `${clip(p.action)}${p.cost === "needs local quote" ? " (needs a local quote)" : ""}`);
  const urgent = c.alerts.find((a) => a.status !== "resolved" && (a.severity === "red" || a.severity === "orange"));
  return {
    answer: `Main issue in ${name}: ${issue.issue === "intelligibility" ? "speech clarity" : issue.issue}.${urgent ? ` There is an open ${urgent.severity === "red" ? "urgent" : "high-concern"} alert, so start there.` : ""}`,
    immediate, longer, why: issue.why, professional: needsProfessional(steps),
    followUp: issue.issue === "reverb" && !c.hasDimensions ? "How big is the room (length × width × height) and what are the walls and floor made of?" : issue.issue === "noise" && !c.alerts.length ? "Does the noise come from a fixed source (air conditioning, equipment) or does it come and go?" : null,
  };
}
