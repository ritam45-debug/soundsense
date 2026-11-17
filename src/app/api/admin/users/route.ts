import { z } from "zod";
import { api, bad } from "@/lib/api";
import { sys, sysTx } from "@/lib/db";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { issueToken } from "@/lib/auth/tokens";
import { mailReset, sendMail } from "@/lib/mail";
import { audit } from "@/lib/audit";
import { randomToken } from "@/lib/auth/password";

export const GET = api({ auth: ["admin"] }, async ({ db, query }) => {
  const role = query.get("role");
  const q = query.get("q");
  const params: any[] = [];
  const conds: string[] = [];
  if (role) (params.push(role), conds.push(`u.role = $${params.length}`));
  if (q) (params.push(`%${q.replace(/[%_\\]/g, "\\$&")}%`), conds.push(`(u.name ilike $${params.length} or u.email ilike $${params.length})`));
  const r = await db((c) =>
    c.query<any>(
      `select u.id, u.name, u.email, u.phone, u.role, u.is_active, u.email_verified_at, u.created_at, o.name as organisation,
              (select count(*)::int from assessments a where a.customer_id = u.id) as assessments,
              (select count(*)::int from assessments a where a.consultant_id = u.id and a.status <> 'completed') as open_cases,
              cs.specialisation, cs.active as consultant_active
         from users u left join organisations o on o.id = u.organisation_id left join consultants cs on cs.user_id = u.id
        ${conds.length ? "where " + conds.join(" and ") : ""} order by u.created_at desc limit 300`, params)
  );
  return { users: r.rows };
});

const create = z.object({
  name: z.string().trim().min(1).max(150),
  email: z.email().max(200),
  role: z.enum(["consultant", "admin"]),
  specialisation: z.string().trim().max(200).optional(),
});

/** Admin creates a consultant/admin. A random password is set and the person receives a reset link to choose their own. */
export const POST = api({ auth: ["admin"], schema: create }, async ({ user, body, ip }) => {
  const email = body.email.toLowerCase();
  if ((await sys("select 1 from users where lower(email) = $1", [email])).rowCount) throw bad("A user with that e-mail already exists.");
  const pw = randomToken(18) + "a1";
  if (passwordProblem(pw)) throw bad("Could not generate a password.");
  const id = await sysTx(async (q) => {
    const u = await q.query<{ id: string }>("insert into users(email, password_hash, name, role, email_verified_at, consent_privacy_at) values ($1,$2,$3,$4, now(), now()) returning id", [email, await hashPassword(pw), body.name, body.role]);
    if (body.role === "consultant") await q.query("insert into consultants(user_id, specialisation) values ($1,$2)", [u.rows[0].id, body.specialisation ?? null]);
    return u.rows[0].id;
  });
  const token = await issueToken(id, "reset_password");
  const m = mailReset(email, body.name, token);
  await sendMail({ ...m, subject: "Your SoundSense account is ready – set your password" });
  await audit(user, "admin.user_create", "user", id, { role: body.role }, ip);
  return { ok: true, id };
});
