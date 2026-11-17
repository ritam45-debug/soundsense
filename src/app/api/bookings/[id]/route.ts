import { z } from "zod";
import { api } from "@/lib/api";
import { applyBookingAction } from "@/lib/services/bookings";

const schema = z.object({
  action: z.enum(["reschedule_request", "cancel_request", "cancel", "confirm", "decline", "approve_reschedule", "decline_reschedule", "approve_cancel", "decline_cancel", "complete", "assign"]),
  slotStart: z.string().datetime().optional(),
  consultantId: z.uuid().nullable().optional(),
  note: z.string().trim().max(500).optional(),
});

export const PATCH = api({ auth: true, schema }, async ({ user, params, body }) => {
  const b = await applyBookingAction(user, params.id, body.action, body);
  return { booking: b };
});
