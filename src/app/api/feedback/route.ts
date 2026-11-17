import { z } from "zod";
import { api, conflict } from "@/lib/api";
import { audit, notifyRole } from "@/lib/audit";

const star = z.number().int().min(1).max(5);
const schema = z.object({
  assessmentId: z.uuid().nullable().optional(),
  bookingId: z.uuid().nullable().optional(),
  overall: star,
  usefulness: star,
  consultation: star.optional(),
  improvement: star.optional(),
  valueForMoney: star,
  improveText: z.string().trim().max(2000).optional(),
  comments: z.string().trim().max(4000).optional(),
});

export const POST = api({ auth: ["customer"], schema }, async ({ db, user, body, ip }) => {
  const row = await db(async (q) => {
    if (body.assessmentId) {
      const dup = await q.query("select 1 from feedback where customer_id = $1 and assessment_id = $2 and booking_id is not distinct from $3", [user.id, body.assessmentId, body.bookingId ?? null]);
      if (dup.rowCount) throw conflict("You have already sent feedback for this one – thank you!");
    }
    const r = await q.query(
      `insert into feedback(customer_id, assessment_id, booking_id, overall, usefulness, consultation, improvement, value_for_money, improve_text, comments)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id, created_at`,
      [user.id, body.assessmentId ?? null, body.bookingId ?? null, body.overall, body.usefulness, body.consultation ?? null, body.improvement ?? null, body.valueForMoney, body.improveText ?? null, body.comments ?? null]
    );
    return r.rows[0];
  });
  await audit(user, "feedback.submit", "feedback", row.id, { overall: body.overall }, ip);
  if (body.overall <= 2) await notifyRole("admin", "Low satisfaction rating received", `Overall ${body.overall}/5`, "/app/admin/feedback");
  return { ok: true, id: row.id };
});

export const GET = api({ auth: true }, async ({ db }) => {
  const r = await db((q) =>
    q.query<any>(
      `select f.id, f.overall, f.usefulness, f.consultation, f.improvement, f.value_for_money, f.improve_text, f.comments, f.created_at, f.assessment_id,
              u.name as customer, a.ref as assessment_ref
         from feedback f join users u on u.id = f.customer_id left join assessments a on a.id = f.assessment_id order by f.created_at desc limit 200`
    )
  );
  return { feedback: r.rows };
});
