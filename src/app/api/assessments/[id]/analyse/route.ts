import { api } from "@/lib/api";
import { assertCanEdit, getAssessmentFull, loadAssessment, runAnalysis } from "@/lib/services/assessments";
import { audit } from "@/lib/audit";

/** Re-run the diagnostic + recommendation engines (e.g. after adding room data or recordings). */
export const POST = api({ auth: true }, async ({ db, params, user, ip }) => {
  const out = await db(async (q) => {
    const a = await loadAssessment(q, params.id);
    assertCanEdit(user.role, a, user.id);
    await runAnalysis(q, a.id);
    return getAssessmentFull(q, a.id);
  });
  await audit(user, "assessment.reanalyse", "assessment", params.id, {}, ip);
  return out;
});
