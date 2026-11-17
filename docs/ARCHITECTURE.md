# Architecture

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript strict | Route handlers under `src/app/api`, UI under `src/app` |
| Styling | Tailwind CSS 3 with CSS-variable colour tokens | `data-theme="dark"` switches the token set; fonts self-hosted (Figtree, Sora) |
| Data fetching | SWR + a small `call()` wrapper (`src/lib/client.ts`) | Uniform `{error:{message,code,fields}}` errors |
| Charts | Recharts, palette validated with a CVD/contrast script | Every chart has a legend and a table view |
| Database | PostgreSQL via `pg`; embedded **PGlite** when `DATABASE_URL` is empty | Same SQL and migrations for both |
| Auth | bcryptjs + `jose` JWT in an httpOnly cookie, backed by a `sessions` table | `__Host-` cookie prefix in production |
| PDF | `pdf-lib` (pure JS, works on serverless) | |
| E-mail | `nodemailer` (SMTP) — console output if unset | |
| AI chat | Anthropic Messages API, server-side only | Rule-based fallback when no key |
| Validation | `zod` 4 on every state-changing route | |
| Tests | Vitest (unit/API/DB/security), playwright-core + system Chrome (E2E), axe-core | |

## Layout

```
db/migrations/        001_init.sql (schema)  002_rls.sql (roles, grants, policies)
scripts/              migrate · seed · reset-local
src/app/              pages (public, (auth), app/…) and api/** route handlers
src/components/       AppShell, Wizard, AssessmentView, MicMeter, RoomCalculator, SlotPicker, ChatPanel, Charts, ui…
src/lib/acoustics/    questionnaire · room · measurement · diagnostic · recommend · catalogue (pure, no I/O)
src/lib/services/     assessments · bookings · chat · auth · stats · report-data
src/lib/report/pdf.ts PDF rendering
src/lib/db/           connection (pg | PGlite), migrator, RLS-aware helpers
tests/  e2e/  docs/
```

The acoustic engines are **pure functions** (answers in → diagnosis out). They are shared by the server, the tests and the browser meter, so a rule can be unit-tested without a database.

## Request pipeline

Every route is wrapped by `api({ auth, schema, limit }, handler)` (`src/lib/api.ts`):

1. same-origin check on state-changing methods (`Origin` must match `Host`)
2. global per-IP rate limit (240 / min) and an optional per-route limit (e.g. login 15 / 15 min)
3. session lookup (cookie → JWT → `sessions` row must exist, be unexpired, user active)
4. role check (`auth: true` = any signed-in user, or a role list)
5. JSON content-type, NUL-byte rejection, `zod` validation → field-level errors
6. handler runs with `db(fn)` = a transaction **as the signed-in user** (see RLS below)
7. errors map to a uniform JSON shape; unexpected errors are logged and returned as a generic 500

## Data model (25 tables)

`organisations`, `users`, `customer_profiles`, `consultants`, `sessions`, `auth_tokens`, `rate_limits`, `assessments`, `questionnaire_responses`, `rooms`, `measurement_sessions`, `diagnostic_results`, `products`, `recommendations`, `bookings`, `reports`, `feedback`, `chat_conversations`, `chat_messages`, `notifications`, `audit_logs`, `case_notes`, `case_documents`, `system_settings`, `availability_blocks` (+ `schema_migrations`).

Key relationships: a customer owns many **assessments**; each has one **room**, many **measurement_sessions**, many versioned **diagnostic_results**, a set of **recommendations** (consultant edits are flagged and preserved when the analysis is re-run), **reports** (preliminary/final), **case_notes** and **case_documents** (stored as `bytea`, ≤ 3 MB, MIME-sniffed). **Bookings** optionally link to an assessment; attaching a consultant to a linked booking also gives them the case if it has none.

Raw questionnaire answers are stored twice on purpose: as JSON on the assessment (fast load) and row-per-answer in `questionnaire_responses` (reporting).

## Row-level security

Two database roles are in play:

- the **owner** connection (`sys()`) — used only for things the app role must not touch: sessions, auth tokens, rate limits, audit writes, notifications fan-out, seeding;
- **`soundsense_app`** (`nologin`) — every request runs `SET LOCAL ROLE soundsense_app` after setting `app.user_id` and `app.role`. Policies key off these (`app_uid()`, `app_role()`).

Effect: a customer sees only their own rows; a consultant sees cases where they are the assigned consultant; an admin sees everything; `password_hash`, lock-out columns and token tables are not granted to the app role at all. Even a bug in an API handler cannot return another customer's assessment. This is covered by tests that query as the app role directly (`tests/api-flow.test.ts`, `tests/security.test.ts`).

## Diagnosis, recommendation and measurement

See [ACOUSTICS.md](ACOUSTICS.md). In short: the engine is an explicit rule table (`id`, label, evidence basis, point effects, `when()` predicate). The report prints every fired rule. Confidence is capped by how much of the evidence is *measured or calculated* rather than merely *reported*.

## Booking model

Slots are generated, not stored: working hours, break, lead time and horizon come from `system_settings.availability`; closures from `availability_blocks`; occupancy from `bookings` rows in an active state. Creating or moving a booking takes a transaction-scoped advisory lock per slot and re-checks availability inside it, so two simultaneous requests for one slot cannot both succeed (tested with parallel calls, on PGlite and PostgreSQL 18).

## Chat

`POST /api/chat` accepts guests (stateless, history sent by the client, rate-limited) and signed-in users (stored conversations). The server builds the prompt; the browser never sees the API key. An assessment's contents are added to the prompt **only if** `assessments.share_with_chat` is true. If the LLM call fails or no key is set, a keyword-driven fallback answers from the education content and labels the reply "Offline guidance mode". Asking for a person prompts an offer to hand the chat to the team; once escalated, a consultant or admin can reply from *Chats*.

## Documented assumptions

Where the brief left a choice open, these were decided and are easy to change:

- Time zone for bookings is fixed at IST (UTC+05:30); slots are 60 min, capacity 1 per slot.
- Currency is INR; product prices are indicative placeholders (see LIMITATIONS).
- Single organisation per customer is optional; there is no multi-tenant billing.
- Payments, e-signature and calendar sync (Google/Outlook) are out of scope; the booking flow is request → human confirm.
- Uploaded documents live in the database (simple, transactional); move to object storage if volume grows.
- E-mail verification is required by default (`REQUIRE_EMAIL_VERIFICATION=false` for local convenience).
