import { SCENARIOS } from "../tests/fixtures";
import { optionLabel } from "../src/lib/acoustics/questionnaire";
import { check, fillQuestionnaire, launch, login, watch } from "./lib";

const { browser, ctx } = await launch();
const page = await ctx.newPage(); const errs: string[] = []; watch(page, errs);
await check("landing renders", async () => { await page.goto("/"); await page.waitForSelector("text=Sell last."); await page.screenshot({ path: "e2e/shots/landing.png" }); });
await check("customer login", async () => { await login(page, "customer@demo.soundsense.test", "Demo-Customer-1"); await page.waitForSelector("text=Hello"); await page.screenshot({ path: "e2e/shots/dashboard.png", fullPage: true }); });
await check("questionnaire A via UI → diagnosis", async () => {
  await page.goto("/app/assessments/new"); await page.waitForURL(/assessments\/[0-9a-f-]{36}/); await page.waitForSelector("text=Step 1 of");
  await fillQuestionnaire(page, SCENARIOS.A.answers, optionLabel);
  await page.screenshot({ path: "e2e/shots/wizard-last.png" });
  await page.getByRole("button", { name: /Submit & get diagnosis/ }).click();
  await page.waitForSelector("text=Most likely problem area", { timeout: 20000 });
  await page.screenshot({ path: "e2e/shots/diagnosis.png", fullPage: true });
  return page.url();
});
console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "no console errors");
await browser.close();
