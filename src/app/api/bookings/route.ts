import { z } from "zod";
import { api, forbidden } from "@/lib/api";
import { BOOKING_TYPES, createBooking } from "@/lib/services/bookings";

export const GET = api({ auth: true }, async ({ db, query }) => {
  const status = query.get("status");
  const rows = await db((q) =>
    q.query<any>(
      `select b.*, cu.name as customer_name, cu.email as customer_email, co.name as consultant_name, a.ref as assessment_ref
         from bookings b join users cu on cu.id = b.customer_id left join users co on co.id = b.consultant_id left join assessments a on a.id = b.assessment_id
        ${status ? "where b.status = $1" : ""} order by b.slot_start desc limit 300`,
      status ? [status] : []
    )
  );
  return { bookings: rows.rows };
});

const schema = z.object({
  type: z.enum(BOOKING_TYPES.map((t) => t.value) as [string, ...string[]]),
  slotStart: z.string().datetime(),
  description: z.string().trim().min(10, "Tell us a little about the problem (at least 10 characters).").max(2000),
  assessmentId: z.uuid().nullable().optional(),
  contact: z.object({ name: z.string().trim().min(1).max(150), email: z.email().max(200), phone: z.string().trim().max(30).optional() }),
});

export const POST = api({ auth: ["customer"], schema, limit: { name: "book", max: 20, windowSec: 3600 } }, async ({ user, body }) => {
  if (!user) throw forbidden();
  const b = await createBooking(user, body);
  return { booking: b };
});
