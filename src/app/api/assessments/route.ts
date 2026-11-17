import { z } from "zod";
import { api, forbidden } from "@/lib/api";
import { createAssessment } from "@/lib/services/assessments";
import { audit } from "@/lib/audit";

const querySchema = z.object({
  status: z.enum(["draft", "submitted", "in_review", "completed"]).optional(),
  q: z.string().max(100).optional(),
  category: z.string().max(30).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const GET = api({ auth: true }, async ({ db, query }) => {
  const p = querySchema.parse(Object.fromEntries(query));
  const params: any[] = [];
  const conds: string[] = [];
  if (p.status) (params.push(p.status), conds.push(`a.status = $${params.length}`));
  if (p.category) (params.push(p.category), conds.push(`ld.primary_category = $${params.length}`));
  if (p.q) {
    params.push(`%${p.q.replace(/[%_\\]/g, "\\$&")}%`);
    conds.push(`(a.ref ilike $${params.length} or a.title ilike $${params.length} or cu.name ilike $${params.length} or a.answers->>'organisation' ilike $${params.length})`);
  }
  const where = conds.length ? `where ${conds.join(" and ")}` : "";
  const rows = await db(async (q) => {
    const total = await q.query<{ n: number }>(
      `select count(*)::int n from assessments a join users cu on cu.id = a.customer_id
        left join lateral (select primary_category from diagnostic_results d where d.assessment_id = a.id order by created_at desc limit 1) ld on true ${where}`, params);
    const r = await q.query<any>(
      `select a.id, a.ref, a.title, a.status, a.step, a.environment_type, a.created_at, a.updated_at, a.summary->>'headline' as headline,
              a.answers->>'organisation' as organisation, cu.name as customer_name, co.name as consultant_name, a.consultant_id,
              ld.primary_category, ld.confidence_level, ld.expert_inspection
         from assessments a join users cu on cu.id = a.customer_id left join users co on co.id = a.consultant_id
         left join lateral (select primary_category, confidence_level, expert_inspection from diagnostic_results d where d.assessment_id = a.id order by created_at desc limit 1) ld on true
         ${where} order by a.updated_at desc limit ${p.limit} offset ${p.offset}`, params);
    return { total: total.rows[0].n, items: r.rows };
  });
  return rows;
});

export const POST = api({ auth: true, schema: z.object({ title: z.string().trim().max(150).optional() }) }, async ({ db, user, body, ip }) => {
  if (user.role !== "customer") throw forbidden("Only customers start assessments. Open a case from the case list instead.");
  const a = await db(async (q) => {
    const me = (await q.query<any>(
      `select u.name, u.email, u.phone, o.name as organisation, o.city, p.designation, p.location
         from users u left join organisations o on o.id = u.organisation_id left join customer_profiles p on p.user_id = u.id where u.id = $1`, [user.id])).rows[0];
    const prefill: Record<string, string> = { contact_name: me.name, contact_email: me.email };
    if (me.phone) prefill.contact_phone = me.phone;
    if (me.organisation) prefill.organisation = me.organisation;
    if (me.designation) prefill.designation = me.designation;
    if (me.location || me.city) prefill.location = me.location ?? me.city;
    const row = await createAssessment(q, user, prefill);
    if (body.title) await q.query("update assessments set title = $2 where id = $1", [row.id, body.title]);
    return row;
  });
  await audit(user, "assessment.create", "assessment", a.id, { ref: a.ref }, ip);
  return { assessment: a };
});
