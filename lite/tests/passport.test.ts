import { describe, expect, it } from "vitest";
import { buildPassport, decodePassport, encodePassport, needsPasscode, QR_LIMIT, type PassportSource } from "@/lib/workspace/passport";
const src: PassportSource = { name: "Board room", building: "HQ", floor: "3", roomType: "Conference room", score: 72, scoreBand: "Fair", scoreBasis: "Based on 4 of 5 areas.", noise: { value: 48, calibrated: false }, openAlerts: 1, topSeverity: "yellow", actionsDone: 2, actionsTotal: 5, readiness: "Ready with warnings", assessedAt: "2026-11-01T10:00:00Z", nextDue: "2027-02-01T00:00:00Z", notes: "Projector fan is loud." };
describe("room passport", () => {
  it("only includes the fields the owner chose", () => {
    const d = buildPassport(src, ["score", "location"]); expect(Object.keys(d.f).sort()).toEqual(["location", "score"]);
    expect(JSON.stringify(buildPassport(src, ["score"]))).not.toMatch(/Projector|HQ/);
  });
  it("labels uncalibrated noise as an estimate", () => { expect(buildPassport(src, ["noise"]).f.noise).toMatch(/uncalibrated estimate/); });
  it("round-trips unencrypted, including non-Latin text", async () => {
    const t = await encodePassport(buildPassport({ ...src, name: "सभागार ♪" }, ["score"])); expect(needsPasscode(t)).toBe(false);
    expect((await decodePassport(t)).n).toBe("सभागार ♪");
  });
  it("encrypts with a passcode; wrong or missing passcode fails; tampering is detected", async () => {
    const d = buildPassport(src, ["score", "notes"]); const t = await encodePassport(d, "correct horse");
    expect(needsPasscode(t)).toBe(true); expect(t).not.toMatch(/Projector/);
    expect((await decodePassport(t, "correct horse")).f.notes).toBe("Projector fan is loud.");
    await expect(decodePassport(t, "wrong")).rejects.toThrow(/Wrong passcode/); await expect(decodePassport(t)).rejects.toThrow(/Enter the passcode/);
    const bad = t.slice(0, -4) + (t.endsWith("AAAA") ? "BBBB" : "AAAA"); await expect(decodePassport(bad, "correct horse")).rejects.toThrow(/Wrong passcode|altered/);
  });
  it("rejects junk links", async () => { await expect(decodePassport("zzz")).rejects.toThrow(/damaged/); await expect(decodePassport("p.@@@")).rejects.toThrow(/damaged/); });
  it("a full passport still fits a scannable QR", async () => { const t = await encodePassport(buildPassport(src, ["location", "type", "score", "noise", "alerts", "actions", "readiness", "assessed", "next", "notes"]), "pass"); expect(t.length).toBeLessThan(QR_LIMIT); });
});
