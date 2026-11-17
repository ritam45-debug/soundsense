import { z } from "zod";
import { api } from "@/lib/api";
import { loginUser, withSessionCookie } from "@/lib/services/auth";

const schema = z.object({ email: z.string().min(1).max(200), password: z.string().min(1).max(200) });

export const POST = api({ schema, limit: { name: "login", max: 15, windowSec: 900 } }, async ({ body, ip, req }) => {
  const r = await loginUser(body.email, body.password, ip, req.headers.get("user-agent"));
  return withSessionCookie({ ok: true, role: r.role, name: r.name }, r.token, r.expires);
});
