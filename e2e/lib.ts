import { chromium, Browser, BrowserContext, Page } from "playwright-core";
import { Answers, STEPS, visibleQuestions } from "../src/lib/acoustics/questionnaire";

export const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
export const results: { name: string; ok: boolean; note?: string }[] = [];

/** Each context gets its own client IP so the per-IP login rate limit (15 / 15 min) does not trip across the many sign-ins in a run. */
export const ipHeaders = () => ({ "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });

export async function launch(opts: { width?: number; height?: number; dark?: boolean } = {}) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  });
  const ctx = await browser.newContext({ viewport: { width: opts.width ?? 1280, height: opts.height ?? 900 }, colorScheme: opts.dark ? "dark" : "light", permissions: ["microphone"], baseURL: BASE, extraHTTPHeaders: ipHeaders() });
  return { browser, ctx };
}

export async function check(name: string, fn: () => Promise<void | string>) {
  try { const note = await fn(); results.push({ name, ok: true, note: note || undefined }); console.log(`  ✓ ${name}${note ? ` – ${note}` : ""}`); }
  catch (e: any) { results.push({ name, ok: false, note: String(e?.message ?? e).split("\n")[0] }); console.log(`  ✗ ${name}\n      ${String(e?.message ?? e).split("\n").slice(0, 3).join("\n      ")}`); }
}

export function watch(page: Page, bag: string[]) {
  page.on("pageerror", (e) => bag.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource.*(401|404)/.test(m.text())) bag.push(`console: ${m.text()}`); });
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill("#email", email); await page.fill("#pw", password);
  await Promise.all([page.waitForURL(/\/app/), page.click("button:has-text('Sign in')")]);
}

/** Answers the questionnaire through the real UI, following conditional questions. */
export async function fillQuestionnaire(page: Page, answers: Answers, optionLabel: (q: string, v: string) => string) {
  const cur: Answers = {};
  for (let s = 0; s < STEPS.length; s++) {
    const step = STEPS[s];
    if (s === STEPS.length - 1) { // the optional room / sound-check slide sits before the consent step
      await page.waitForSelector("text=Room details & sound check");
      await page.getByRole("button", { name: /^Next/ }).click();
      await page.getByRole("button", { name: /Submit & get diagnosis/ }).waitFor();
    }
    for (const _ of [0, 1, 2]) { // re-evaluate visibility as answers reveal follow-ups
      for (const q of visibleQuestions(step, cur)) {
        const v = answers[q.id];
        if (v === undefined || cur[q.id] !== undefined && JSON.stringify(cur[q.id]) === JSON.stringify(v)) continue;
        if (q.type === "single") await page.locator(`input[name="${q.id}"]`).locator("xpath=..").filter({ hasText: optionLabel(q.id, v) }).first().click();
        else if (q.type === "multi") for (const x of v as string[]) await page.locator(`input[name="${q.id}"]`).locator("xpath=..").filter({ hasText: optionLabel(q.id, x) }).first().click();
        else if (q.type === "consent") await page.locator(`#q-${q.id}`).check();
        else await page.fill(`#q-${q.id}`, String(v));
        cur[q.id] = v;
      }
    }
    if (s < STEPS.length - 1) { await page.getByRole("button", { name: /^Next/ }).click(); await page.waitForTimeout(250); }
  }
}

export async function overflow(page: Page) {
  return page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
}
export type { Browser, BrowserContext, Page };
