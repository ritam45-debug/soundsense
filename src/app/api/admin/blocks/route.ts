import { z } from "zod";
import { api } from "@/lib/api";
import { audit } from "@/lib/audit";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const GET = api({ auth: true }, async ({ db }) => {
  const r = await db((q) => q.query<any>("select id, to_char(day,'YYYY-MM-DD') as day, reason from availability_blocks where day >= current_date - 7 order by day"));
  return { blocks: r.rows };
});

export const POST = api({ auth: ["admin"], schema: z.object({ day, reason: z.string().trim().max(200).optional() }) }, async ({ db, body, user, ip }) => {
  await db((q) => q.query("insert into availability_blocks(day, reason) values ($1,$2) on conflict (day) do update set reason = $2", [body.day, body.reason ?? null]));
  await audit(user, "calendar.block", "calendar", body.day, { reason: body.reason }, ip);
  return { ok: true };
});

export const DELETE = api({ auth: ["admin"], schema: z.object({ day }) }, async ({ db, body, user, ip }) => {
  await db((q) => q.query("delete from availability_blocks where day = $1", [body.day]));
  await audit(user, "calendar.unblock", "calendar", body.day, {}, ip);
  return { ok: true };
});
