import { z } from "zod";
import { api, bad, notFound } from "@/lib/api";
import { sys } from "@/lib/db";
import { audit } from "@/lib/audit";
import { issueToken } from "@/lib/auth/tokens";
import { mailConfigured } from "@/lib/env";
import { mailReset, resetLink, sendMail } from "@/lib/mail";

const schema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(["customer", "consultant", "admin"]).optional(),
  specialisation: z.string().trim().max(200).optional(),
});

export const PATCH = api({ auth: ["admin"], schema }, async ({ user, params, body, ip }) => {
  if (params.id === user.id && (body.isActive === false || (body.role && body.role !== "admin"))) throw bad("You cannot deactivate or demote your own account.");
  const cur = (await sys<any>("select id, role, is_active from users where id = $1", [params.id])).rows[0];
  if (!cur) throw notFound("User not found.");
  await sys("update users set is_active = coalesce($2, is_active), role = coalesce($3, role), updated_at = now() where id = $1", [params.id, body.isActive ?? null, body.role ?? null]);
  if (body.role === "consultant") await sys("insert into consultants(user_id, specialisation) values ($1,$2) on conflict (user_id) do update set specialisation = coalesce($2, consultants.specialisation)", [params.id, body.specialisation ?? null]);
  if (body.isActive === false || (body.role && body.role !== cur.role)) await sys("delete from sessions where user_id = $1", [params.id]); // take effect immediately
  await audit(user, "admin.user_update", "user", params.id, { from: { role: cur.role, active: cur.is_active }, to: body }, ip);
  return { ok: true };
});

/** Admin issues a one-time password-reset link (60 min). It is e-mailed when a mail server exists and always returned to the admin, so it can be handed over by chat or phone. */
export const PUT = api({ auth: ["admin"], limit: { name: "admin_reset", max: 30, windowSec: 3600 } }, async ({ user, params, ip }) => {
  const u = (await sys<any>("select id, name, email, is_active from users where id = $1", [params.id])).rows[0];
  if (!u || !u.is_active) throw notFound("User not found, or the account is disabled.");
  const token = await issueToken(u.id, "reset_password");
  let emailed = false;
  if (mailConfigured()) emailed = (await sendMail(mailReset(u.email, u.name, token))).delivered;
  await audit(user, "admin.user_reset_link", "user", u.id, { emailed }, ip);
  return { ok: true, link: resetLink(token), emailed, expiresInMinutes: 60 };
});
