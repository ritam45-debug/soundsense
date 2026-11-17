import { Queryable } from "../db";
import { optionLabel } from "../acoustics/questionnaire";
import { CATEGORY_SHORT, DiagnosisCategory } from "../acoustics/types";

export interface StatsFilter {
  from: string; // YYYY-MM-DD
  to: string;
  category?: string; // diagnostic primary category or 'multiple'
  environment?: string;
}

/**
 * Dashboard metrics. Every number is a live SQL aggregate executed under the caller's Row Level Security,
 * so customers see only their own data, consultants their assigned cases and admins everything.
 */
export async function getStats(q: Queryable, role: string, f: StatsFilter) {
  const params: any[] = [f.from, f.to];
  const conds = ["a.created_at >= $1::date", "a.created_at < ($2::date + 1)"];
  if (f.environment) {
    params.push(f.environment);
    conds.push(`a.environment_type = $${params.length}`);
  }
  let join = "";
  if (f.category) {
    params.push(f.category);
    join = `join lateral (select primary_category, result from diagnostic_results d where d.assessment_id = a.id order by created_at desc limit 1) ld on ld.primary_category = $${params.length} or (ld.primary_category = 'multiple' and ld.result->'diagnosis'->'contributing' ? $${params.length})`;
  }
  const where = conds.join(" and ");
  const base = `from assessments a ${join} where ${where}`;

  const span = (new Date(f.to).getTime() - new Date(f.from).getTime()) / 864e5;
  const bucket = span <= 62 ? "day" : span <= 400 ? "week" : "month";

  const [totals, byCat, issues, series, bookingStatus, bookingTotals, customers, fb, fbDist, fbRecent] = await Promise.all([
    q.query<any>(
      `select count(*)::int total,
              count(*) filter (where a.status = 'completed')::int completed,
              count(*) filter (where a.status in ('submitted','in_review'))::int in_progress,
              count(*) filter (where a.status = 'draft')::int drafts ${base}`, params),
    q.query<any>(
      `select ld2.primary_category as category, count(*)::int n
         from assessments a ${join}
         join lateral (select primary_category from diagnostic_results d where d.assessment_id = a.id order by created_at desc limit 1) ld2 on true
        where ${where} group by 1 order by 2 desc`, params),
    q.query<any>(
      `select v as problem, count(*)::int n
         from assessments a ${join}
         join questionnaire_responses r on r.assessment_id = a.id and r.question_key = 'q2_problems'
         cross join lateral jsonb_array_elements_text(r.value) v
        where ${where} group by 1 order by 2 desc limit 12`, params),
    q.query<any>(
      `select to_char(date_trunc('${bucket}', a.created_at), 'YYYY-MM-DD') as d, count(*)::int n ${base} group by 1 order by 1`, params),
    q.query<any>(
      `select b.status, count(*)::int n from bookings b where b.created_at >= $1::date and b.created_at < ($2::date + 1) group by 1`, [f.from, f.to]),
    q.query<any>(
      `select count(*) filter (where status in ('requested','reschedule_requested','cancel_requested'))::int active,
              count(*) filter (where status = 'requested')::int pending,
              count(*) filter (where status = 'confirmed' and slot_start >= now())::int upcoming from bookings`),
    q.query<any>(
      role === "admin"
        ? "select count(*)::int n from users where role = 'customer'"
        : "select count(distinct customer_id)::int n from assessments"),
    q.query<any>(
      `select count(*)::int n, round(avg(overall)::numeric, 2)::float avg_overall, round(avg(usefulness)::numeric,2)::float usefulness,
              round(avg(consultation)::numeric,2)::float consultation, round(avg(improvement)::numeric,2)::float improvement,
              round(avg(value_for_money)::numeric,2)::float value
         from feedback where created_at >= $1::date and created_at < ($2::date + 1)`, [f.from, f.to]),
    q.query<any>(`select overall as stars, count(*)::int n from feedback where created_at >= $1::date and created_at < ($2::date + 1) group by 1 order by 1`, [f.from, f.to]),
    q.query<any>(`select overall, comments, improve_text, created_at from feedback where (comments is not null or improve_text is not null) and created_at >= $1::date and created_at < ($2::date + 1) order by created_at desc limit 5`, [f.from, f.to]),
  ]);

  const t = totals.rows[0];
  const identified = byCat.rows.reduce((s: number, r: any) => s + r.n, 0);
  return {
    scope: role === "admin" ? "all" : role === "consultant" ? "assigned" : "own",
    range: { from: f.from, to: f.to, bucket },
    totals: {
      assessments: t.total, completed: t.completed, inProgress: t.in_progress, drafts: t.drafts,
      identifiedProblems: identified,
      activeConsultations: bookingTotals.rows[0].active,
      pendingConsultations: bookingTotals.rows[0].pending,
      upcomingConsultations: bookingTotals.rows[0].upcoming,
      customers: customers.rows[0].n,
      satisfaction: fb.rows[0].avg_overall,
      feedbackCount: fb.rows[0].n,
    },
    issueDistribution: byCat.rows.map((r: any) => ({ key: r.category, label: CATEGORY_SHORT[r.category as DiagnosisCategory] ?? r.category, value: r.n })),
    reportedProblems: issues.rows.map((r: any) => ({ key: r.problem, label: optionLabel("q2_problems", r.problem), value: r.n })),
    assessmentsOverTime: series.rows.map((r: any) => ({ date: r.d, value: r.n })),
    bookingStatus: bookingStatus.rows.map((r: any) => ({ key: r.status, value: r.n })),
    feedback: {
      count: fb.rows[0].n,
      averages: { overall: fb.rows[0].avg_overall, usefulness: fb.rows[0].usefulness, consultation: fb.rows[0].consultation, improvement: fb.rows[0].improvement, value: fb.rows[0].value },
      distribution: [1, 2, 3, 4, 5].map((s) => ({ stars: s, value: fbDist.rows.find((r: any) => r.stars === s)?.n ?? 0 })),
      recent: fbRecent.rows,
    },
  };
}
