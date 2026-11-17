import { z } from "zod";
import { api } from "@/lib/api";
import { audit } from "@/lib/audit";
import { j, sys } from "@/lib/db";
import { DEFAULT_AVAILABILITY, getAvailabilitySettings } from "@/lib/services/bookings";
import { aiConfigured, requireEmailVerification } from "@/lib/env";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
const availability = z
  .object({
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    start: hhmm,
    end: hhmm,
    breakStart: hhmm.nullable(),
    breakEnd: hhmm.nullable(),
    slotMinutes: z.number().int().min(15).max(240),
    capacity: z.number().int().min(1).max(20),
    leadHours: z.number().int().min(0).max(240),
    horizonDays: z.number().int().min(1).max(60),
    utcOffsetMinutes: z.number().int().min(-720).max(840),
    timezoneLabel: z.string().max(40),
  })
  .refine((a) => a.start < a.end, { message: "Start must be before end.", path: ["end"] });

export const GET = api({ auth: ["admin"] }, async () => ({
  availability: await getAvailabilitySettings(),
  defaults: DEFAULT_AVAILABILITY,
  system: { aiConfigured: aiConfigured(), emailVerificationRequired: requireEmailVerification(), smtpConfigured: Boolean(process.env.SMTP_HOST), databaseKind: process.env.DATABASE_URL ? "PostgreSQL (external)" : "Embedded PostgreSQL (PGlite)" },
}));

export const PUT = api({ auth: ["admin"], schema: z.object({ availability }) }, async ({ body, user, ip }) => {
  await sys("insert into system_settings(key, value, updated_by) values ('availability', $1::jsonb, $2) on conflict (key) do update set value = $1::jsonb, updated_by = $2, updated_at = now()", [j(body.availability), user.id]);
  await audit(user, "settings.availability", "settings", "availability", body.availability as any, ip);
  return { ok: true };
});
