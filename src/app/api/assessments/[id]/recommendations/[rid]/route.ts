import { z } from "zod";
import { api, bad, notFound } from "@/lib/api";
import { audit } from "@/lib/audit";
import { j } from "@/lib/db";

const schema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  priceMin: z.number().int().min(0).max(1_000_000_000).optional(),
  priceMax: z.number().int().min(0).max(1_000_000_000).optional(),
  isBestFit: z.boolean().optional(),
  consultantNote: z.string().trim().max(1000).optional(),
});

/** Consultants/admins adjust a recommendation; the original is kept in the audit log (change history). */
export const PATCH = api({ auth: ["consultant", "admin"], schema }, async ({ db, params, user, body, ip }) => {
  const { before, after } = await db(async (q) => {
    const cur = (await q.query<any>("select * from recommendations where id = $1 and assessment_id = $2", [params.rid, params.id])).rows[0];
    if (!cur) throw notFound("Recommendation not found.");
    const min = body.priceMin ?? cur.price_min;
    const max = body.priceMax ?? cur.price_max;
    if (max < min) throw bad("Maximum price must not be below the minimum.");
    const detail = { ...cur.detail, ...(body.consultantNote !== undefined ? { consultantNote: body.consultantNote } : {}) };
    if (body.isBestFit) await q.query("update recommendations set is_best_fit = false where assessment_id = $1 and problem_category = $2", [params.id, cur.problem_category]);
    const r = await q.query<any>(
      `update recommendations set title = coalesce($2, title), price_min = $3, price_max = $4, is_best_fit = coalesce($5, is_best_fit), detail = $6::jsonb,
              consultant_modified = true, updated_at = now() where id = $1 returning *`,
      [cur.id, body.title ?? null, min, max, body.isBestFit ?? null, j(detail)]
    );
    return { before: cur, after: r.rows[0] };
  });
  await audit(user, "recommendation.modify", "assessment", params.id, {
    recommendation: params.rid,
    before: { title: before.title, priceMin: before.price_min, priceMax: before.price_max, bestFit: before.is_best_fit },
    after: { title: after.title, priceMin: after.price_min, priceMax: after.price_max, bestFit: after.is_best_fit },
    note: body.consultantNote,
  }, ip);
  return { recommendation: after };
});
