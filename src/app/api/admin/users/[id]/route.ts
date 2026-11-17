import { z } from "zod";
import { api, bad, notFound } from "@/lib/api";
import { sys } from "@/lib/db";
import { audit } from "@/lib/audit";

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
