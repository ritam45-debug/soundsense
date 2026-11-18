/** Screenshots of the main 2.0 screens, from a seeded demo workspace (clearly demo data, not real measurements). */
import fs from "node:fs";
import { U, launch } from "./lib";
const WS = "soundsense-lite-ws-v1"; const now = Date.now(); const iso = (d: number) => new Date(now - d * 86_400_000).toISOString();
const room = (id: string, name: string, building: string, floor: string, type: string) => ({ id, name, building, floor, department: "Operations", roomType: type, occupants: 10, lengthM: 8, widthM: 5, heightM: 3, assessmentId: null, notes: "Demo room", createdAt: iso(60) });
const rd = (id: string, roomId: string, d: number, v: number) => ({ id, roomId, at: iso(d), source: "live", basis: "estimate", value: v, low: v - 20, high: v + 20, label: "demo" });
const seed = { v: 1, rooms: [room("r1", "Board room", "HQ", "3", "conference_room"), room("r2", "Training hall", "Annex", "1", "auditorium")],
  readings: [rd("a", "r1", 40, 61), rd("b", "r1", 20, 58), rd("c", "r1", 2, 52), rd("d", "r2", 10, 47), rd("e", "r2", 3, 46)],
  snapshots: [{ id: "s1", roomId: "r1", at: iso(40), overall: 52, categories: {}, input: {} }, { id: "s2", roomId: "r1", at: iso(20), overall: 58, categories: {}, input: {} }, { id: "s3", roomId: "r1", at: iso(2), overall: 66, categories: {}, input: {} }],
  alerts: [{ id: "al1", roomId: "r1", key: "level", severity: "orange", title: "High concern background noise", reading: "≈ 72 dB (uncalibrated estimate, 52–92)", basis: "Uncalibrated estimate ≈ 72 dB (could be 52–92). Confirm with a sound level meter before acting on the number.", source: "Possibly fan or ventilation noise (medium confidence, heuristic)", explanation: "Meeting-room screening bands: quiet below 35 dB, acceptable to 45, caution to 50, high concern to 55, priority investigation above. These are indicative screening values, not hearing-safety limits.", action: "Find and reduce the main noise source (close doors, switch off or move equipment, check ventilation), then record again.", reassess: "Record 30 seconds of room noise again at the same place.", escalation: "Tell the person who looks after this room and plan the recommended fix.", status: "open", createdAt: iso(1), updatedAt: iso(0), lastSeenAt: iso(0), count: 4, clearBelow: 48 }],
  notifications: [{ id: "n1", at: iso(1), roomId: "r1", alertId: "al1", type: "created", title: "Board room: High concern background noise", body: "≈ 72 dB (uncalibrated estimate, 52–92). Find and reduce the main noise source…", read: false }],
  mitigationDone: { r1: {} }, schedules: [{ id: "sc1", roomId: "r2", everyDays: 30, nextDue: iso(1), note: "" }], goals: [], maps: { r1: [{ id: "m1", kind: "mic", x: 50, y: 50 }, { id: "m2", kind: "speaker", x: 50, y: 8 }, { id: "m3", kind: "noise", x: 90, y: 20, label: "AC unit" }, { id: "m4", kind: "seat", x: 25, y: 70 }, { id: "m5", kind: "seat", x: 75, y: 70 }, { id: "m6", kind: "door", x: 5, y: 95 }] },
  audit: [], consults: [], suppliers: [], readiness: {}, settings: undefined };
const { browser, ctx } = await launch();
fs.mkdirSync("docs/screenshots", { recursive: true });
for (const [tag, vp] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const) {
  const page = await (await browser.newContext({ viewport: vp, permissions: ["microphone"] })).newPage();
  await page.goto(U("/app/")); await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [WS, JSON.stringify(seed)]);
  for (const [name, path] of [["dashboard", "/app/"], ["rooms", "/app/rooms/"], ["room-detail", "/app/rooms/?id=r1"], ["monitor", "/app/monitor/"], ["alerts", "/app/notifications/"], ["mitigation", "/app/mitigation/?room=r1"], ["analytics", "/app/analytics/"], ["map", "/app/map/?room=r1"], ["passport", "/app/passport/"], ["readiness", "/app/readiness/"], ["roi", "/app/roi/"], ["marketplace", "/app/marketplace/"], ["settings", "/app/settings/"]] as const) {
    await page.goto(U(path)); await page.waitForLoadState("networkidle"); await page.waitForTimeout(400);
    await page.screenshot({ path: `docs/screenshots/${tag}-${name}.png`, fullPage: tag === "desktop" ? false : false });
  }
}
await browser.close(); console.log("done");
