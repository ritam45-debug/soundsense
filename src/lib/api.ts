import { NextRequest, NextResponse } from "next/server";
import { ZodType } from "zod";
import { AuthUser, COOKIE_NAME, userFromToken } from "./auth/session";
import { rateLimit } from "./rateLimit";
import { asUser, Queryable, SessionUser } from "./db";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = "error", public fields?: Record<string, string>) {
    super(message);
  }
}
export const bad = (m: string, fields?: Record<string, string>) => new ApiError(400, m, "invalid", fields);
export const forbidden = (m = "You do not have access to this.") => new ApiError(403, m, "forbidden");
export const notFound = (m = "Not found.") => new ApiError(404, m, "not_found");
export const conflict = (m: string) => new ApiError(409, m, "conflict");

type Role = AuthUser["role"];
export interface Ctx<B = unknown> {
  req: NextRequest;
  user: AuthUser;
  body: B;
  params: Record<string, string>;
  query: URLSearchParams;
  ip: string;
  /** Run SQL under Row Level Security as the current user. */
  db: <T>(fn: (q: Queryable) => Promise<T>) => Promise<T>;
}
export interface PublicCtx<B = unknown> extends Omit<Ctx<B>, "user" | "db"> {
  user: AuthUser | null;
}

export const clientIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";

function zodFields(issues: { path: PropertyKey[]; message: string }[]) {
  const f: Record<string, string> = {};
  for (const i of issues) f[i.path.join(".") || "_"] ??= i.message;
  return f;
}

function hasNul(v: unknown, depth = 0): boolean {
  if (typeof v === "string") return v.includes("\u0000");
  if (depth > 8 || v === null || typeof v !== "object") return false;
  return Object.entries(v as object).some(([k, x]) => k.includes("\u0000") || hasNul(x, depth + 1));
}

interface Opts<B> {
  /** false = public; true = any signed-in user; array = those roles only. */
  auth?: boolean | Role[];
  schema?: ZodType<B>;
  /** Extra per-IP limit for this route, e.g. login attempts. */
  limit?: { name: string; max: number; windowSec: number };
  /** Allow signed-in but e-mail-unverified users (default false for state-changing routes when verification required). */
  allowUnverified?: boolean;
}

/** Wraps a route handler with origin check, rate limiting, auth, validation and uniform errors. */
export function api<B = unknown>(opts: Opts<B>, handler: (c: Ctx<B>) => Promise<unknown>) {
  return async (req: NextRequest, routeCtx: { params: Promise<any> }) => {
    try {
      const ip = clientIp(req);
      const method = req.method.toUpperCase();

      // CSRF defence in depth (cookies are SameSite=Lax already): same-origin only for state changes.
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        const origin = req.headers.get("origin");
        const host = req.headers.get("host");
        if (origin && host) {
          let ok = false;
          try {
            ok = new URL(origin).host === host;
          } catch {}
          if (!ok) throw new ApiError(403, "Cross-origin request blocked.", "csrf");
        }
      }

      const g = await rateLimit(`ip:${ip}:all`, 240, 60);
      if (!g.ok) throw new ApiError(429, "Too many requests. Please slow down.", "rate_limited");
      if (opts.limit) {
        const l = await rateLimit(`ip:${ip}:${opts.limit.name}`, opts.limit.max, opts.limit.windowSec);
        if (!l.ok)
          throw new ApiError(429, `Too many attempts. Try again in ${Math.ceil(l.retryAfter / 60)} minute(s).`, "rate_limited");
      }

      const user = await userFromToken(req.cookies.get(COOKIE_NAME())?.value);
      if (opts.auth) {
        if (!user) throw new ApiError(401, "Please sign in to continue.", "unauthenticated");
        if (Array.isArray(opts.auth) && !opts.auth.includes(user.role)) throw forbidden();
      }

      let body: unknown = undefined;
      if (opts.schema) {
        let raw: unknown = {};
        if (method !== "GET") {
          const ct = req.headers.get("content-type") ?? "";
          if (!ct.includes("application/json")) throw new ApiError(415, "Send JSON.", "unsupported_media_type");
          raw = await req.json().catch(() => {
            throw bad("Request body is not valid JSON.");
          });
          // PostgreSQL text/jsonb cannot hold NUL; reject up front instead of surfacing a 500.
          if (hasNul(raw)) throw bad("Input contains invalid characters.");
        }
        const parsed = opts.schema.safeParse(raw);
        if (!parsed.success) {
          const fields = zodFields(parsed.error.issues as any);
          throw bad(Object.values(fields)[0] ?? "Invalid input.", fields);
        }
        body = parsed.data;
      }

      const params: Record<string, string> = routeCtx?.params ? await routeCtx.params : {};
      const ctx: PublicCtx = { req, user, body, params, query: req.nextUrl.searchParams, ip };
      // Public routes get no `db`; authenticated routes always have a non-null `user` (checked above).
      const out = await handler(
        (opts.auth
          ? {
              ...ctx,
              user,
              db: <T>(fn: (q: Queryable) => Promise<T>) => asUser(user as SessionUser, fn),
            }
          : ctx) as unknown as Ctx<B>
      );
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof ApiError) {
        return NextResponse.json({ error: { message: e.message, code: e.code, fields: e.fields } }, { status: e.status });
      }
      console.error("[api] unhandled", e);
      return NextResponse.json({ error: { message: "Something went wrong on our side. Please try again.", code: "server_error" } }, { status: 500 });
    }
  };
}
