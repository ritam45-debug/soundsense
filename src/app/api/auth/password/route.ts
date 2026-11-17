import { z } from "zod";
import { api } from "@/lib/api";
import { completePasswordReset, startPasswordReset } from "@/lib/services/auth";

// POST = forgot password (always the same answer)
export const POST = api({ schema: z.object({ email: z.email().max(200) }), limit: { name: "forgot", max: 5, windowSec: 3600 } }, async ({ body }) => {
  const devLink = await startPasswordReset(body.email);
  return { ok: true, message: "If an account exists for that address, a reset link is on its way.", devLink };
});

// PUT = choose a new password with the emailed token
export const PUT = api(
  { schema: z.object({ token: z.string().min(10).max(200), password: z.string().min(1).max(200) }), limit: { name: "reset", max: 10, windowSec: 3600 } },
  async ({ body }) => {
    await completePasswordReset(body.token, body.password);
    return { ok: true, message: "Password updated. Sign in with your new password." };
  }
);
