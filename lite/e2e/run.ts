/**
 * Browser E2E for SoundSense Lite against the exported static site, served under a sub-path like GitHub Pages.
 *   NEXT_PUBLIC_BASE_PATH=/soundsense npm run build && BASE_PATH=/soundsense PORT=4100 npm run serve &
 *   E2E_BASE=http://localhost:4100/soundsense npm run test:e2e
 */
import fs from "node:fs";
import { SCENARIOS } from "../src/lib/local/samples";
import { optionLabel } from "../src/lib/acoustics/questionnaire";
import { BASE, U, check, fillQuestionnaire, launch, overflow, results, watch, type Page } from "./lib";

fs.mkdirSync("e2e/shots", { recursive: true });
const axeSrc = fs.readFileSync("node_modules/axe-core/axe.min.js", "utf8");
async function axe(p: Page, name: string) {
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
const bodyText = () => p.locator("body").innerText();

console.log("Landing & no-login");
await check("landing renders; no sign-in or register anywhere", async () => {
  await p.goto(U("/")); await p.waitForSelector("text=Diagnose first");
  const t = await bodyText(); if (/sign in|register|log in|create (an )?account/i.test(t)) throw new Error("login wording on landing: " + (t.match(/.{20}(sign in|register|log in).{20}/i)?.[0]));
  if (await p.locator('a[href$="/login"], a[href$="/register"]').count()) throw new Error("login links present");
});
await check("app opens with no sign-in and shows the dashboard", async () => {
  await p.goto(U("/app/")); await p.waitForSelector("text=SoundSense Lite"); await p.waitForSelector("text=No assessments yet");
});

console.log("\nSample → results → PDF");
await check("try a sample opens a finished diagnosis", async () => {
  await p.goto(U("/app/assessments/new/?sample=1")); await p.waitForSelector("text=Try a sample");
  await p.getByRole("button", { name: /Large glass conference room/ }).click();
  await p.waitForSelector("text=Most likely problem area", { timeout: 15000 });
  for (const s of ["Evidence behind this diagnosis", "Possible root causes", "Confidence:"]) await p.waitForSelector(`text=${s}`, { timeout: 4000 });
});
await check("recommendations show 3 tiers with indicative ₹ prices and a disclaimer", async () => {
  await p.getByRole("tab", { name: /Recommendations/ }).click();
  const t = await p.locator("main").innerText();
  for (const w of ["Budget", "Recommended", "Premium"]) if (!t.includes(w)) throw new Error("missing tier " + w);
  if (!/₹/.test(t) || !/indicative/i.test(t)) throw new Error("no indicative price wording");
});
await check("PDF report is generated on the device and downloads as a real PDF", async () => {
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 20000 }), p.getByRole("button", { name: /Download PDF report/ }).click()]);
  const path = await dl.path(); const buf = fs.readFileSync(path!);
  if (buf.subarray(0, 5).toString() !== "%PDF-") throw new Error("not a PDF");
  if (buf.length < 8000) throw new Error("PDF suspiciously small: " + buf.length);
  if (!/\.pdf$/.test(dl.suggestedFilename())) throw new Error("bad filename " + dl.suggestedFilename());
  return `${(buf.length / 1024).toFixed(0)} KB, ${dl.suggestedFilename()}`;
});
await check("reports tab lists the report and says it was built on this device", async () => {
  await p.getByRole("tab", { name: /Reports/ }).click(); await p.waitForSelector("text=Version 1");
  if (/consultant remarks|final report/i.test(await p.locator("main").innerText().then((t) => t.replace(/Preliminary/g, "")))) throw new Error("consultant wording leaked into lite");
});

console.log("\nOwn assessment through the questionnaire");
let myUrl = "";
await check("questionnaire (scenario B: classroom) → diagnosis via the real UI", async () => {
  await p.goto(U("/app/assessments/new/")); await p.waitForURL(/assessments\/view\/\?id=/); await p.waitForSelector("text=Step 1 of");
  myUrl = p.url();
  await fillQuestionnaire(p, SCENARIOS.B.answers, optionLabel);
  await p.getByRole("button", { name: /Submit & get diagnosis/ }).click();
  await p.waitForSelector("text=Most likely problem area", { timeout: 20000 });
});
await check("draft survives a reload (progress saved as you go)", async () => {
  await p.goto(U("/app/assessments/new/")); await p.waitForURL(/view\/\?id=/); await p.waitForSelector("text=Step 1 of");
  const url = p.url(); await p.fill("#q-contact_name", "Reload Test").catch(() => {}); await p.waitForTimeout(2200);
  await p.reload(); await p.waitForSelector("text=Step 1 of");
  const v = await p.inputValue("#q-contact_name").catch(() => "");
  if (v !== "Reload Test") throw new Error("typed value lost after reload: '" + v + "'");
  void url;
});
await check("data persists: both assessments are listed after a reload", async () => {
  await p.goto(U("/app/assessments/")); await p.waitForSelector("text=Sample: Large glass");
  const n = await p.locator("main ul > li").count(); if (n < 3) throw new Error("expected 3 saved assessments, saw " + n);
});
await check("deep link to a finished assessment works on a fresh page load", async () => {
  await p.goto(myUrl); await p.waitForSelector("text=Most likely problem area", { timeout: 15000 });
});
await check("deep link to a missing assessment shows a friendly message", async () => {
  await p.goto(U("/app/assessments/view/?id=does-not-exist")); await p.waitForSelector("text=couldn't find that assessment");
});

console.log("\nMeasure, calculate, assistant");
await check("room calculator gives an RT60 estimate with an uncertainty note", async () => {
  await p.goto(U("/app/measure/")); await p.getByRole("tab", { name: /Room calculator/ }).click(); await p.waitForSelector("text=Type of room");
  const inputs = p.locator("input[type=number]"); if ((await inputs.count()) < 3) throw new Error("no calculator inputs");
  for (let i = 0; i < 3; i++) await inputs.nth(i).fill(["8", "6", "3"][i]);
  await p.waitForSelector("text=/RT60/", { timeout: 5000 });
  if (!/estimate|approx/i.test(await p.locator("main").innerText())) throw new Error("no estimate wording");
});
await check("mic measurement: live meter → stop → labelled relative → saved to an assessment", async () => {
  await p.goto(myUrl.replace(/assessments\/view\/\?id=/, "measure/?assessment=")); await p.waitForSelector("text=Start recording");
  await p.getByRole("button", { name: /Start recording/ }).click(); await p.waitForSelector("text=Stop & analyse", { timeout: 10000 });
  await p.waitForTimeout(3500); await p.getByRole("button", { name: /Stop & analyse/ }).click();
  await p.waitForSelector("text=Save to my assessment", { timeout: 10000 });
  if (!/relative|dBFS/i.test(await p.locator("main").innerText())) throw new Error("not labelled relative");
  await p.getByRole("button", { name: /Save to my assessment/ }).click(); await p.waitForSelector("text=Recording saved", { timeout: 8000 });
});
await check("assistant answers an echo question and says it is rule-based", async () => {
  await p.goto(U("/app/chat/")); await p.fill("#chat-in", "Why does my room echo?"); await p.getByRole("button", { name: "Send" }).click();
  await p.waitForSelector("text=Echo has two very different causes", { timeout: 8000 });
  if (!/rule-based|built-in/i.test(await p.locator("main").innerText())) throw new Error("not labelled");
});
await check("public-page chat widget works too", async () => {
  await p.goto(U("/learn/")); await p.getByRole("button", { name: /Ask about sound/ }).click(); await p.fill("#chat-in", "what does rt60 mean"); await p.getByRole("button", { name: "Send" }).click();
  await p.waitForSelector("text=Reverberation is how long sound lingers", { timeout: 8000 });
});

console.log("\nYour data");
let backup = "";
await check("backup downloads as valid JSON containing the assessments", async () => {
  await p.goto(U("/app/data/")); await p.waitForSelector("text=Back up and restore");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: /Download backup/ }).click()]);
  backup = fs.readFileSync((await dl.path())!, "utf8"); const j = JSON.parse(backup);
  if (j.app !== "soundsense-lite" || j.data.assessments.length < 3) throw new Error("backup content wrong");
});
await check("delete all data empties the app; restore brings it back", async () => {
  await p.getByRole("button", { name: /Delete all my data/ }).click(); await p.getByRole("button", { name: "Delete everything" }).click();
  await p.waitForSelector("text=All data deleted"); await p.goto(U("/app/")); await p.waitForSelector("text=No assessments yet");
  fs.writeFileSync("e2e/shots/backup.json", backup);
  await p.goto(U("/app/data/")); await p.locator('input[type=file]').setInputFiles("e2e/shots/backup.json"); await p.waitForSelector("text=Restored 3 assessments");
  await p.goto(U("/app/assessments/")); await p.waitForSelector("text=Sample: Large glass");
});
await check("a damaged backup file is refused with a clear message", async () => {
  fs.writeFileSync("e2e/shots/bad.json", '{"hello":1}');
  await p.goto(U("/app/data/")); await p.locator('input[type=file]').setInputFiles("e2e/shots/bad.json"); await p.waitForSelector("text=not a SoundSense Lite backup");
});

console.log("\nStatic hosting & privacy");
await check("nothing was ever requested from a server API or another origin", async () => {
  const foreign = requests.filter((u) => !u.startsWith(origin) && !u.startsWith("data:") && !u.startsWith("blob:"));
  const api = requests.filter((u) => /\/api\//.test(u));
  if (foreign.length || api.length) throw new Error(`external: ${foreign.slice(0, 3)} api: ${api.slice(0, 3)}`);
  return `${requests.length} requests, all same-origin static files`;
});
await check("unknown route shows a friendly 404", async () => {
  await p.goto(U("/nope/")); await p.waitForSelector("text=/not found|couldn.t find|404/i");
});
await check("no console or page errors in the whole run", async () => { if (errs.length) throw new Error(errs.slice(0, 3).join(" | ")); });

console.log("\nLayout & accessibility");
for (const [w, h] of [[375, 700], [768, 900], [1280, 900]] as const) {
  await check(`no horizontal overflow at ${w}px`, async () => {
    const q = await browser.newContext({ viewport: { width: w, height: h } }); const pg = await q.newPage();
    await pg.goto(U("/app/assessments/new/?sample=1")); await pg.getByRole("button", { name: /Large glass conference room/ }).click(); await pg.waitForSelector("text=Most likely problem area");
    const bad: string[] = [];
    for (const path of ["/", "/learn/", "/app/", "/app/assessments/", "/app/measure/", "/app/data/", "/app/chat/"]) { await pg.goto(U(path)); await pg.waitForLoadState("networkidle"); const o = await overflow(pg); if (o.sw > o.cw + 1) bad.push(`${path} ${o.sw}>${o.cw}`); }
    const view = pg.url(); void view; await q.close(); if (bad.length) throw new Error(bad.join(", "));
  });
}
for (const theme of ["light", "dark"]) {
  for (const path of ["/", "/learn/", "/app/", "/app/assessments/", "/app/measure/", "/app/data/", "/app/chat/", "/app/learn/"]) {
    await check(`axe ${theme}: ${path}`, async () => { await p.goto(U(path)); await p.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme); await p.waitForTimeout(300); return axe(p, path); });
  }
  await check(`axe ${theme}: finished assessment (all tabs)`, async () => {
    await p.goto(myUrl); await p.waitForSelector("text=Most likely problem area"); await p.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    const out: string[] = [];
    for (const tab of ["Diagnosis", "Recommendations", "Room & sound", "Reports"]) { await p.getByRole("tab", { name: new RegExp(tab) }).click(); await p.waitForTimeout(250); out.push(await axe(p, tab)); }
    return out.join("; ");
  });
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
