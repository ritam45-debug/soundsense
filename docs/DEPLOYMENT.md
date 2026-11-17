# Deployment

> **What has and has not been verified.** The production build (`next build` / `next start`), the migrations, the seed and the full automated test suite were run against **PostgreSQL 18** locally, and the app was exercised in Chrome against a production build. **No deployment to Vercel, Render or Supabase was performed** (no accounts were available), so the platform-specific steps below are written from those platforms' documented behaviour and the app's own configuration, not from a live deploy. Treat the first deploy as a staging exercise.

## 1. What you need

| Piece | Choice | Why |
|---|---|---|
| Node host | Vercel, Render (Web Service) or any Node 20+ host | Standard `next build` / `next start`; no custom server |
| Database | PostgreSQL 14+ (Supabase, Neon, RDS, Render Postgres …) | The embedded PGlite database is for development and tests only |
| E-mail | Any SMTP account (Brevo, SES, Postmark, Gmail app password …) | Verification, password reset, booking notices |
| LLM (optional) | Anthropic API key | Without it the chatbot runs in labelled offline mode |

## 2. Environment variables

See `.env.example` for every variable with comments. The ones that **must** be set in production:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | e.g. Supabase *pooler* URI (port 6543, transaction mode) on serverless, direct URI for migrations |
| `DATABASE_SSL` | `true` (default). The pool uses TLS with `rejectUnauthorized: false` so managed providers' certificates work; pin the CA if your policy requires it |
| `SESSION_SECRET` | 32+ random chars (`openssl rand -base64 48`). The app **refuses to start** in production without it |
| `APP_URL` | Public https URL, used in e-mail links |
| `REQUIRE_EMAIL_VERIFICATION` | keep `true` |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `MAIL_FROM` | Without `SMTP_HOST`, e-mails are only printed to the server log — users could not verify their address |
| `ANTHROPIC_API_KEY` `ANTHROPIC_MODEL` | Optional; server-side only |
| `ADMIN_EMAIL` `ADMIN_PASSWORD` | Used once by `npm run db:seed` to create the first administrator |
| `SEED_DEMO` | **leave `false`** — demo accounts have published passwords |

## 3. Database setup (once, from your machine or CI)

```bash
export DATABASE_URL='postgresql://…'   # direct connection (not the transaction pooler)
npm ci
npm run db:migrate                     # applies db/migrations/001_init.sql and 002_rls.sql
ADMIN_EMAIL=you@org.example ADMIN_PASSWORD='a-long-unique-passphrase' npm run db:seed
```

The migrator records applied files in `schema_migrations`; running it again is a no-op. `db:seed` is idempotent (catalogue rows use `on conflict do nothing`).

`002_rls.sql` creates the `soundsense_app` role and grants it to the connecting user (`grant soundsense_app to current_user`). The connecting user therefore needs permission to create a role and grant membership — true for the default `postgres` role on Supabase and for most managed owners. If your provider forbids `CREATE ROLE`, create `soundsense_app nologin` yourself first (the migration skips creation if it exists) and grant it to the connection user. Every request switches to `soundsense_app` with `SET LOCAL ROLE`; that switch is what makes row-level security apply, so keep it (superusers and table owners bypass RLS unless the role is switched).

Set `AUTO_MIGRATE=true` only if you want the app to migrate itself at first connection; running migrations explicitly is safer.

## 4. Vercel

1. Import the repository, framework preset **Next.js**, build command `npm run build`.
2. Add the environment variables above (Production + Preview).
3. Use the **pooler** connection string in `DATABASE_URL`; `DATABASE_POOL_MAX=5` keeps per-instance connections low.
4. Region: pick one near the database.
5. Upload limit: serverless request bodies are limited (about 4.5 MB on Vercel); the document upload cap is 3 MB so base64 JSON stays under it.

## 5. Render

1. New **Web Service** from the repository; build `npm ci && npm run build`, start `npm start`.
2. Add the environment variables; `PORT` is provided by Render and honoured by `next start`.
3. Health check path: `/login` (public, 200).

## 6. Supabase notes

- Use Supabase only as a PostgreSQL host. SoundSense does its own auth, so Supabase Auth and its row-level-security helpers are not used; the policies in `002_rls.sql` rely on `app.user_id` / `app.role` settings the app sets per request.
- Do **not** expose the database through Supabase's auto-generated REST API for these tables; the app's API is the only intended entry point.

## 7. Go-live checklist

- [ ] `SESSION_SECRET`, `APP_URL`, SMTP and `DATABASE_URL` set; `SEED_DEMO=false`
- [ ] First admin created, password changed from the seed value, demo accounts absent (`select email from users`)
- [ ] Sign up with a real address → verification mail arrives → login works
- [ ] Forgot-password mail arrives and the link works once only
- [ ] Book a slot as a customer, confirm as admin, see the notification
- [ ] Download a PDF report; open it
- [ ] Admin → Products & pricing: **replace the indicative prices with verified figures** and set `price_basis`
- [ ] Admin → Settings: working hours/holidays match reality
- [ ] HTTPS only; HSTS header present (it is set by the app); cookie is `__Host-ss_session`
- [ ] Reverse proxy sets `X-Forwarded-For` correctly (rate limits and the audit log use it) and strips any client-supplied value
- [ ] Database backups and a restore test
- [ ] Privacy notice / terms reviewed by the organisation (the app stores answers, contact details and microphone *summary statistics*, never audio)
- [ ] Decide a retention period for assessments and chat logs

## 8. Operating notes

- **Rate limits** live in the `rate_limits` table, so they work across serverless instances. Prune old rows periodically (`delete from rate_limits where window_start < now() - interval '1 day'`; adjust to the column name in `001_init.sql`).
- **Sessions** last 7 days and are revocable (deactivating a user ends their sessions).
- **Logs:** unexpected errors are logged to stdout; there is no external error tracker configured — add Sentry or similar if needed.
- **PWA:** the service worker caches the app shell only and never `/api/` responses, so a stale cache cannot show another user's data.
