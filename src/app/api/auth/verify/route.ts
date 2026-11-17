import { z } from "zod";
import { api } from "@/lib/api";
import { resendVerification, verifyEmail } from "@/lib/services/auth";

export const POST = api({ schema: z.object({ token: z.string().min(10).max(200) }), limit: { name: "verify", max: 20, windowSec: 900 } }, async ({ body }) => {
  await verifyEmail(body.token);
  return { ok: true, message: "E-mail verified. You can sign in now." };
});

// PUT = request a fresh verification e-mail (always answers the same, so it cannot be used to probe accounts)
export const PUT = api({ schema: z.object({ email: z.email().max(200) }), limit: { name: "resend", max: 5, windowSec: 3600 } }, async ({ body }) => {
  const devLink = await resendVerification(body.email);
  return { ok: true, message: "If that address has an unverified account, a new link is on its way.", devLink };
});
