import { z } from "zod";
import { api } from "@/lib/api";
import { getAvailabilitySettings, listSlots } from "@/lib/services/bookings";

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Slots for a date range. Unavailable slots are included with available=false and a reason so the UI never offers them. */
export const GET = api({ auth: true }, async ({ query }) => {
  const s = await getAvailabilitySettings();
  const today = new Date(Date.now() + s.utcOffsetMinutes * 6e4).toISOString().slice(0, 10);
  const from = iso.catch(today).parse(query.get("from"));
  const plus = new Date(+new Date(`${from}T00:00:00Z`) + 13 * 864e5).toISOString().slice(0, 10);
  const to = iso.catch(plus).parse(query.get("to"));
  const slots = await listSlots(from, to);
  return {
    timezone: s.timezoneLabel,
    from,
    to,
    horizonDays: s.horizonDays,
    slotMinutes: s.slotMinutes,
    slots,
  };
});
