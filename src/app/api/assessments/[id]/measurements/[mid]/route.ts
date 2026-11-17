import { api, notFound } from "@/lib/api";
import { assertCanEdit, loadAssessment } from "@/lib/services/assessments";
import { audit } from "@/lib/audit";

export const DELETE = api({ auth: true }, async ({ db, params, user, ip }) => {
  await db(async (q) => {
    const a = await loadAssessment(q, params.id);
    assertCanEdit(user.role, a, user.id);
    const r = await q.query("delete from measurement_sessions where id = $1 and assessment_id = $2", [params.mid, a.id]);
    if (!r.rowCount) throw notFound("Recording not found.");
  });
  await audit(user, "measurement.delete", "assessment", params.id, { measurement: params.mid }, ip);
  return { ok: true };
});
