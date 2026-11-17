import { z } from "zod";
import { api, forbidden, notFound } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";
import { ApiError } from "@/lib/api";
import { chatReply, ChatContext, diagnosisLabel } from "@/lib/services/chat";
import { optionLabel } from "@/lib/acoustics/questionnaire";

const schema = z.object({
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1, "Type a message.").max(2000),
  assessmentId: z.uuid().optional(),
  /** Guests have no stored history; this carries the last turns so the bot keeps context. */
  guestHistory: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(12).optional(),
});

/**
 * Public + authenticated chat.
 *  - Guests: stateless generic Q&A (no history stored, no assessment access).
 *  - Signed-in: history is stored; the assessment is only read when the customer has switched on
 *    "Let the assistant read my assessment" (assessments.share_with_chat) – otherwise it stays private.
 */
export const POST = api({ schema, limit: { name: "chat", max: 40, windowSec: 600 } }, async ({ body, user, ip }) => {
  const g = await rateLimit(`chat:${user?.id ?? ip}`, user ? 60 : 20, 3600);
  if (!g.ok) throw new ApiError(429, "You have reached the hourly chat limit. Please try again later or book a consultation.", "rate_limited");

  if (!user) {
    const r = await chatReply(body.guestHistory ?? [], body.message, null);
    return { conversationId: null, reply: { content: r.text, source: r.source }, suggestEscalation: false, signInForHuman: r.suggestEscalation };
  }

  const { asUser } = await import("@/lib/db");
  return asUser(user, async (q) => {
    let convId = body.conversationId;
    let assessmentId = body.assessmentId;
    if (convId) {
      const c = (await q.query<any>("select * from chat_conversations where id = $1 and user_id = $2", [convId, user.id])).rows[0];
      if (!c) throw notFound("Conversation not found.");
      assessmentId = assessmentId ?? c.assessment_id ?? undefined;
      if (c.escalated) {
        // A human has taken over – just store the customer's message and let staff reply.
        await q.query("insert into chat_messages(conversation_id, role, content) values ($1,'user',$2)", [convId, body.message]);
        await q.query("update chat_conversations set updated_at = now() where id = $1", [convId]);
        return { conversationId: convId, reply: null, escalated: true, suggestEscalation: false };
      }
    } else {
      const c = await q.query<{ id: string }>("insert into chat_conversations(user_id, assessment_id, title) values ($1,$2,$3) returning id", [user.id, body.assessmentId ?? null, body.message.slice(0, 60)]);
      convId = c.rows[0].id;
    }

    // Load assessment context ONLY with consent.
    let ctx: ChatContext | null = null;
    if (assessmentId) {
      const a = (await q.query<any>("select id, ref, answers, summary, share_with_chat from assessments where id = $1 and customer_id = $2", [assessmentId, user.id])).rows[0];
      if (a?.share_with_chat) {
        const d = (await q.query<any>("select result, confidence_level from diagnostic_results where assessment_id = $1 order by created_at desc limit 1", [a.id])).rows[0];
        ctx = {
          ref: a.ref,
          headline: a.summary?.headline,
          environment: a.summary?.environment,
          problems: a.summary?.problems,
          diagnosis: d ? diagnosisLabel(d.result.diagnosis.primary) : undefined,
          confidence: d?.confidence_level,
          nextSteps: d?.result?.diagnosis?.freeFirstSteps?.slice(0, 3),
          budget: optionLabel("q13_budget", a.answers?.q13_budget),
        };
        if (!body.conversationId) await q.query("update chat_conversations set assessment_id = $2, share_assessment = true where id = $1", [convId, a.id]);
      } else if (a && !body.conversationId) {
        await q.query("update chat_conversations set assessment_id = $2, share_assessment = false where id = $1", [convId, a.id]);
      }
    }

    const hist = (await q.query<any>("select role, content from chat_messages where conversation_id = $1 and role in ('user','assistant') order by created_at desc limit 12", [convId])).rows.reverse();
    const reply = await chatReply(hist, body.message, ctx);
    await q.query("insert into chat_messages(conversation_id, role, content) values ($1,'user',$2)", [convId, body.message]);
    await q.query("insert into chat_messages(conversation_id, role, content, source) values ($1,'assistant',$2,$3)", [convId, reply.text, reply.source]);
    await q.query("update chat_conversations set updated_at = now() where id = $1", [convId]);
    return { conversationId: convId, reply: { content: reply.text, source: reply.source }, suggestEscalation: reply.suggestEscalation, usedAssessment: Boolean(ctx) };
  });
});

export const GET = api({ auth: true }, async ({ db }) => {
  const rows = await db((q) =>
    q.query<any>(
      `select c.id, c.title, c.escalated, c.escalated_at, c.updated_at, c.assessment_id, c.share_assessment, u.name as customer,
              (select count(*)::int from chat_messages m where m.conversation_id = c.id) as messages
         from chat_conversations c join users u on u.id = c.user_id order by c.updated_at desc limit 100`
    )
  );
  return { conversations: rows.rows };
});
void forbidden;
