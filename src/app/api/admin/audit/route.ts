import { api } from "@/lib/api";

export const GET = api({ auth: ["admin"] }, async ({ db, query }) => {
  const action = query.get("action");
  const limit = Math.min(200, Number(query.get("limit") ?? 100));
  const r = await db((q) =>
    q.query<any>(
      `select l.id, l.action, l.entity, l.entity_id, l.meta, l.ip, l.created_at, l.actor_role, u.name as actor
         from audit_logs l left join users u on u.id = l.actor_id ${action ? "where l.action like $1" : ""} order by l.id desc limit ${limit}`,
      action ? [`${action.replace(/[%_\\]/g, "\\$&")}%`] : []
    )
  );
  return { logs: r.rows };
});
