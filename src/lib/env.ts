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

export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const requireEmailVerification = () => (process.env.REQUIRE_EMAIL_VERIFICATION ?? "true") !== "false";
export const bcryptCost = () => Number(process.env.BCRYPT_COST ?? 12);
export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim());
