import { z } from "zod";
import { api, bad, forbidden } from "@/lib/api";
import { loadAssessment } from "@/lib/services/assessments";
import { audit, notify } from "@/lib/audit";
import { sys } from "@/lib/db";

const schema = z.object({
  status: z.enum(["submitted", "in_review", "completed"]).optional(),
  consultantId: z.uuid().nullable().optional(),
});

/** Case management: admins assign consultants and set any status; assigned consultants move their cases along. */
export const PATCH = api({ auth: ["consultant", "admin"], schema }, async ({ db, params, user, body, ip }) => {
  if (body.consultantId !== undefined && user.role !== "admin") throw forbidden("Only administrators assign consultants.");
  const { before, after } = await db(async (q) => {
    const a = await loadAssessment(q, params.id);
    if (user.role === "consultant" && a.consultant_id !== user.id) throw forbidden();
    if (a.status === "draft") throw bad("The customer has not submitted this assessment yet.");
    const nextConsultant = body.consultantId === undefined ? a.consultant_id : body.consultantId;
    const nextStatus = body.status ?? (body.consultantId && a.status === "submitted" ? "in_review" : a.status);
    const r = await q.query<any>(
      `update assessments set consultant_id = $2, status = $3, completed_at = case when $3 = 'completed' then coalesce(completed_at, now()) else null end, updated_at = now() where id = $1 returning *`,
      [a.id, nextConsultant, nextStatus]
    );
    return { before: a, after: r.rows[0] };
  });
  if (body.consultantId) {
    const c = await sys<{ role: string }>("select role from users where id = $1 and is_active", [body.consultantId]);
    if (c.rows[0]?.role !== "consultant") throw bad("Choose an active consultant.");
    await notify(body.consultantId, "New case assigned", after.ref, `/app/assessments/${after.id}`);
    await notify(after.customer_id, "A consultant has been assigned to your assessment", after.ref, `/app/assessments/${after.id}`);
  }
  if (body.status && body.status !== before.status) await notify(after.customer_id, `Assessment ${body.status.replace("_", " ")}`, after.ref, `/app/assessments/${after.id}`);
  await audit(user, "assessment.manage", "assessment", params.id, { from: { status: before.status, consultant: before.consultant_id }, to: { status: after.status, consultant: after.consultant_id } }, ip);
  return { assessment: after };
});
