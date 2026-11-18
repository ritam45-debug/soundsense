import { describe, expect, it } from "vitest";
import { healthInputFor } from "@/lib/workspace/derive";
import { addRoom, emptyWs } from "@/lib/workspace/store";
import { addReading } from "@/lib/workspace/ops";

const asmt: any = { answers: { q2_problems: ["echo", "background_noise"], f_clap: "lingers", q7_repeat: "often", q9_equipment: ["laptop_mic"], q4_occupants: 12, environment: "conference_room" },
  room: { computed: { ratio: 2.1 } },
  measurements: [
    { kind: "ambient", started_at: "2026-01-01T10:00:00Z", stats: { leqDb: -50, n: 100 }, calibration: { status: "uncalibrated" } },
    { kind: "speech", started_at: "2026-01-01T10:01:00Z", stats: { leqDb: -38, n: 100 }, calibration: { status: "uncalibrated" } },
  ] };
describe("health input derivation", () => {
  it("collects evidence from the assessment, its recordings and the readiness check", () => {
    const w = emptyWs(); const r = addRoom(w, { name: "A", roomType: "conference_room" });
    const i = healthInputFor(w, r, asmt);
    expect(i.problems).toEqual(["echo", "background_noise"]); expect(i.rt60Ratio).toBe(2.1); expect(i.snrDb).toBe(12); expect(i.repeats).toBe("often"); expect(i.occupants).toBe(12);
    expect(i.ambient).toEqual({ splDb: 50, calibrated: false }); // −50 dBFS + assumed 100 dB offset, labelled uncalibrated
  });
  it("prefers a newer live reading over an older recording, and keeps calibration status", () => {
    const w = emptyWs(); const r = addRoom(w, { name: "A" });
    addReading(w, { roomId: r.id, source: "live", basis: "calibrated", value: 41, label: "x" });
    expect(healthInputFor(w, r, asmt).ambient).toEqual({ splDb: 41, calibrated: true });
  });
  it("returns nothing invented when no evidence exists", () => {
    const w = emptyWs(); const r = addRoom(w, { name: "A" });
    const i = healthInputFor(w, r, null);
    expect(i.ambient).toBeUndefined(); expect(i.rt60Ratio).toBeUndefined(); expect(i.problems).toBeUndefined();
  });
  it("includes the readiness result", () => {
    const w = emptyWs(); const r = addRoom(w, { name: "A" });
    w.readiness[r.id] = { at: "x", verdict: "attention", micFound: false, speakerFound: true, speakerHeard: null, signal: false, clipping: false, feedback: false, noiseDb: null, noiseBasis: "unavailable", online: true, slowLink: null, echoReported: true, findings: [] };
    const i = healthInputFor(w, r, null);
    expect(i.readiness?.micFound).toBe(false); expect(i.problems).toContain("echo");
  });
});

import { evidenceFor } from "@/lib/workspace/derive";
describe("evidence for comparison", () => {
  it("lists assessment recordings and live readings on one scale, newest first, with honest basis", () => {
    const w = emptyWs(); const r = addRoom(w, { name: "A" });
    addReading(w, { roomId: r.id, source: "live", basis: "estimate", value: 55, label: "x", at: "2026-02-01T00:00:00Z" });
    addReading(w, { roomId: r.id, source: "readiness", basis: "estimate", value: 99, label: "x" });
    const ev = evidenceFor(w, r, asmt);
    expect(ev.map((e) => e.label.split(" ")[0])).toEqual(["Live", "Speech", "Room"]);
    expect(ev.find((e) => e.kind === "ambient" && e.label.startsWith("Room"))!.value).toBe(50);
    expect(ev.every((e) => e.basis === "estimate" && e.unit === "dB")).toBe(true);
    expect(ev.some((e) => e.value === 99)).toBe(false);
  });
});
