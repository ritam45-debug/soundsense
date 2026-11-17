import { z } from "zod";
import { api } from "@/lib/api";
import { j } from "@/lib/db";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { sys } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { clearSessionCookie } from "@/lib/services/auth";

async function profile(q: any, uid: string) {
  const r = await q.query(
    `select u.id, u.email, u.name, u.phone, u.role, u.email_verified_at, u.created_at, u.organisation_id,
            o.name as organisation, o.city, o.industry, p.designation, p.location, p.marketing_opt_in,
            c.specialisation, c.bio
       from users u left join organisations o on o.id = u.organisation_id
       left join customer_profiles p on p.user_id = u.id left join consultants c on c.user_id = u.id
      where u.id = $1`, [uid]);
  return r.rows[0];
}

export const GET = api({ auth: true }, async ({ db, user }) => ({ user: await db((q) => profile(q, user.id)) }));

const patch = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  phone: z.string().trim().max(30).optional(),
  organisation: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  designation: z.string().trim().max(150).optional(),
  location: z.string().trim().max(200).optional(),
  marketing_opt_in: z.boolean().optional(),
  specialisation: z.string().trim().max(200).optional(),
  bio: z.string().trim().max(1000).optional(),
});

export const PATCH = api({ auth: true, schema: patch }, async ({ db, user, body, ip }) => {
  await db(async (q) => {
    if (body.name !== undefined || body.phone !== undefined)
      await q.query("update users set name = coalesce($2, name), phone = coalesce($3, phone), updated_at = now() where id = $1", [user.id, body.name ?? null, body.phone ?? null]);
    if (body.organisation !== undefined) {
      const cur = (await q.query<{ organisation_id: string | null }>("select organisation_id from users where id = $1", [user.id])).rows[0];
      if (cur.organisation_id) await q.query("update organisations set name = $2, city = coalesce($3, city) where id = $1", [cur.organisation_id, body.organisation, body.city ?? null]);
      else if (body.organisation) {
        const o = await q.query<{ id: string }>("insert into organisations(name, city) values ($1,$2) returning id", [body.organisation, body.city ?? null]);
        await q.query("update users set organisation_id = $2 where id = $1", [user.id, o.rows[0].id]);
      }
    }
    if (user.role === "customer") {
      await q.query(
        `insert into customer_profiles(user_id, designation, location, marketing_opt_in) values ($1,$2,$3,coalesce($4,false))
         on conflict (user_id) do update set designation = coalesce($2, customer_profiles.designation), location = coalesce($3, customer_profiles.location), marketing_opt_in = coalesce($4, customer_profiles.marketing_opt_in)`,
        [user.id, body.designation ?? null, body.location ?? null, body.marketing_opt_in ?? null]
      );
    }
    if (user.role === "consultant")
      await q.query("update consultants set specialisation = coalesce($2, specialisation), bio = coalesce($3, bio) where user_id = $1", [user.id, body.specialisation ?? null, body.bio ?? null]);
  });
  await audit(user, "profile.update", "user", user.id, { fields: Object.keys(body) }, ip);
  return { user: await db((q) => profile(q, user.id)) };
});

// Change password (needs the current one)
export const PUT = api(
  { auth: true, schema: z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(200) }), limit: { name: "chgpw", max: 10, windowSec: 3600 } },
  async ({ user, body, ip }) => {
    const r = await sys<{ password_hash: string }>("select password_hash from users where id = $1", [user.id]);
    if (!(await verifyPassword(body.current, r.rows[0].password_hash))) throw new ApiError(400, "Your current password is not correct.", "invalid", { current: "Not correct." });
    const p = passwordProblem(body.next);
    if (p) throw new ApiError(400, p, "invalid", { next: p });
    await sys("update users set password_hash = $2 where id = $1", [user.id, await hashPassword(body.next)]);
    await sys("delete from sessions where user_id = $1 and id <> $2", [user.id, user.sessionId]);
    await audit(user, "auth.password_changed", "user", user.id, {}, ip);
    return { ok: true, message: "Password changed. Other devices were signed out." };
  }
);

// Delete my account and everything attached to it (assessments, recordings, bookings, chats). Customers only; needs the password.
export const DELETE = api(
  { auth: ["customer"], schema: z.object({ password: z.string().min(1).max(200) }), limit: { name: "delacct", max: 5, windowSec: 3600 } },
  async ({ user, body, ip }) => {
    const r = await sys<{ password_hash: string }>("select password_hash from users where id = $1", [user.id]);
    if (!(await verifyPassword(body.password, r.rows[0].password_hash))) throw new ApiError(400, "That password is not correct.", "invalid", { password: "Not correct." });
    await audit({ id: user.id, role: user.role }, "account.deleted", "user", user.id, {}, ip); // audit rows keep no personal data
    await sys("delete from users where id = $1", [user.id]);
    return clearSessionCookie({ ok: true, message: "Your account and its data have been deleted." });
  }
);
void j;
