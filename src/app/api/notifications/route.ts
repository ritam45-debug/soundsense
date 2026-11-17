import { z } from "zod";
import { api } from "@/lib/api";

export const GET = api({ auth: true }, async ({ db }) => {
  return db(async (q) => {
    const items = await q.query<any>("select id, title, body, link, read_at, created_at from notifications order by created_at desc limit 50");
    const unread = await q.query<{ n: number }>("select count(*)::int n from notifications where read_at is null");
    return { items: items.rows, unread: unread.rows[0].n };
  });
});

export const POST = api({ auth: true, schema: z.object({ id: z.uuid().optional() }) }, async ({ db, body }) => {
  await db((q) => (body.id ? q.query("update notifications set read_at = now() where id = $1 and read_at is null", [body.id]) : q.query("update notifications set read_at = now() where read_at is null")));
  return { ok: true };
});
