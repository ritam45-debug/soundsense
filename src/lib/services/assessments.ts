import { Queryable, j } from "../db";
import { ApiError, forbidden, notFound } from "../api";
import { Answers, validateAnswers } from "../acoustics/questionnaire";
import { analyseRoom, RoomAnalysis, RoomInput } from "../acoustics/room";
import { buildFacts, diagnose, Diagnosis } from "../acoustics/diagnostic";
import { ProductRow, recommend, RecommendationSet } from "../acoustics/recommend";
import { summarise } from "../acoustics/summary";
import { LevelStats } from "../acoustics/measurement";
import { SessionUser } from "../db";

export type Role = SessionUser["role"];

export async function createAssessment(q: Queryable, user: { id: string; role: Role; organisationId?: string | null }, prefill: Answers = {}) {
  const seq = await q.query<{ n: number }>("select nextval('assessment_ref_seq')::int as n");
  const ref = `SS-${new Date().getFullYear()}-${seq.rows[0].n}`;
  const r = await q.query(
    `insert into assessments(ref, customer_id, organisation_id, answers) values ($1,$2,$3,$4::jsonb) returning *`,
    [ref, user.id, user.organisationId ?? null, j(prefill)]
  );
  return r.rows[0];
}

export async function loadAssessment(q: Queryable, id: string) {
  const r = await q.query("select * from assessments where id = $1", [id]);
  if (!r.rows[0]) throw notFound("Assessment not found.");
  return r.rows[0];
}

export function roomInputFromRow(r: any): RoomInput {
  return {
    length_m: Number(r.length_m),
    width_m: Number(r.width_m),
    height_m: Number(r.height_m),
    occupants: r.occupants,
    floor_material: r.floor_material,
    wall_material: r.wall_material,
    ceiling_material: r.ceiling_material,
    glass_share: r.glass_share,
    soft_furnishings: r.soft_furnishings,
    panels: r.panels,
  };
}

export async function saveRoom(q: Queryable, assessmentId: string, input: RoomInput, environment: string): Promise<RoomAnalysis> {
  const analysis = analyseRoom(input, environment);
  await q.query(
    `insert into rooms(assessment_id,length_m,width_m,height_m,occupants,floor_material,wall_material,ceiling_material,glass_share,soft_furnishings,panels,computed)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
     on conflict (assessment_id) do update set length_m=excluded.length_m,width_m=excluded.width_m,height_m=excluded.height_m,occupants=excluded.occupants,
       floor_material=excluded.floor_material,wall_material=excluded.wall_material,ceiling_material=excluded.ceiling_material,glass_share=excluded.glass_share,
       soft_furnishings=excluded.soft_furnishings,panels=excluded.panels,computed=excluded.computed,updated_at=now()`,
    [assessmentId, input.length_m, input.width_m, input.height_m, input.occupants, input.floor_material, input.wall_material, input.ceiling_material, input.glass_share, input.soft_furnishings, input.panels, j(analysis)]
  );
  return analysis;
}

export async function saveAnswers(q: Queryable, id: string, answers: Answers, final: boolean) {
  const { errors, clean } = validateAnswers(answers, final);
  if (final && Object.keys(errors).length) throw new ApiError(400, "Some required questions still need an answer.", "invalid", errors);
  // Hard errors in non-final saves are tolerated per-field (drop invalid values, keep the rest) but reported.
  await q.query("update assessments set answers = $2::jsonb, environment_type = $3, updated_at = now() where id = $1", [id, j(clean), clean.environment ?? null]);
  await q.query("delete from questionnaire_responses where assessment_id = $1", [id]);
  for (const [k, v] of Object.entries(clean)) {
    await q.query("insert into questionnaire_responses(assessment_id, question_key, value) values ($1,$2,$3::jsonb)", [id, k, j(v)]);
  }
  return { clean, errors };
}

/** Run diagnosis + recommendations and persist them. Consultant-edited recommendations are preserved. */
export async function runAnalysis(q: Queryable, id: string): Promise<{ diagnosis: Diagnosis; plan: RecommendationSet; room: RoomAnalysis | null; diagnosticId: string }> {
  const a = await loadAssessment(q, id);
  const answers: Answers = a.answers ?? {};
  const roomRow = (await q.query("select * from rooms where assessment_id = $1", [id])).rows[0];
  const room = roomRow ? analyseRoom(roomInputFromRow(roomRow), answers.environment ?? "other") : null;
  const ms = (await q.query("select kind, stats, calibration from measurement_sessions where assessment_id = $1 order by started_at", [id])).rows;
  const facts = buildFacts(
    answers,
    room,
    ms.map((m: any) => ({ kind: m.kind, stats: m.stats as LevelStats, calibrated: m.calibration?.status === "single_point" }))
  );
  const diagnosis = diagnose(facts);
  const products = (await q.query<any>("select * from products where active")).rows as ProductRow[];
  const plan = recommend(diagnosis, answers, products.map((p: any) => ({ ...p, advantages: p.advantages ?? [], limitations: p.limitations ?? [], suitability: p.suitability ?? {} })));

  const d = await q.query<{ id: string }>(
    `insert into diagnostic_results(assessment_id, engine_version, primary_category, scores, confidence, confidence_level, result, expert_inspection)
     values ($1,$2,$3,$4::jsonb,$5,$6,$7::jsonb,$8) returning id`,
    [id, diagnosis.engineVersion, diagnosis.primary, j(diagnosis.scores), diagnosis.confidence, diagnosis.confidenceLevel, j({ diagnosis, plan, room }), diagnosis.expertInspection.needed]
  );
  const diagnosticId = d.rows[0].id;

  const keep = (await q.query<{ problem_category: string }>("select distinct problem_category from recommendations where assessment_id = $1 and consultant_modified", [id])).rows.map((r) => r.problem_category);
  await q.query("delete from recommendations where assessment_id = $1 and not consultant_modified", [id]);
  for (const c of plan.categories) {
    if (keep.includes(c.category)) continue;
    for (const tier of ["budget", "recommended", "premium"] as const) {
      const it = c.items[tier];
      if (!it) continue;
      await q.query(
        `insert into recommendations(assessment_id, diagnostic_id, problem_category, tier, is_best_fit, product_id, title, detail, price_min, price_max)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
        [id, diagnosticId, c.category, tier, c.bestFit === tier, it.productId ?? null, it.title, j({ ...it, whyBestFit: c.bestFit === tier ? c.whyBestFit : [] }), it.priceMin, it.priceMax]
      );
    }
  }
  await q.query("update assessments set summary = $2::jsonb, updated_at = now() where id = $1", [id, j(summarise(answers))]);
  return { diagnosis, plan, room, diagnosticId };
}

/** Everything the UI needs for one assessment, honouring RLS for whoever `q` runs as. */
export async function getAssessmentFull(q: Queryable, id: string) {
  const a = await loadAssessment(q, id);
  const [room, ms, diag, recs, reports, notes, docs, bookings, customer, consultant, history] = await Promise.all([
    q.query("select * from rooms where assessment_id = $1", [id]),
    q.query("select id, kind, label, started_at, duration_s, stats, samples, calibration, device_note, notes from measurement_sessions where assessment_id = $1 order by started_at", [id]),
    q.query("select id, engine_version, primary_category, scores, confidence, confidence_level, result, expert_inspection, created_at from diagnostic_results where assessment_id = $1 order by created_at desc limit 1", [id]),
    q.query("select * from recommendations where assessment_id = $1 order by problem_category, case tier when 'budget' then 1 when 'recommended' then 2 else 3 end", [id]),
    q.query("select id, version, status, consultant_remarks, created_at, generated_by from reports where assessment_id = $1 order by version desc", [id]),
    q.query("select n.id, n.body, n.visibility, n.created_at, u.name as author from case_notes n join users u on u.id = n.author_id where n.assessment_id = $1 order by n.created_at", [id]),
    q.query("select d.id, d.filename, d.mime_type, d.size_bytes, d.created_at, u.name as uploader from case_documents d join users u on u.id = d.uploader_id where d.assessment_id = $1 order by d.created_at", [id]),
    q.query("select id, ref, type, slot_start, status from bookings where assessment_id = $1 order by slot_start desc", [id]),
    q.query("select id, name, email, phone from users where id = $1", [a.customer_id]),
    a.consultant_id ? q.query("select id, name, email from users where id = $1", [a.consultant_id]) : Promise.resolve({ rows: [] as any[] }),
    q.query("select count(*)::int c from audit_logs where false"),
  ]);
  void history;
  const d = diag.rows[0];
  return {
    assessment: a,
    room: room.rows[0] ? { ...room.rows[0], analysis: room.rows[0].computed } : null,
    measurements: ms.rows,
    diagnostic: d ? { id: d.id, createdAt: d.created_at, ...d.result } : null,
    recommendations: recs.rows,
    reports: reports.rows,
    notes: notes.rows,
    documents: docs.rows,
    bookings: bookings.rows,
    customer: customer.rows[0] ?? null,
    consultant: consultant.rows[0] ?? null,
  };
}

export function assertCanEdit(role: Role, a: any, uid: string) {
  if (role === "admin") return;
  if (role === "customer" && a.customer_id === uid && a.status !== "completed") return;
  if (role === "consultant" && a.consultant_id === uid) return;
  throw forbidden("You cannot change this assessment.");
}
