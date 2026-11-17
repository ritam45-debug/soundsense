import { sys } from "./db";

/**
 * Fixed-window rate limiter backed by Postgres so it works on serverless hosts
 * (an in-memory counter would reset on every cold start / differ per instance).
 * Returns true when the request is ALLOWED.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<{ ok: boolean; retryAfter: number }> {
  const r = await sys<{ count: number; ws: Date }>(
    `insert into rate_limits(key, window_start, count)
     values ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), 1)
     on conflict (key, window_start) do update set count = rate_limits.count + 1
     returning count, window_start as ws`,
    [key, windowSec]
  );
  const { count, ws } = r.rows[0];
  if (Math.random() < 0.01) sys("delete from rate_limits where window_start < now() - interval '2 days'").catch(() => {});
  const retryAfter = Math.max(1, Math.ceil((new Date(ws).getTime() + windowSec * 1000 - Date.now()) / 1000));
  return { ok: count <= limit, retryAfter };
}
