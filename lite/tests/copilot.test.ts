import { describe, expect, it } from "vitest";
import { copilotReply, type CopilotCtx } from "@/lib/workspace/copilot";
import { computeHealth } from "@/lib/acoustics/health";
import { detectIssues, planMitigation } from "@/lib/acoustics/mitigation";
const room: any = { id: "r", name: "Board room" };
const ctxFrom = (input: any, extra: Partial<CopilotCtx> = {}): CopilotCtx => { const health = computeHealth(input); const detected = detectIssues(input, health); return { room, health, detected, plan: planMitigation(detected), alerts: [], readiness: null, hasDimensions: false, ...extra }; };
describe("room copilot", () => {
  it("asks one question and does not diagnose when it has no evidence", () => {
    const r = copilotReply("what's wrong?", ctxFrom({}));
    expect(r.answer).toMatch(/don.t have enough evidence/i); expect(r.followUp).toBeTruthy(); expect(r.immediate).toEqual([]);
  });
  it("separates immediate and longer-term steps and explains the reasoning", () => {
    const r = copilotReply("why is there an echo?", ctxFrom({ ambient: { splDb: 40, calibrated: true }, rt60Ratio: 2.2, problems: ["echo"] }));
    expect(r.immediate.length).toBeGreaterThan(0); expect(r.longer.length).toBeGreaterThan(0); expect(r.why).toMatch(/reverberation|echo/i);
    expect(r.followUp).toMatch(/How big is the room/);
  });
  it("never invents prices", () => {
    const r = copilotReply("how much will it cost?", ctxFrom({ ambient: { splDb: 60, calibrated: true }, rt60Ratio: 2 }));
    expect(r.answer).toMatch(/can't give prices/); expect(JSON.stringify(r)).not.toMatch(/[$₹€£]\s?\d/);
  });
  it("recommends a professional for heavy problems only", () => {
    expect(copilotReply("noise?", ctxFrom({ ambient: { splDb: 70, calibrated: true }, rt60Ratio: 1 })).professional).toBe(true);
    expect(copilotReply("noise?", ctxFrom({ ambient: { splDb: 47, calibrated: true }, rt60Ratio: 1 })).professional).toBe(false);
  });
  it("answers a topic honestly when no such problem is evidenced", () => {
    const r = copilotReply("is there feedback?", ctxFrom({ ambient: { splDb: 40, calibrated: true }, rt60Ratio: 1 }));
    expect(r.answer).toMatch(/don't see evidence/);
  });
  it("answers are short", () => {
    const r = copilotReply("what should I fix first?", ctxFrom({ ambient: { splDb: 60, calibrated: false }, rt60Ratio: 2, problems: ["echo"] }));
    expect(JSON.stringify(r).split(/\s+/).length).toBeLessThan(160);
  });
  it("uses readiness results when asked about a meeting", () => {
    const r = copilotReply("are we ready for the meeting?", ctxFrom({}, { readiness: { at: "2026-01-01", verdict: "warnings", findings: ["x"] } as any }));
    expect(r.answer).toMatch(/ready with warnings/);
  });
});
