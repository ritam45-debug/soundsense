import { api } from "@/lib/api";

/** Active consultants (used for assignment menus). */
export const GET = api({ auth: ["admin", "consultant"] }, async ({ db }) => {
  const r = await db((q) =>
    q.query<any>(
      `select u.id, u.name, u.email, c.specialisation, c.max_cases,
              (select count(*)::int from assessments a where a.consultant_id = u.id and a.status <> 'completed') as open_cases
         from users u join consultants c on c.user_id = u.id where u.role = 'consultant' and u.is_active and c.active order by u.name`
    )
  );
  return { consultants: r.rows };
});
