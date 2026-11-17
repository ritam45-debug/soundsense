import { api } from "@/lib/api";
import { destroySession } from "@/lib/auth/session";
import { clearSessionCookie } from "@/lib/services/auth";
import { audit } from "@/lib/audit";

export const POST = api({ auth: true }, async ({ user, ip }) => {
  await destroySession(user.sessionId);
  await audit(user, "auth.logout", "user", user.id, {}, ip);
  return clearSessionCookie();
});
