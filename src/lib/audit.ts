import { sys } from "./db";

export interface Actor {
  id?: string | null;
  role?: string | null;
}

/** Append-only audit trail. Never throws – auditing must not break the user's request. */
export async function audit(
  actor: Actor | null,
  action: string,
  entity?: string,
  entityId?: string,
  meta: Record<string, unknown> = {},
  ip?: string | null
) {
  try {
    await sys("insert into audit_logs(actor_id, actor_role, action, entity, entity_id, meta, ip) values ($1,$2,$3,$4,$5,$6::jsonb,$7)", [
      actor?.id ?? null,
      actor?.role ?? null,
      action,
      entity ?? null,
      entityId ?? null,
      JSON.stringify(meta),
      ip ?? null,
    ]);
  } catch (e) {
    console.error("audit failed", e);
  }
}

export async function notify(userId: string, title: string, body?: string, link?: string) {
  try {
    await sys("insert into notifications(user_id, title, body, link) values ($1,$2,$3,$4)", [userId, title, body ?? null, link ?? null]);
  } catch (e) {
    console.error("notify failed", e);
  }
}

export async function notifyRole(role: "admin" | "consultant", title: string, body?: string, link?: string) {
  try {
    await sys(
      "insert into notifications(user_id, title, body, link) select id, $2, $3, $4 from users where role = $1 and is_active",
      [role, title, body ?? null, link ?? null]
    );
  } catch (e) {
    console.error("notifyRole failed", e);
  }
}
