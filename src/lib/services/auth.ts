import { NextResponse } from "next/server";
import { sys, sysTx } from "../db";
import { ApiError } from "../api";
import { DUMMY_HASH, hashPassword, passwordProblem, verifyPassword } from "../auth/password";
import { COOKIE_NAME, cookieOptions, createSession } from "../auth/session";
import { consumeToken, issueToken } from "../auth/tokens";
import { mailReset, mailVerify, sendMail, verifyLink } from "../mail";
import { audit } from "../audit";
import { isProd, mailConfigured, requireEmailVerification } from "../env";

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  organisation?: string;
  phone?: string;
}

export async function registerUser(input: RegisterInput, ip: string) {
  const email = input.email.trim().toLowerCase();
  const problem = passwordProblem(input.password);
  if (problem) throw new ApiError(400, problem, "invalid", { password: problem });

  const existing = await sys<{ id: string; name: string }>("select id, name from users where lower(email) = $1", [email]);
  if (existing.rows[0]) {
    // With a mail server we do not reveal that the address is registered; we tell the owner by e-mail instead.
    // Without one there is no private channel, so say so plainly rather than pretend an account was created.
    if (!mailConfigured()) {
      const msg = "An account with this e-mail already exists. Sign in, or use “Forgot your password?”.";
      throw new ApiError(409, msg, "exists", { email: msg });
    }
    await sendMail({
      to: email,
      subject: "You already have a SoundSense account",
      text: `Hi ${existing.rows[0].name},\n\nSomeone (hopefully you) tried to register with this address. You already have an account – sign in, or reset your password if you have forgotten it.\n\nSoundSense`,
    });
    return { devLink: undefined as string | undefined, needsVerification: requireEmailVerification(), userId: undefined as string | undefined };
  }

  const verified = !requireEmailVerification();
  const user = await sysTx(async (q) => {
    let orgId: string | null = null;
    if (input.organisation?.trim()) {
      orgId = (await q.query<{ id: string }>("insert into organisations(name) values ($1) returning id", [input.organisation.trim()])).rows[0].id;
    }
    const u = await q.query<{ id: string }>(
      `insert into users(email, password_hash, name, phone, role, organisation_id, consent_privacy_at, email_verified_at)
       values ($1,$2,$3,$4,'customer',$5, now(), ${verified ? "now()" : "null"}) returning id`,
      [email, await hashPassword(input.password), input.name.trim(), input.phone?.trim() || null, orgId]
    );
    await q.query("insert into customer_profiles(user_id) values ($1)", [u.rows[0].id]);
    return u.rows[0];
  });

  await audit({ id: user.id, role: "customer" }, "auth.register", "user", user.id, {}, ip);
  let devLink: string | undefined;
  if (!verified) {
    const token = await issueToken(user.id, "verify_email");
    const mail = mailVerify(email, input.name, token);
    const sent = await sendMail(mail);
    if (sent.mode === "console" && !isProd()) devLink = verifyLink(token);
  }
  return { devLink, needsVerification: !verified, userId: user.id as string | undefined };
}

export async function loginUser(emailRaw: string, password: string, ip: string, ua: string | null) {
  const email = emailRaw.trim().toLowerCase();
  const r = await sys<any>("select id, password_hash, role, is_active, email_verified_at, failed_logins, locked_until, name from users where lower(email) = $1", [email]);
  const u = r.rows[0];
  // Constant-ish time: always run one bcrypt comparison.
  const ok = await verifyPassword(password, u?.password_hash ?? DUMMY_HASH);
  if (u?.locked_until && new Date(u.locked_until) > new Date()) {
    throw new ApiError(429, "Too many failed attempts. Try again in a few minutes or reset your password.", "locked");
  }
  if (!u || !ok || !u.is_active) {
    if (u) {
      const fails = u.failed_logins + 1;
      await sys("update users set failed_logins = $2, locked_until = case when $2 >= 5 then now() + interval '15 minutes' else null end where id = $1", [u.id, fails]);
    }
    await audit(u ? { id: u.id, role: u.role } : null, "auth.login_failed", "user", u?.id, { email: u ? undefined : "unknown" }, ip);
    throw new ApiError(401, "Incorrect e-mail or password.", "bad_credentials");
  }
  if (requireEmailVerification() && !u.email_verified_at) {
    throw new ApiError(403, "Please verify your e-mail address first. Check your inbox, or request a new link.", "unverified");
  }
  await sys("update users set failed_logins = 0, locked_until = null where id = $1", [u.id]);
  const { token, expires } = await createSession(u.id, { ua, ip });
  await audit({ id: u.id, role: u.role }, "auth.login", "user", u.id, {}, ip);
  return { token, expires, role: u.role as "customer" | "consultant" | "admin", name: u.name as string };
}

export function withSessionCookie(body: unknown, token: string, expires: Date) {
  const res = NextResponse.json(body);
  res.cookies.set(COOKIE_NAME(), token, cookieOptions(expires));
  return res;
}

export function clearSessionCookie(body: unknown = { ok: true }) {
  const res = NextResponse.json(body);
  res.cookies.set(COOKIE_NAME(), "", { ...cookieOptions(new Date(0)), maxAge: 0 });
  return res;
}

export async function verifyEmail(token: string) {
  const uid = await consumeToken(token, "verify_email");
  if (!uid) throw new ApiError(400, "This verification link is invalid or has expired. Request a new one.", "invalid_token");
  await sys("update users set email_verified_at = coalesce(email_verified_at, now()) where id = $1", [uid]);
  await audit({ id: uid }, "auth.verify_email", "user", uid);
}

export async function resendVerification(emailRaw: string) {
  const r = await sys<any>("select id, name, email, email_verified_at from users where lower(email) = $1 and is_active", [emailRaw.trim().toLowerCase()]);
  const u = r.rows[0];
  if (!u || u.email_verified_at) return undefined;
  const token = await issueToken(u.id, "verify_email");
  const sent = await sendMail(mailVerify(u.email, u.name, token));
  return sent.mode === "console" && !isProd() ? verifyLink(token) : undefined;
}

export async function startPasswordReset(emailRaw: string) {
  const r = await sys<any>("select id, name, email from users where lower(email) = $1 and is_active", [emailRaw.trim().toLowerCase()]);
  const u = r.rows[0];
  if (!u) return undefined; // same response either way
  const token = await issueToken(u.id, "reset_password");
  const mail = mailReset(u.email, u.name, token);
  const sent = await sendMail(mail);
  await audit({ id: u.id }, "auth.reset_requested", "user", u.id);
  return sent.mode === "console" && !isProd() ? mail.text.match(/https?:\/\/\S+/)?.[0] : undefined;
}

export async function completePasswordReset(token: string, password: string) {
  const problem = passwordProblem(password);
  if (problem) throw new ApiError(400, problem, "invalid", { password: problem });
  const uid = await consumeToken(token, "reset_password");
  if (!uid) throw new ApiError(400, "This reset link is invalid or has expired. Request a new one.", "invalid_token");
  await sys("update users set password_hash = $2, failed_logins = 0, locked_until = null, email_verified_at = coalesce(email_verified_at, now()) where id = $1", [uid, await hashPassword(password)]);
  await sys("delete from sessions where user_id = $1", [uid]); // sign out everywhere
  await audit({ id: uid }, "auth.password_reset", "user", uid);
}
