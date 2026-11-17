import { z } from "zod";
import { api, forbidden, notFound } from "@/lib/api";
import { audit, notify, notifyRole } from "@/lib/audit";

export const GET = api({ auth: true }, async ({ db, params }) => {
  return db(async (q) => {
    const c = (await q.query<any>("select id, title, escalated, assessment_id, share_assessment, user_id from chat_conversations where id = $1", [params.id])).rows[0];
    if (!c) throw notFound("Conversation not found.");
    const m = await q.query("select id, role, content, source, created_at from chat_messages where conversation_id = $1 order by created_at", [params.id]);
    return { conversation: c, messages: m.rows };
  });
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("escalate"), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("reply"), content: z.string().trim().min(1).max(4000) }),
  z.object({ action: z.literal("resolve") }),
]);

/** escalate: customer hands the chat to a person · reply/resolve: consultants and admins answer escalated chats. */
export const POST = api({ auth: true, schema }, async ({ db, params, user, body, ip }) => {
  const out = await db(async (q) => {
    const c = (await q.query<any>("select * from chat_conversations where id = $1", [params.id])).rows[0];
    if (!c) throw notFound("Conversation not found.");
    if (body.action === "escalate") {
      if (c.user_id !== user.id) throw forbidden();
      await q.query("update chat_conversations set escalated = true, escalated_at = now(), updated_at = now() where id = $1", [c.id]);
      await q.query("insert into chat_messages(conversation_id, role, content, source) values ($1,'system',$2,null)", [c.id, `You asked for a human consultant${body.note ? `: ${body.note}` : "."} A member of the SoundSense team will reply here – usually within one working day.`]);
    } else {
      if (user.role === "customer") throw forbidden();
      if (!c.escalated) throw forbidden("Only escalated conversations can be answered by staff.");
      if (body.action === "reply") {
        await q.query("insert into chat_messages(conversation_id, role, content, source) values ($1,'assistant',$2,'human')", [c.id, body.content]);
        await q.query("update chat_conversations set updated_at = now() where id = $1", [c.id]);
      } else await q.query("update chat_conversations set escalated = false, updated_at = now() where id = $1", [c.id]);
    }
    return c;
  });
  await audit(user, `chat.${body.action}`, "chat", params.id, {}, ip);
  if (body.action === "escalate") await Promise.all([notifyRole("consultant", "Chat escalated to a consultant", out.title ?? "", `/app/chats`), notifyRole("admin", "Chat escalated to a consultant", out.title ?? "", `/app/chats`)]);
  if (body.action === "reply") await notify(out.user_id, "A consultant replied to your chat", out.title ?? "", `/app/chat?c=${out.id}`);
  return { ok: true };
});

export const DELETE = api({ auth: true }, async ({ db, params, user, ip }) => {
  await db(async (q) => {
    const r = await q.query("delete from chat_conversations where id = $1 and user_id = $2", [params.id, user.id]);
    if (!r.rowCount) throw notFound("Conversation not found.");
  });
  await audit(user, "chat.delete", "chat", params.id, {}, ip);
  return { ok: true };
});
