import { SignJWT, jwtVerify } from "jose";
import { sys } from "../db";
import { isProd, sessionSecret } from "../env";

export const COOKIE_NAME = () => (isProd() ? "__Host-ss_session" : "ss_session");
const SESSION_DAYS = 7;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "customer" | "consultant" | "admin";
  organisationId: string | null;
  emailVerified: boolean;
  sessionId: string;
}

export async function createSession(userId: string, meta: { ua?: string | null; ip?: string | null }) {
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  const r = await sys<{ id: string }>(
    "insert into sessions(user_id, expires_at, user_agent, ip) values ($1,$2,$3,$4) returning id",
    [userId, expires, meta.ua?.slice(0, 300) ?? null, meta.ip ?? null]
  );
  const sid = r.rows[0].id;
  const token = await new SignJWT({ sid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(sessionSecret());
  return { token, expires, sid };
}

export const cookieOptions = (expires: Date) => ({
  httpOnly: true,
  secure: isProd(),
  sameSite: "lax" as const,
  path: "/",
  expires,
});

/** Resolve a session token to a live user, or null. Revoked/expired/deactivated → null. */
export async function userFromToken(token: string | undefined | null): Promise<AuthUser | null> {
  if (!token) return null;
  let sid: string;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    sid = String(payload.sid);
  } catch {
    return null;
  }
  const r = await sys<any>(
    `select u.id, u.email, u.name, u.role, u.organisation_id, u.email_verified_at
       from sessions s join users u on u.id = s.user_id
      where s.id = $1 and s.expires_at > now() and u.is_active`,
    [sid]
  ).catch(() => null);
  const u = r?.rows[0];
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    organisationId: u.organisation_id,
    emailVerified: Boolean(u.email_verified_at),
    sessionId: sid,
  };
}

export const destroySession = (sid: string) => sys("delete from sessions where id = $1", [sid]);
export const destroyAllSessions = (userId: string) => sys("delete from sessions where user_id = $1", [userId]);
