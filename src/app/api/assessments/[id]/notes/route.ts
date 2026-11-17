import { z } from "zod";
import { api } from "@/lib/api";
import { loadAssessment } from "@/lib/services/assessments";
import { audit, notify } from "@/lib/audit";

const schema = z.object({ body: z.string().trim().min(1, "Write a remark first.").max(5000), visibility: z.enum(["internal", "customer"]).default("internal") });

export const POST = api({ auth: ["consultant", "admin"], schema }, async ({ db, params, user, body, ip }) => {
  const { note, a } = await db(async (q) => {
    const a = await loadAssessment(q, params.id);
    const r = await q.query("insert into case_notes(assessment_id, author_id, body, visibility) values ($1,$2,$3,$4) returning id, body, visibility, created_at", [a.id, user.id, body.body, body.visibility]);
    return { note: r.rows[0], a };
  });
  await audit(user, "note.add", "assessment", params.id, { visibility: body.visibility }, ip);
  if (body.visibility === "customer") await notify(a.customer_id, "New remark from your consultant", a.ref, `/app/assessments/${a.id}`);
  return { note };
});
