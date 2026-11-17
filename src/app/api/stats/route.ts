import { z } from "zod";
import { api } from "@/lib/api";
import { getStats } from "@/lib/services/stats";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const q = z.object({
  from: date.optional(),
  to: date.optional(),
  category: z.enum(["room", "microphone", "speaker", "noise", "conference", "connectivity", "hybrid", "multiple"]).optional(),
  environment: z.string().max(40).optional(),
});

export const GET = api({ auth: true }, async ({ db, user, query }) => {
  const p = q.parse(Object.fromEntries([...query].filter(([, v]) => v !== "")));
  const to = p.to ?? new Date().toISOString().slice(0, 10);
  const from = p.from ?? new Date(Date.now() - 89 * 864e5).toISOString().slice(0, 10);
  return db((c) => getStats(c, user.role, { from, to, category: p.category, environment: p.environment }));
});
