/** Central place for configuration. Nothing here is ever sent to the browser. */
export const isProd = () => process.env.NODE_ENV === "production";

export function sessionSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET ?? "";
  if (s.length < 32) {
    if (isProd()) throw new Error("SESSION_SECRET must be set to 32+ random characters in production");
    return new TextEncoder().encode("dev-only-insecure-secret-do-not-use-in-prod!!");
  }
  return new TextEncoder().encode(s);
}

/** Public base URL. APP_URL wins; Netlify (URL) and Vercel (VERCEL_PROJECT_PRODUCTION_URL) are picked up automatically. */
export const appUrl = () => {
  const v = process.env.APP_URL?.trim() || process.env.URL?.trim() || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") || "http://localhost:3000";
  return v.replace(/\/$/, "");
};
/** True when a mail server is configured, i.e. verification and reset e-mails can really be delivered. */
export const mailConfigured = () => Boolean(process.env.SMTP_HOST?.trim());
/**
 * E-mail verification is on only if mail can be delivered. With no SMTP server a verification link could never
 * reach anyone and nobody could sign in, so new accounts are active immediately. REQUIRE_EMAIL_VERIFICATION=true|false overrides.
 */
export const requireEmailVerification = () => {
  const v = process.env.REQUIRE_EMAIL_VERIFICATION?.trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return mailConfigured();
};
export const bcryptCost = () => Number(process.env.BCRYPT_COST ?? 12);
export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim());
