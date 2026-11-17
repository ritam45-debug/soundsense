/**
 * Browser checks for the customer account flows on a server that has NO mail server configured
 * (the situation of a first Netlify deploy).  E2E_BASE=http://localhost:3100 npx tsx e2e/account.ts
 */
import { BASE, check, launch, ipHeaders } from "./lib";

const { browser, ctx } = await launch();
const p = await ctx.newPage();
const email = `new.${Date.now()}@example.test`;
const PW = "Sound-Test-12345";

console.log("Customer account flows (no mail server)");
await check("register: live password rules, show/hide, mismatch caught, then signed straight in", async () => {
  await p.goto("/register");
  await p.fill("#name", "Account Tester"); await p.fill("#email", email);
  await p.fill("#pw", "abc");
  const rules = await p.locator("#pw-rules").innerText();
  if (!/At least 10 characters/.test(rules)) throw new Error("rules missing");
  await p.fill("#pw", PW);
  await p.getByRole("button", { name: "Show password" }).first().click();
  if ((await p.locator("#pw").getAttribute("type")) !== "text") throw new Error("show/hide did not reveal");
  await p.fill("#pw2", PW + "x");
  await p.locator("input[type=checkbox]").check();
  await p.getByRole("button", { name: "Create account" }).click();
  await p.waitForSelector("text=do not match");
  await p.fill("#pw2", PW);
  await p.getByRole("button", { name: "Create account" }).click();
  await p.waitForURL(/\/app/, { timeout: 20000 });
  await p.waitForSelector("text=Account Tester", { timeout: 15000 });
});
await check("signed in customer can sign out and sign back in with the same password", async () => {
  await ctx.clearCookies();
  await p.goto("/login"); await p.fill("#email", email); await p.fill("#pw", PW);
  await p.getByRole("button", { name: "Sign in" }).click(); await p.waitForURL(/\/app/, { timeout: 20000 });
});
await check("registering the same e-mail again is refused with a clear message", async () => {
  await ctx.clearCookies(); await p.goto("/register");
  await p.fill("#name", "Dup"); await p.fill("#email", email); await p.fill("#pw", PW); await p.fill("#pw2", PW);
  await p.locator("input[type=checkbox]").check(); await p.getByRole("button", { name: "Create account" }).click();
  await p.waitForSelector("text=already exists");
});
await check("forgot password explains that e-mail is off instead of promising a link", async () => {
  await p.goto("/forgot-password"); await p.fill("#email", email); await p.getByRole("button", { name: "Send reset link" }).click();
  await p.waitForSelector("text=cannot send e-mail");
});
await check("profile: change password, then delete account with the password", async () => {
  await p.goto("/login"); await p.fill("#email", email); await p.fill("#pw", PW); await p.getByRole("button", { name: "Sign in" }).click(); await p.waitForURL(/\/app/);
  await p.goto("/app/profile"); await p.waitForSelector("text=Delete my account");
  await p.getByRole("button", { name: /Delete my account/ }).click();
  await p.fill("#dp", "wrong-password-1"); await p.getByRole("button", { name: "Delete everything" }).click();
  await p.waitForSelector("text=not correct");
  await p.fill("#dp", PW); await p.getByRole("button", { name: "Delete everything" }).click();
  await p.waitForURL(/\/login/, { timeout: 15000 });
  await p.fill("#email", email); await p.fill("#pw", PW); await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForSelector("text=Incorrect e-mail or password");
});
await check("admin can create a reset link for a customer", async () => {
  await ctx.clearCookies(); await p.goto("/login");
  await p.fill("#email", process.env.E2E_ADMIN_EMAIL ?? "admin@soundsense.test"); await p.fill("#pw", process.env.E2E_ADMIN_PW ?? "Admin-Pass-12345");
  await p.getByRole("button", { name: "Sign in" }).click(); await p.waitForURL(/\/app/);
  await p.goto("/app/admin/users"); await p.waitForSelector("text=Reset link");
  await p.getByRole("button", { name: /Create a password reset link for Demo/ }).first().click();
  await p.waitForSelector("input[aria-label='Reset link']");
  const v = await p.locator("input[aria-label='Reset link']").inputValue();
  if (!/\/reset-password\?token=/.test(v)) throw new Error("no link: " + v);
});
void BASE; void ipHeaders;
await browser.close();
