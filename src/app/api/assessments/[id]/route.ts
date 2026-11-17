import { z } from "zod";
import { api, bad } from "@/lib/api";
import { assertCanEdit, getAssessmentFull, loadAssessment, saveAnswers } from "@/lib/services/assessments";
import { audit } from "@/lib/audit";
import { j } from "@/lib/db";

const uuid = z.uuid();

export const GET = api({ auth: true }, async ({ db, params, user }) => {
  if (!uuid.safeParse(params.id).success) throw bad("Invalid id.");
  const full = await db((q) => getAssessmentFull(q, params.id));
  // Customers must not see internal data.
  void user;
  return full;
});

const patch = z.object({
  answers: z.record(z.string(), z.any()).optional(),
  step: z.number().int().min(0).max(20).optional(),
  title: z.string().trim().max(150).optional(),
  share_with_chat: z.boolean().optional(),
});

export const PATCH = api({ auth: true, schema: patch }, async ({ db, params, user, body, ip }) => {
  if (!uuid.safeParse(params.id).success) throw bad("Invalid id.");
  const out = await db(async (q) => {
    const a = await loadAssessment(q, params.id);
    assertCanEdit(user.role, a, user.id);
    let errors: Record<string, string> = {};
    if (body.answers) {
      const merged: Record<string, any> = { ...(a.answers ?? {}) };
      for (const [k, v] of Object.entries(body.answers)) {
        if (v === null) delete merged[k];
        else merged[k] = v;
      }
      errors = (await saveAnswers(q, a.id, merged, false)).errors;
    }
    await q.query(
      "update assessments set step = coalesce($2, step), title = coalesce($3, title), share_with_chat = coalesce($4, share_with_chat), updated_at = now() where id = $1",
      [a.id, body.step ?? null, body.title ?? null, body.share_with_chat ?? null]
    );
    const fresh = await loadAssessment(q, a.id);
    return { assessment: fresh, errors };
  });
  if (body.share_with_chat !== undefined) await audit(user, body.share_with_chat ? "consent.chat_share_on" : "consent.chat_share_off", "assessment", params.id, {}, ip);
  return out;
});

export const DELETE = api({ auth: true }, async ({ db, params, user, ip }) => {
  if (!uuid.safeParse(params.id).success) throw bad("Invalid id.");
  await db(async (q) => {
    const a = await loadAssessment(q, params.id);
    if (a.status !== "draft" && user.role !== "admin") throw bad("Only drafts can be deleted.");
    await q.query("delete from assessments where id = $1", [a.id]);
  });
  await audit(user, "assessment.delete", "assessment", params.id, {}, ip);
  return { ok: true };
});
void j;
