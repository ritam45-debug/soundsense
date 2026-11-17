import { api } from "@/lib/api";

/** Reports visible to the caller (RLS: customers their own, consultants their cases, admins all). */
export const GET = api({ auth: true }, async ({ db }) => {
  const r = await db((q) =>
    q.query<any>(
      `select r.id, r.version, r.status, r.created_at, a.id as assessment_id, a.ref, a.title, u.name as customer_name,
              r.consultant_remarks is not null and r.consultant_remarks <> '' as has_remarks
         from reports r join assessments a on a.id = r.assessment_id join users u on u.id = a.customer_id
        order by r.created_at desc limit 300`
    )
  );
  return { reports: r.rows };
});
