import { api, forbidden } from "@/lib/api";
import { loadAssessment } from "@/lib/services/assessments";
import { sys } from "@/lib/db";

/** Change history for a case (consultants/admins). Read via owner connection after an RLS-checked access test. */
export const GET = api({ auth: ["consultant", "admin"] }, async ({ db, params, user }) => {
  await db(async (q) => {
    const a = await loadAssessment(q, params.id); // RLS: consultants only see their cases
    if (user.role === "consultant" && a.consultant_id !== user.id) throw forbidden();
  });
  const r = await sys(
    `select l.id, l.action, l.meta, l.created_at, l.actor_role, u.name as actor
       from audit_logs l left join users u on u.id = l.actor_id where l.entity = 'assessment' and l.entity_id = $1 order by l.id desc limit 200`,
    [params.id]
  );
  return { history: r.rows };
});
