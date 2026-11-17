import { z } from "zod";
import { api } from "@/lib/api";
import { assertCanEdit, loadAssessment } from "@/lib/services/assessments";
import { audit } from "@/lib/audit";
import { j } from "@/lib/db";

const num = z.number().finite().min(-120).max(10);
const schema = z.object({
  kind: z.enum(["ambient", "speech", "other"]),
  label: z.string().trim().max(120).optional(),
  startedAt: z.string().datetime().optional(),
  durationS: z.number().min(2).max(3600),
  stats: z.object({ n: z.number().int().min(1).max(100000), minDb: num, maxDb: num, leqDb: num, l10Db: num, l50Db: num, l90Db: num }),
  samples: z.array(z.number().finite().min(-120).max(10)).max(400).optional(),
  calibration: z
    .object({
      status: z.enum(["uncalibrated", "single_point"]),
      offsetDb: z.number().min(-200).max(200).optional(),
      referenceDb: z.number().min(20).max(130).optional(),
      referenceInstrument: z.string().trim().max(120).optional(),
      note: z.string().max(300).optional(),
    })
    .refine((c) => c.status === "uncalibrated" || (c.offsetDb !== undefined && c.referenceInstrument), { message: "Calibration needs the reference reading and the instrument used." })
    .default({ status: "uncalibrated" }),
  deviceNote: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const POST = api({ auth: true, schema }, async ({ db, params, user, body, ip }) => {
  const row = await db(async (q) => {
    const a = await loadAssessment(q, params.id);
    assertCanEdit(user.role, a, user.id);
    const r = await q.query(
      `insert into measurement_sessions(assessment_id, kind, label, started_at, duration_s, stats, samples, calibration, device_note, notes)
       values ($1,$2,$3,coalesce($4::timestamptz, now()),$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10) returning id, kind, label, started_at, duration_s, stats, calibration`,
      [a.id, body.kind, body.label ?? null, body.startedAt ?? null, body.durationS, j(body.stats), body.samples ? j(body.samples) : null, j(body.calibration), body.deviceNote ?? null, body.notes ?? null]
    );
    return r.rows[0];
  });
  await audit(user, "measurement.save", "assessment", params.id, { kind: body.kind, calibration: body.calibration.status }, ip);
  return { measurement: row };
});
