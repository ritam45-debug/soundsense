/**
 * Browser E2E for SoundSense 2.0 features (Lite edition), against the exported static site under a sub-path.
 *   NEXT_PUBLIC_BASE_PATH=/soundsense npm run build && BASE_PATH=/soundsense PORT=4100 npm run serve &
 *   E2E_BASE=http://localhost:4100/soundsense npx tsx e2e/run2.ts
 */
import fs from "node:fs";
import { BASE, U, check, launch, overflow, results, watch } from "./lib";

fs.mkdirSync("e2e/shots", { recursive: true });
const axeSrc = fs.readFileSync("node_modules/axe-core/axe.min.js", "utf8");
async function axe(p: any, name: string) {
  await p.evaluate(axeSrc);
  const r: any = await p.evaluate(() => (window as any).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } }));
  const bad = r.violations.filter((v: any) => v.impact === "serious" || v.impact === "critical");
  if (bad.length) throw new Error(`${name}: ` + bad.map((v: any) => `${v.id}(${v.nodes.length}) e.g. ${String(v.nodes[0].target)}`).join("; "));
  return `${r.violations.length} minor/moderate`;
}
const { browser, ctx } = await launch();
const p = await ctx.newPage();
const errs: string[] = []; watch(p, errs);
const requests: string[] = []; p.on("request", (r) => requests.push(r.url()));
const origin = new URL(BASE).origin;
const text = () => p.locator("main").innerText();
const WS = "soundsense-lite-ws-v1";
const wsData = () => p.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null"), WS);
let roomUrl = "";

console.log("Rooms, health score, mitigation");
await check("add a room; its health score honestly says 'Insufficient data'", async () => {
  await p.goto(U("/app/rooms/")); await p.getByRole("button", { name: /Add (your first )?room/ }).first().click();
  await p.fill("#rn", "Board room"); await p.fill("#rb", "HQ"); await p.fill("#rf", "3"); await p.getByRole("button", { name: "Save room" }).click();
  await p.waitForURL(/rooms\/?\?id=/); roomUrl = p.url(); await p.waitForSelector("text=Insufficient data");
  const t = await text(); if (/Acoustic health: (Healthy|Fair|Poor)/.test(t)) throw new Error("invented a score");
});
await check("link a sample assessment: score appears with evidence labels and deductions", async () => {
  await p.goto(U("/app/assessments/new/?sample=1")); await p.getByRole("button", { name: /Large glass conference room/ }).click(); await p.waitForSelector("text=Most likely problem area");
  await p.goto(roomUrl); await p.getByRole("button", { name: "Edit" }).click();
  const opt = await p.locator("#ra option").nth(1).getAttribute("value"); await p.selectOption("#ra", opt!); await p.getByRole("button", { name: "Save room" }).click();
  await p.waitForSelector("text=/Acoustic health: /"); await p.waitForSelector("text=Reported");
  await p.getByRole("button", { name: /why points were lost/ }).click(); await p.waitForSelector("text=/−\\d/");
  await p.screenshot({ path: "e2e/shots/room-health.png" });
});
await check("mitigation plan: free steps first; ticking one is remembered", async () => {
  await p.goto(U("/app/mitigation/")); await p.waitForSelector("text=Level 1 · Free");
  const first = await p.locator("li.card").first().innerText(); if (!/Level 1/.test(first)) throw new Error("first item is not a free step: " + first.slice(0, 80));
  const t = await text(); if (/[₹$]\s?\d/.test(t)) throw new Error("a price appears");
  await p.locator("li.card input[type=checkbox]").first().check(); await p.reload(); await p.waitForSelector("text=/1 of \\d+ done/");
});

console.log("\nLive monitoring");
await check("monitoring a room: honest uncalibrated estimate, noise-type panel, alert text, saved reading", async () => {
  await p.goto(U("/app/monitor/")); await p.selectOption("#room", { index: 1 });
  await p.getByRole("button", { name: "Start monitoring" }).click(); await p.waitForSelector("text=/uncalibrated estimate/i", { timeout: 25000 });
  const t = await text(); if (!/could be \d+–\d+/.test(t)) throw new Error("range missing"); if (/calibrated measurement/i.test(t) && !/uncalibrated/i.test(t)) throw new Error("claimed calibration");
  await p.waitForTimeout(6000); const ws = await wsData(); if (!ws.readings.length) throw new Error("no reading saved");
  if (ws.readings.some((r: any) => r.basis === "calibrated")) throw new Error("fake calibrated reading");
  if (ws.alerts.some((a: any) => a.severity === "red")) throw new Error("an uncalibrated estimate raised RED");
  await p.screenshot({ path: "e2e/shots/live.png" });
  await p.getByRole("button", { name: "Stop monitoring" }).click(); await p.waitForSelector("text=Start monitoring");
});

console.log("\nMeeting readiness");
await check("Test my room gives a verdict with reasons (no speed test claimed)", async () => {
  await p.goto(U("/app/readiness/")); await p.selectOption("#room", { index: 1 }); await p.getByRole("button", { name: "Start the test" }).click();
  await p.waitForSelector("text=Speaker check", { timeout: 25000 }); await p.getByRole("button", { name: "Play test tone" }).click(); await p.getByRole("button", { name: "Yes" }).click({ timeout: 8000 });
  await p.waitForSelector("text=/READY|NEEDS ATTENTION/"); const t = await text(); if (!/not a speed test/i.test(t)) throw new Error("missing connection caveat");
  await p.screenshot({ path: "e2e/shots/readiness.png" });
});

console.log("\nBefore / after");
await check("fair comparison reports a change and downloads a PDF; unfair one is refused", async () => {
  await p.evaluate((k) => { const w = JSON.parse(localStorage.getItem(k)!); const id = w.rooms[0].id; w.readings = [
    { id: "a", roomId: id, at: "2026-01-01T10:00:00Z", source: "live", basis: "estimate", value: 60, low: 40, high: 80, label: "x" },
    { id: "b", roomId: id, at: "2026-02-01T10:00:00Z", source: "live", basis: "estimate", value: 52, low: 32, high: 72, label: "x" },
    { id: "c", roomId: id, at: "2026-03-01T10:00:00Z", source: "live", basis: "calibrated", value: 41, label: "x" }]; localStorage.setItem(k, JSON.stringify(w)); }, WS);
  await p.goto(U("/app/verify/")); await p.waitForSelector("#b");
  const sel = async (b: number, a: number) => { await p.selectOption("#b", { index: b }); await p.selectOption("#a", { index: a }); };
  const n = await p.locator("#b option").count(); if (n < 4) throw new Error("expected 3 readings, got " + (n - 1));
  await sel(3, 2); await p.waitForSelector("text=/8 dB quieter/"); const t = await text(); if (/%|because|caused by/i.test(t.split("Limits")[0])) throw new Error("percentage or causation claim");
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }), p.getByRole("button", { name: /Download improvement report/ }).click()]);
  const buf = fs.readFileSync((await dl.path())!); if (buf.subarray(0, 5).toString() !== "%PDF-") throw new Error("not a PDF");
  await sel(3, 1); await p.waitForSelector("text=/cannot be compared fairly/");
});

console.log("\nPassport");
await check("QR passport: encrypted link asks for a passcode, rejects a wrong one, opens with the right one", async () => {
  await p.goto(U("/app/passport/")); await p.fill("#pc", "tulip-42"); await p.getByRole("button", { name: "Create QR code" }).click();
  await p.waitForSelector("img[alt^='QR code']"); const src = await p.locator("img[alt^='QR code']").getAttribute("src"); if (!src?.startsWith("data:image/png")) throw new Error("no QR image");
  await p.getByRole("button", { name: "Copy link" }).click().catch(() => {});
  const linkText = await p.locator("p.break-all").innerText(); if (/Board room|HQ/.test(linkText)) throw new Error("plain data visible in link");
});
await check("passport viewer decodes a shared link", async () => {
  // build a link through the page itself: click Create again and read the hidden full URL from the copy action
  await p.goto(U("/app/passport/")); await p.fill("#pc", "tulip-42"); await p.getByRole("button", { name: "Create QR code" }).click(); await p.waitForSelector("img[alt^='QR code']");
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin }); await p.getByRole("button", { name: "Copy link" }).click(); await p.waitForTimeout(300);
  const link = await p.evaluate(() => navigator.clipboard.readText()); if (!link.includes("#d=e.")) throw new Error("not an encrypted link: " + link.slice(0, 60));
  const v = await ctx.newPage(); await v.goto(link); await v.waitForSelector("#pc");
  await v.fill("#pc", "wrong"); await v.getByRole("button", { name: "Open" }).click(); await v.waitForSelector("text=/Wrong passcode/");
  await v.fill("#pc", "tulip-42"); await v.getByRole("button", { name: "Open" }).click(); await v.waitForSelector("h2:has-text('Board room')");
  const t = await v.locator("main").innerText(); if (!/not a certified measurement/i.test(t)) throw new Error("missing disclaimer"); await v.close();
});

console.log("\nMap, analytics, ROI, goals, marketplace, speech, settings");
await check("room map: place a microphone and a speaker close together → feedback warning", async () => {
  await p.goto(U("/app/map/")); const svg = p.locator("svg[role=application]"); await svg.waitFor(); const box = (await svg.boundingBox())!;
  await p.getByRole("button", { name: "Microphone", exact: true }).click(); await p.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await p.getByRole("button", { name: "Speaker", exact: true }).click(); await p.mouse.click(box.x + box.width * 0.52, box.y + box.height * 0.52);
  await p.waitForSelector("text=/raises feedback and echo risk/"); await p.screenshot({ path: "e2e/shots/map.png" });
  await p.reload(); await p.waitForSelector("svg[role=application][aria-label*='2 items']");
});
await check("analytics lists the room, filters work, CSV downloads", async () => {
  await p.goto(U("/app/analytics/")); await p.waitForSelector("a:has-text('Board room')"); await p.selectOption("select >> nth=0", "Nowhere").catch(() => {});
  await p.selectOption("select >> nth=0", { label: "HQ" }); await p.waitForSelector("a:has-text('Board room')");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: /Export CSV/ }).click()]); const csv = fs.readFileSync((await dl.path())!, "utf8"); if (!csv.includes("Board room")) throw new Error("csv");
});
await check("ROI: money boxes start empty; result comes only from entered numbers and says 'not a guarantee'", async () => {
  await p.goto(U("/app/roi/")); if (await p.inputValue("#r-hourlyCost") !== "" || await p.inputValue("#r-investment") !== "") throw new Error("pre-filled money");
  await p.fill("#r-hourlyCost", "1000"); await p.fill("#r-investment", "100000"); await p.waitForSelector("text=Cautious"); const t = await text(); if (!/not a guarantee/i.test(t)) throw new Error("no caveat");
});
await check("marketplace shows solution types with no prices, vendors or reviews", async () => {
  await p.goto(U("/app/marketplace/")); await p.waitForSelector("text=Needs a local quote"); const t = await text(); if (/[₹$€£]\s?\d|★|\d+ reviews/.test(t)) throw new Error("price/review found");
  await p.getByRole("button", { name: "Request quotes" }).first().click(); await p.waitForSelector("text=Nothing is sent from SoundSense");
});
await check("captions page discloses where audio goes and needs consent", async () => {
  await p.goto(U("/app/speech/")); await p.waitForSelector("text=Where the audio goes"); const b = p.getByRole("button", { name: "Start captions" }); if (await b.count()) { if (!(await b.isDisabled())) throw new Error("start enabled without consent"); }
});
await check("settings persist across reload; invalid band order is flagged", async () => {
  await p.goto(U("/app/settings/")); await p.fill("#hy", "3"); await p.fill("#b1", "30"); await p.waitForSelector("text=Each band must be higher"); await p.fill("#b1", "46"); await p.reload(); await p.waitForSelector("#hy"); if (await p.inputValue("#hy") !== "3") throw new Error("not saved");
});
await check("goals page: ticking fixes earns no badge", async () => { await p.goto(U("/app/goals/")); await p.waitForSelector("text=Noise Reduction Champion"); const t = await text(); if (/Earned/.test(t) && !/Not yet/.test(t)) throw new Error("badge earned without evidence"); });
await check("backup includes the workspace, and delete-all clears it", async () => {
  await p.goto(U("/app/data/")); await p.waitForSelector("text=/room.*saved here/");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: /Download backup/ }).click()]); const j = JSON.parse(fs.readFileSync((await dl.path())!, "utf8")); if (!j.workspace?.rooms?.length) throw new Error("workspace missing from backup");
  await p.getByRole("button", { name: /Delete all my data/ }).click(); await p.getByRole("button", { name: "Delete everything" }).click(); await p.waitForTimeout(500); const ws = await wsData(); if (ws && ws.rooms?.length) throw new Error("rooms remain");
});

console.log("\nPrivacy, errors, layout, accessibility");
await check("no request left the site's own origin; no console errors", async () => { const ext = requests.filter((u) => !u.startsWith(origin) && !u.startsWith("data:") && !u.startsWith("blob:")); if (ext.length) throw new Error("external: " + ext.slice(0, 3).join(", ")); if (errs.length) throw new Error(errs.slice(0, 3).join(" | ")); });
const PAGES = ["/app/", "/app/monitor/", "/app/rooms/", "/app/notifications/", "/app/readiness/", "/app/analytics/", "/app/mitigation/", "/app/verify/", "/app/goals/", "/app/map/", "/app/passport/", "/app/speech/", "/app/roi/", "/app/marketplace/", "/app/assistant/", "/app/settings/"];
for (const [w, h] of [[375, 700], [768, 900], [1280, 900]] as const) {
  await check(`no horizontal overflow at ${w}px on all 2.0 pages`, async () => {
    const q = await browser.newContext({ viewport: { width: w, height: h } }); const pg = await q.newPage(); const bad: string[] = [];
    for (const path of PAGES) { await pg.goto(U(path)); await pg.waitForLoadState("networkidle"); const o = await overflow(pg); if (o.sw > o.cw + 1) bad.push(`${path} ${o.sw}>${o.cw}`); }
    await q.close(); if (bad.length) throw new Error(bad.join(", "));
  });
}
for (const theme of ["light", "dark"]) for (const path of PAGES) await check(`axe ${theme}: ${path}`, async () => { await p.goto(U(path)); await p.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme); await p.waitForTimeout(250); return axe(p, path); });
await check("keyboard: the map's items can be moved with arrow keys", async () => {
  await p.evaluate((k) => { const id = "r1"; localStorage.setItem(k, JSON.stringify({ v: 1, rooms: [{ id, name: "K", building: "", floor: "", department: "", roomType: "conference_room", notes: "", createdAt: "x" }], maps: { [id]: [{ id: "m1", kind: "mic", x: 50, y: 50 }] } })); }, WS);
  await p.goto(U("/app/map/")); await p.locator("svg g[role=button]").first().focus(); await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowRight");
  const m = await wsData(); if (m.maps.r1[0].x !== 52) throw new Error("moved to " + m.maps.r1[0].x);
});
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
