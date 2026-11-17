import { z } from "zod";
import { api, forbidden } from "@/lib/api";
import { loadAssessment, runAnalysis } from "@/lib/services/assessments";
import { createReport } from "@/lib/services/report-data";
import { audit, notify } from "@/lib/audit";

const schema = z.object({ remarks: z.string().trim().max(5000).optional(), final: z.boolean().default(false), markCompleted: z.boolean().default(false) });

/** Customers can refresh their preliminary report; consultants/admins issue final reports with remarks. */
export const POST = api({ auth: true, schema }, async ({ db, params, user, body, ip }) => {
  if (body.final && user.role === "customer") throw forbidden("Only a consultant can issue a final report.");
  const out = await db(async (q) => {
    const a = await loadAssessment(q, params.id);
    if (user.role === "consultant" && a.consultant_id !== user.id) throw forbidden();
    if (a.status === "draft") throw forbidden("Submit the assessment first.");
    if (!body.final) await runAnalysis(q, a.id); // keep the preliminary report current
    const rep = await createReport(q, a.id, user.id, { status: body.final ? "final" : "preliminary", remarks: body.remarks });
    if (body.final && body.markCompleted) await q.query("update assessments set status = 'completed', completed_at = now(), updated_at = now() where id = $1", [a.id]);
    return { report: { id: rep.id, version: rep.version, status: body.final ? "final" : "preliminary" }, customerId: a.customer_id, ref: a.ref, aid: a.id };
  });
  await audit(user, body.final ? "report.final" : "report.preliminary", "assessment", params.id, { version: out.report.version }, ip);
  if (body.final) await notify(out.customerId, "Your final report is ready", out.ref, `/app/assessments/${out.aid}`);
  return out;
});
