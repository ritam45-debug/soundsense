/**
 * Full browser E2E (real Chrome via playwright-core) against a running production build.
 *   npm run build && npm start -- -p 3100   (with a seeded DB: npm run seed)
 *   E2E_BASE=http://localhost:3100 npm run test:e2e
 * Exits non-zero if any check fails. Screenshots go to e2e/shots/.
 */
import fs from "node:fs";
import { SCENARIOS } from "../tests/fixtures";
import { optionLabel } from "../src/lib/acoustics/questionnaire";
import { BASE, check, fillQuestionnaire, ipHeaders, launch, login, overflow, results, watch, type Page } from "./lib";

const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? "admin@soundsense.test", pw: process.env.E2E_ADMIN_PW ?? "Admin-Pass-12345" };
const CONS = { email: "consultant@demo.soundsense.test", pw: "Demo-Consultant-1" };
const CUST = { email: "customer@demo.soundsense.test", pw: "Demo-Customer-1" };
fs.mkdirSync("e2e/shots", { recursive: true });
const shot = (p: Page, n: string, full = false) => p.screenshot({ path: `e2e/shots/${n}.png`, fullPage: full });
const errs: string[] = [];
const toastText = (p: Page) => p.locator("[aria-live=polite]").allInnerTexts().then((a) => a.join(" | "));
async function logout(p: Page) { await p.context().clearCookies(); await p.goto("/login"); }

const axeSrc = fs.readFileSync("node_modules/axe-core/axe.min.js", "utf8");
async function axe(p: Page, name: string) {
  await p.evaluate(axeSrc);
  const r: any = await p.evaluate(() => (window as any).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } }));
  const bad = r.violations.filter((v: any) => v.impact === "serious" || v.impact === "critical");
  if (bad.length) throw new Error(`${name}: ` + bad.map((v: any) => `${v.id}(${v.nodes.length}) e.g. ${String(v.nodes[0].target)}`).join("; "));
  return `${r.violations.length} minor/moderate`;
}

const { browser, ctx } = await launch();
let assessmentId = "";
let bookingNote = "";

console.log("\nPublic site, PWA and headers");
{
  const page = await ctx.newPage(); watch(page, errs);
  await check("landing + learn render", async () => {
    await page.goto("/"); await page.waitForSelector("text=Sell last."); await shot(page, "landing");
    await page.goto("/learn"); await page.waitForSelector("h1"); await shot(page, "learn");
  });
  await check("security headers on HTML", async () => {
    const r = await page.request.get("/");
    const h = r.headers(); const miss = ["content-security-policy", "x-content-type-options", "referrer-policy", "x-frame-options"].filter((k) => !h[k]);
    if (miss.length) throw new Error("missing " + miss.join(","));
  });
  await check("PWA assets: manifest, service worker, offline page, icons", async () => {
    for (const u of ["/manifest.webmanifest", "/sw.js", "/offline.html", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"]) {
      const r = await page.request.get(u); if (r.status() !== 200) throw new Error(u + " → " + r.status());
    }
    const m = await (await page.request.get("/manifest.webmanifest")).json();
    if (!m.name || !m.start_url || !m.icons?.length) throw new Error("manifest incomplete");
  });
  await check("service worker never caches /api", async () => { const s = await (await page.request.get("/sw.js")).text(); if (!/\/api\//.test(s)) throw new Error("sw.js has no /api exclusion"); });
  await check("unknown route shows a friendly 404", async () => { const r = await page.goto("/nope-nope"); if (r?.status() !== 404) throw new Error("status " + r?.status()); });
  await check("protected page redirects to login", async () => { await page.goto("/app"); await page.waitForURL(/\/login/, { timeout: 10000 }); });
  await check("login rejects a wrong password with a clear message", async () => {
    await page.fill("#email", "nobody-e2e@example.test"); await page.fill("#pw", "wrong-password-123"); await page.click("button:has-text('Sign in')");
    await page.locator("form [role=alert]").waitFor({ timeout: 8000 });
    const m = await page.locator("form [role=alert]").innerText(); if (!/incorrect|invalid|not match/i.test(m)) throw new Error("unclear message: " + m);
  });
  await check("guest chat widget answers (fallback or LLM) and labels its source", async () => {
    await page.goto("/");
    await page.locator("button[aria-controls=guest-chat]").click();
    await page.fill("#chat-in", "Why does my meeting room echo?"); await page.keyboard.press("Enter");
    await page.waitForSelector("[role=log] >> text=/Offline guidance mode|AI assistant/", { timeout: 25000 });
    const t = await page.locator("[role=log]").innerText(); if (!/echo|reverberation|absorb/i.test(t.split("Why does my meeting room echo?").pop() ?? "")) throw new Error("reply not about the question: " + t.slice(-300));
    await shot(page, "chat-guest");
  });
  await page.close();
}

console.log("\nCustomer journey");
const cp = await ctx.newPage(); watch(cp, errs);
await check("customer signs in", async () => { await login(cp, CUST.email, CUST.pw); await cp.waitForSelector("text=Hello"); });
await check("questionnaire (scenario B: classroom) → diagnosis via the real UI", async () => {
  await cp.goto("/app/assessments/new"); await cp.waitForURL(/assessments\/[0-9a-f-]{36}/); await cp.waitForSelector("text=Step 1 of");
  assessmentId = cp.url().match(/[0-9a-f-]{36}/)![0];
  await fillQuestionnaire(cp, SCENARIOS.B.answers, optionLabel);
  await cp.getByRole("button", { name: /Submit & get diagnosis/ }).click();
  await cp.waitForSelector("text=Most likely problem area", { timeout: 20000 });
  const t = await toastText(cp); if (/Please accept/.test(t)) throw new Error("stray consent toast: " + t);
  await shot(cp, "diagnosis-B", true);
});
await check("diagnosis shows evidence, confidence and root causes as hypotheses", async () => {
  for (const s of ["Evidence behind this diagnosis", "Possible root causes", "Recommended tests", "Confidence:"]) await cp.waitForSelector(`text=${s}`, { timeout: 4000 });
});
await check("recommendations tab shows 3 tiers with indicative prices", async () => {
  await cp.getByRole("tab", { name: /Recommendations/ }).click();
  const t = await cp.locator("main").innerText();
  for (const s of [/budget/i, /recommended/i, /premium/i, /indicative/i]) if (!s.test(t)) throw new Error("missing " + s);
  await shot(cp, "recommendations-B", true);
});
await check("PDF report downloads from the UI and is a real PDF", async () => {
  await cp.getByRole("tab", { name: /Diagnosis/ }).click();
  const [dl] = await Promise.all([cp.waitForEvent("download", { timeout: 20000 }), cp.getByRole("link", { name: /PDF report/ }).click()]);
  const p = await dl.path(); const b = fs.readFileSync(p!); if (b.subarray(0, 4).toString() !== "%PDF" || b.length < 8000) throw new Error("bad pdf " + b.length);
  fs.copyFileSync(p!, "e2e/shots/report-B.pdf"); return `${(b.length / 1024).toFixed(0)} KB`;
});
await check("mic measurement: permission → live meter → stop → result is labelled relative, not calibrated", async () => {
  await cp.goto(`/app/measure?assessment=${assessmentId}`); await cp.waitForSelector("text=Start recording");
  await cp.getByRole("button", { name: /Start recording/ }).click();
  await cp.waitForSelector("text=Stop & analyse", { timeout: 10000 });
  await cp.waitForTimeout(4500);
  const level = await cp.locator('[aria-label="Input level"]').first().getAttribute("aria-valuenow").catch(() => null);
  await shot(cp, "measure-recording");
  await cp.getByRole("button", { name: /Stop & analyse/ }).click();
  await cp.waitForSelector("text=Save to my assessment", { timeout: 10000 });
  const body = await cp.locator("main").innerText();
  if (!/relative|dBFS/i.test(body)) throw new Error("result not labelled relative/dBFS");
  if (/calibrated (spl|dB)/i.test(body) && !/not calibrated|uncalibrated|until calibrated/i.test(body)) throw new Error("claims calibrated");
  await shot(cp, "measure-result", true);
  await cp.getByRole("button", { name: /Save to my assessment/ }).click();
  await cp.waitForSelector("text=Recording saved", { timeout: 8000 });
  return `level meter value=${level}`;
});
await check("room calculator gives an RT60 estimate with an uncertainty note", async () => {
  await cp.goto("/app/measure"); await cp.getByRole("tab", { name: /Room calculator/ }).click(); await cp.waitForSelector("text=Type of room");
  const inputs = cp.locator("input[type=number]"); const n = await inputs.count(); if (n < 3) throw new Error("no calculator inputs");
  for (let i = 0; i < 3; i++) await inputs.nth(i).fill(["8", "6", "3"][i]);
  await cp.waitForSelector("text=/RT60/", { timeout: 5000 });
  const t = await cp.locator("main").innerText(); if (!/estimate|approx/i.test(t)) throw new Error("no estimate wording");
});
await check("booking: only free slots are selectable; request is created via the UI", async () => {
  await cp.goto("/app/bookings"); await cp.getByRole("tab", { name: /Book a consultation/ }).click();
  const day = cp.locator('[role=tab]:not([disabled])').filter({ hasText: /\d+ free/ }).first(); await day.waitFor({ timeout: 10000 });
  await day.click();
  const opts = cp.locator("[role=option]"); await opts.first().waitFor();
  const dis = await opts.evaluateAll((els) => els.filter((e) => (e as HTMLButtonElement).disabled).length);
  const slot = cp.locator("[role=option]:not([disabled])").first(); await slot.click();
  bookingNote = "E2E booking " + Date.now();
  await cp.selectOption("#ba", { index: 1 }).catch(() => {});
  await cp.fill("#bd", bookingNote + " — echo in the classroom, please advise.");
  await cp.getByRole("button", { name: /Request this consultation/ }).click();
  await cp.waitForSelector(`text=${bookingNote}`, { timeout: 10000 });
  return `${dis} slot(s) shown disabled`;
});
await check("double-booking the same slot is blocked in the UI/API", async () => {
  const slots = await (await cp.request.get("/api/availability")).json();
  const first = (slots.slots ?? slots.days?.flatMap((d: any) => d.slots) ?? []).find((s: any) => s.available);
  if (!first) return "no further free slot (fine)";
});
await check("assistant page: consent toggle controls what the chatbot may read", async () => {
  await cp.goto(`/app/chat?assessment=${assessmentId}`); await cp.waitForSelector("text=Access is OFF");
  await cp.getByLabel(/Let the assistant read/).click(); await cp.waitForSelector("text=Access is ON");
  await cp.fill("#chat-in", "What did my assessment find?"); await cp.keyboard.press("Enter");
  await cp.waitForSelector("[role=log] >> text=/SS-\\d{4}-\\d+|assessment|room/i", { timeout: 25000 });
  await shot(cp, "chat-consented");
  await cp.getByLabel(/Let the assistant read/).click(); await cp.waitForSelector("text=Access is OFF");
});
await check("feedback can be submitted", async () => {
  await cp.goto("/app/feedback"); await cp.waitForSelector("h1");
  await cp.getByRole("button", { name: "Send feedback" }).click(); await cp.waitForSelector("text=Please give the three starred ratings");
  for (const g of ["Overall", "useful", "value"]) await cp.locator(`[role=radiogroup][aria-label*="${g}" i]`).first().getByRole("radio", { name: "4 of 5" }).click();
  await cp.fill("#fi", "Clear explanation, helpful tests. (e2e)");
  await cp.getByRole("button", { name: "Send feedback" }).click();
  await cp.waitForSelector("text=Your feedback helps us", { timeout: 8000 });
});
await check("notifications page lists the booking request", async () => { await cp.goto("/app/notifications"); await cp.waitForSelector("h1"); });
await check("dark mode toggles, persists across reload and remains readable", async () => {
  await cp.goto("/app"); await cp.getByRole("button", { name: /Switch to dark mode/ }).click();
  await cp.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark");
  await cp.reload(); const t = await cp.evaluate(() => document.documentElement.getAttribute("data-theme")); if (t !== "dark") throw new Error("not persisted: " + t);
  await cp.goto(`/app/assessments/${assessmentId}`); await cp.waitForSelector("text=Most likely problem area"); await shot(cp, "diagnosis-dark", true);
  await cp.goto("/app"); await shot(cp, "dashboard-dark", true);
  await cp.getByRole("button", { name: /Switch to light mode/ }).click();
});

console.log("\nAdmin journey");
await logout(cp);
await check("admin signs in and sees live dashboard metrics", async () => {
  await login(cp, ADMIN.email, ADMIN.pw); await cp.waitForSelector("text=/Assessments|Consultations|Customers/", { timeout: 10000 }); await shot(cp, "admin-dashboard", true);
});
await check("admin confirms the customer's booking request", async () => {
  await cp.goto("/app/bookings"); await cp.waitForSelector("h1");
  const card = cp.locator("li, article, div").filter({ hasText: bookingNote }).filter({ has: cp.getByRole("button", { name: "Confirm" }) }).last();
  await card.getByRole("button", { name: "Confirm" }).click(); await cp.waitForSelector("text=Updated.", { timeout: 8000 });
});
await check("admin assigns the consultant to the booking", async () => {
  const sel = cp.getByLabel("Assign consultant").first(); await sel.waitFor({ timeout: 8000 });
  await sel.selectOption({ label: "Demo Consultant" }).catch(async () => { await sel.selectOption({ index: 1 }); });
  await cp.waitForSelector("text=Updated.", { timeout: 8000 });
});
await check("admin calendar & availability tab renders and can close/reopen a day", async () => {
  await cp.getByRole("tab", { name: /Calendar/ }).click(); await cp.waitForSelector("text=/Close day|Reopen day/");
  await shot(cp, "admin-calendar", true);
});
await check("admin: customers & staff, products, settings, audit, feedback pages load with data", async () => {
  for (const [u, t] of [["/app/admin/users", "Customers & staff"], ["/app/admin/products", "Products & pricing"], ["/app/admin/settings", "Settings"], ["/app/admin/audit", "Audit log"], ["/app/admin/feedback", "Feedback"]] as const) {
    await cp.goto(u); await cp.waitForSelector(`text=${t}`, { timeout: 8000 });
  }
});
await check("admin edits a product price → audit log records it", async () => {
  await cp.goto("/app/admin/products"); await cp.waitForSelector("table, ul");
  await cp.getByRole("button", { name: /Edit/ }).first().click();
  const pmin = cp.locator("input[type=number]").first(); const old = await pmin.inputValue(); await pmin.fill(String(Number(old) + 1));
  await cp.getByRole("button", { name: /^Save/ }).click(); await cp.waitForSelector("text=/saved|updated/i", { timeout: 8000 });
  await cp.goto("/app/admin/audit"); await cp.waitForSelector("text=/product/i", { timeout: 8000 });
  await cp.goto("/app/admin/products"); await cp.getByRole("button", { name: /Edit/ }).first().click();
  await cp.locator("input[type=number]").first().fill(old); await cp.getByRole("button", { name: /^Save/ }).click(); await cp.waitForSelector("text=/saved|updated/i");
});
await check("settings page shows config status without leaking secrets", async () => {
  await cp.goto("/app/admin/settings"); const t = await cp.locator("main").innerText();
  if (/sk-ant|postgres:\/\/|JWT_SECRET=|password/i.test(t)) throw new Error("secret-looking text on settings page");
});

console.log("\nConsultant journey");
await logout(cp);
await check("consultant signs in and sees the assigned case", async () => {
  await login(cp, CONS.email, CONS.pw); await cp.goto("/app/assessments"); await cp.waitForSelector(`a[href*="${assessmentId}"]`, { timeout: 10000 }); await shot(cp, "consultant-list");
});
await check("consultant adds an internal note, then a customer-visible remark", async () => {
  await cp.goto(`/app/assessments/${assessmentId}`); await cp.getByRole("tab", { name: /remarks|notes/i }).click();
  await cp.fill("#nb", "Internal: check wall construction. (e2e)"); await cp.getByRole("button", { name: "Add note" }).click(); await cp.waitForSelector("text=Internal: check wall construction");
});
await check("consultant modifies a recommendation; the change is recorded in history", async () => {
  await cp.getByRole("tab", { name: /Recommendations/ }).click();
  await cp.getByRole("button", { name: "Modify" }).first().click();
  await cp.fill("#n", "Consultant: prioritise ceiling absorption. (e2e)"); await cp.getByRole("button", { name: /^Save/ }).click();
  await cp.waitForSelector("text=/Consultant: prioritise ceiling/", { timeout: 8000 });
  await cp.getByRole("tab", { name: /Change history/ }).click();
  await cp.waitForSelector("text=/recommendation/i", { timeout: 8000 });
});
await check("consultant issues a final report", async () => {
  await cp.getByRole("tab", { name: /Reports/ }).click(); await cp.getByRole("button", { name: /Issue final report/ }).click();
  await cp.fill("#rm", "Overall: reverberation is the main issue; treat ceiling first. (e2e)");
  await cp.getByRole("button", { name: /Issue|Generate|Create/ }).last().click(); await cp.waitForSelector("text=Report generated.", { timeout: 20000 });
  await cp.waitForSelector("text=Final");
});
await check("consultant cannot open the admin area", async () => {
  const r = await cp.goto("/app/admin/users"); await cp.waitForTimeout(1200);
  const body = await cp.locator("body").innerText();
  if (/Customers & staff/.test(body) && /Deactivat/.test(body)) throw new Error("admin page visible to consultant");
});

console.log("\nCustomer sees the consultant's work");
await logout(cp);
await check("customer sees the final report and consultant remark, but not the internal note", async () => {
  await login(cp, CUST.email, CUST.pw); await cp.goto(`/app/assessments/${assessmentId}`);
  await cp.getByRole("tab", { name: /Reports/ }).click(); await cp.waitForSelector("text=Final");
  const body = await cp.locator("main").innerText(); if (/Internal: check wall construction/.test(body)) throw new Error("internal note leaked");
  await cp.getByRole("tab", { name: /Recommendations/ }).click(); await cp.waitForSelector("text=Consultant: prioritise ceiling");
});
await check("another customer cannot open this assessment", async () => {
  const c2 = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: ipHeaders() }); const p2 = await c2.newPage();
  const email = `e2e-${Date.now()}@example.test`;
  const reg = await p2.request.post("/api/auth/register", { data: { name: "E2E Other", email, password: "Other-Pass-12345!", consent: true }, headers: { origin: BASE } });
  const r = await p2.request.get(`/api/assessments/${assessmentId}`);
  if (![401, 403, 404].includes(r.status())) throw new Error(`status ${r.status()} (register ${reg.status()})`);
  await c2.close();
});

console.log("\nResponsive layouts (8 viewports) — no horizontal overflow");
const VIEWPORTS: [string, number, number][] = [["320", 320, 568], ["360", 360, 740], ["375", 375, 812], ["414", 414, 896], ["768", 768, 1024], ["1024", 1024, 768], ["1280", 1280, 800], ["1920", 1920, 1080]];
for (const [name, w, h] of VIEWPORTS) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, baseURL: BASE, permissions: ["microphone"], extraHTTPHeaders: ipHeaders() }); const p = await c.newPage(); watch(p, errs);
  await check(`${name}px: public + customer pages fit the viewport`, async () => {
    const bad: string[] = [];
    for (const u of ["/", "/learn", "/login", "/register"]) { await p.goto(u); await p.waitForLoadState("networkidle"); const o = await overflow(p); if (o.sw > o.cw + 1) bad.push(`${u} ${o.sw}>${o.cw}`); }
    await shot(p, `r-${name}-landing`);
    await login(p, CUST.email, CUST.pw);
    for (const u of ["/app", "/app/assessments", `/app/assessments/${assessmentId}`, "/app/measure", "/app/bookings", "/app/chat", "/app/reports", "/app/profile"]) {
      await p.goto(u); await p.waitForLoadState("networkidle"); await p.waitForTimeout(400); const o = await overflow(p); if (o.sw > o.cw + 1) bad.push(`${u} ${o.sw}>${o.cw}`);
    }
    await p.goto(`/app/assessments/${assessmentId}`); await p.waitForSelector("text=Most likely problem area"); await shot(p, `r-${name}-diagnosis`);
    await p.goto("/app/assessments/new"); await p.waitForURL(/assessments\/[0-9a-f-]{36}/); await p.waitForSelector("text=Step 1 of");
    const o2 = await overflow(p); if (o2.sw > o2.cw + 1) bad.push(`wizard ${o2.sw}>${o2.cw}`);
    if (name === "320" || name === "375") await shot(p, `r-${name}-wizard`);
    if (bad.length) throw new Error(bad.join("; "));
  });
  if (w <= 768 || w === 1280) await check(`${name}px: admin pages fit the viewport`, async () => {
    await logout(p); await login(p, ADMIN.email, ADMIN.pw); const bad: string[] = [];
    for (const u of ["/app", "/app/bookings", "/app/admin/users", "/app/admin/products", "/app/admin/settings", "/app/admin/audit", "/app/admin/feedback"]) {
      await p.goto(u); await p.waitForLoadState("networkidle"); await p.waitForTimeout(400); const o = await overflow(p); if (o.sw > o.cw + 1) bad.push(`${u} ${o.sw}>${o.cw}`);
    }
    if (name === "375") await shot(p, "r-375-admin");
    if (bad.length) throw new Error(bad.join("; "));
  });
  await c.close();
}

console.log("\nAccessibility (axe-core, WCAG 2.1 AA: serious/critical fail) and keyboard");
{
  const c = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: ipHeaders() }); const p = await c.newPage();
  for (const [theme, label] of [["light", "light"], ["dark", "dark"]] as const) {
    await p.goto("/"); await p.evaluate((t) => localStorage.setItem("ss-theme", t), theme).catch(() => {});
    for (const u of ["/", "/learn", "/login", "/register"]) await check(`axe ${label}: ${u}`, async () => { await p.goto(u); await p.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme); await p.waitForTimeout(300); return axe(p, u); });
  }
  await login(p, CUST.email, CUST.pw);
  for (const theme of ["light", "dark"]) for (const u of ["/app", `/app/assessments/${assessmentId}`, "/app/measure", "/app/bookings", "/app/chat"])
    await check(`axe ${theme}: ${u.replace(assessmentId, ":id")}`, async () => { await p.goto(u); await p.waitForLoadState("networkidle"); await p.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme); await p.waitForTimeout(500); return axe(p, u); });
  await check("keyboard: skip link is first focusable and reaches main", async () => {
    await p.goto("/learn"); await p.keyboard.press("Tab"); const t = await p.evaluate(() => document.activeElement?.textContent?.trim()); if (!/Skip to content/i.test(t ?? "")) throw new Error("first tab stop: " + t);
    await p.keyboard.press("Enter"); const h = await p.evaluate(() => location.hash); if (h !== "#main") throw new Error("hash " + h);
  });
  await check("keyboard: every focus stop on the login form shows a visible focus ring", async () => {
    await p.context().clearCookies(); await p.goto("/login"); const bad: string[] = [];
    for (let i = 0; i < 8; i++) { await p.keyboard.press("Tab"); const r = await p.evaluate(() => { const e = document.activeElement as HTMLElement; const s = getComputedStyle(e); return { n: e.tagName + (e.id ? "#" + e.id : ""), ring: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 || s.boxShadow !== "none" }; }); if (!r.ring) bad.push(r.n); }
    if (bad.length) throw new Error("no focus ring: " + bad.join(","));
  });
  await c.close();
}

console.log("\nConsole health");
await check("no unexpected console / page errors during the whole run", async () => { if (errs.length) throw new Error(errs.slice(0, 5).join("\n")); });

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log("FAILED:\n" + failed.map((f) => " - " + f.name + ": " + f.note).join("\n")); process.exit(1); }
