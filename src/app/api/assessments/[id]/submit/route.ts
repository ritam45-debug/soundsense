import { z } from "zod";
import { api, conflict, forbidden } from "@/lib/api";
import { assertCanEdit, getAssessmentFull, loadAssessment, runAnalysis, saveAnswers } from "@/lib/services/assessments";
import { createReport } from "@/lib/services/report-data";
import { audit, notifyRole } from "@/lib/audit";

/** Final submission: enforces required answers + consent, runs the diagnosis and issues a preliminary report. */
export const POST = api({ auth: ["customer"], schema: z.object({ share_with_chat: z.boolean().optional() }) }, async ({ db, params, user, body, ip }) => {
  const result = await db(async (q) => {
    const a = await loadAssessment(q, params.id);
    if (a.customer_id !== user.id) throw forbidden();
    assertCanEdit(user.role, a, user.id);
    if (a.status === "completed") throw conflict("This assessment is already completed.");
    await saveAnswers(q, a.id, a.answers ?? {}, true); // throws a field-level 400 if anything required is missing
    const share = body.share_with_chat ?? (a.answers?.consent_chat === true);
    await q.query(
      "update assessments set status = case when status = 'draft' then 'submitted' else status end, submitted_at = coalesce(submitted_at, now()), share_with_chat = $2, step = 99, updated_at = now() where id = $1",
      [a.id, share]
    );
    await runAnalysis(q, a.id);
    const report = await createReport(q, a.id, user.id, { status: "preliminary" });
    return { reportId: report.id, full: await getAssessmentFull(q, a.id) };
  });
  await audit(user, "assessment.submit", "assessment", params.id, {}, ip);
  await notifyRole("admin", "New assessment submitted", `${result.full.assessment.ref} – ${result.full.assessment.summary?.headline ?? ""}`, `/app/assessments`);
  return result;
});
