import { z } from "zod";
import { api } from "@/lib/api";
import { createSession } from "@/lib/auth/session";
import { registerUser, withSessionCookie } from "@/lib/services/auth";

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(150),
  email: z.email("Enter a valid e-mail address.").max(200),
  password: z.string().min(1, "Choose a password.").max(200),
  organisation: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
  consent: z.boolean().refine((v) => v === true, { message: "Please accept the privacy notice to create an account." }),
});

export const POST = api({ schema, limit: { name: "register", max: 8, windowSec: 3600 } }, async ({ body, ip, req }) => {
  const r = await registerUser(body, ip);
  const base = {
    ok: true,
    needsVerification: r.needsVerification,
    message: r.needsVerification
      ? "Check your inbox for a verification link to finish creating your account."
      : "Account created. You can sign in now.",
    devLink: r.devLink, // only populated outside production when no SMTP server is configured
  };
  // No verification step (no mail server, or switched off): sign the new customer straight in.
  if (!r.needsVerification && r.userId) {
    const s = await createSession(r.userId, { ua: req.headers.get("user-agent"), ip });
    return withSessionCookie({ ...base, signedIn: true, message: "Welcome to SoundSense. Your account is ready." }, s.token, s.expires);
  }
  return base;
});
