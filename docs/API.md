# API reference

All endpoints are JSON over HTTPS under `/api`, authenticated by the `ss_session` cookie (`__Host-ss_session` in production). 58 handlers, listed from the route files; each file holds the zod schema for its body.

## Conventions

- **Errors** — `{ "error": { "message": "…", "code": "…", "fields": { "field": "…" } } }` with HTTP 400 (validation), 401 (not signed in), 403 (forbidden / cross-origin), 404 (not found *or not visible to you*), 415 (not JSON), 429 (rate limited / locked), 500 (unexpected; generic message).
- **Visibility** — asking for someone else's record returns **404**, not 403: row-level security hides it.
- **CSRF** — non-GET requests whose `Origin` header does not match `Host` are rejected (`code: csrf`). Requests without an `Origin` header (curl, server-to-server) are accepted but still need the session cookie.
- **Rate limits** — 240 requests / minute / IP overall (client IP is taken from `X-Forwarded-For`; see SECURITY.md), plus the route limits below.
- **IDs** are UUIDs; assessments and bookings also have readable references (`SS-2026-1001`).
- **Dates** are ISO-8601 UTC; slot labels are IST.
- **Prices** are ranges with a `price_basis`; they are indicative unless an admin changed the basis.
- *Any signed-in user* routes are further filtered by RLS to what the caller may see.

## Endpoints

| Method | Path | Access | Rate limit | Purpose |
|---|---|---|---|---|
| GET | `/api/admin/audit` | admin | — | Audit log, filterable |
| DELETE | `/api/admin/blocks` | admin | — | Reopen a day |
| GET | `/api/admin/blocks` | any signed-in user | — | Closed days (read by the slot picker) |
| POST | `/api/admin/blocks` | admin | — | Close a day |
| DELETE | `/api/admin/products` | admin | — | Deactivate a product |
| GET | `/api/admin/products` | admin, consultant | — | Product catalogue |
| POST | `/api/admin/products` | admin | — | Create / update a product (price edits are audited) |
| GET | `/api/admin/settings` | admin | — | Availability settings + integration status (never secret values) |
| PUT | `/api/admin/settings` | admin | — | Update availability settings |
| GET | `/api/admin/users` | admin | — | List customers / staff with counts |
| POST | `/api/admin/users` | admin | — | Create consultant or admin |
| PATCH | `/api/admin/users/[id]` | admin | — | Change role, activate / deactivate (deactivation ends their sessions) |
| GET | `/api/assessments` | any signed-in user | — | List (scoped by role through RLS), filters + paging |
| POST | `/api/assessments` | any signed-in user | — | Create a draft |
| DELETE | `/api/assessments/[id]` | any signed-in user | — | Delete an assessment (rules in the handler) |
| GET | `/api/assessments/[id]` | any signed-in user | — | Full assessment (room, measurements, diagnosis, recommendations, reports, notes, documents, bookings) |
| PATCH | `/api/assessments/[id]` | any signed-in user | — | Autosave answers / step / title / chat-consent |
| POST | `/api/assessments/[id]/analyse` | any signed-in user | — | Re-run the diagnosis |
| POST | `/api/assessments/[id]/documents` | any signed-in user | — | Upload a document (base64 JSON, ≤ 3 MB, type-checked) |
| DELETE | `/api/assessments/[id]/documents/[docId]` | any signed-in user | — | Delete a document |
| GET | `/api/assessments/[id]/documents/[docId]` | any signed-in user | — | Download a document |
| GET | `/api/assessments/[id]/history` | consultant, admin | — | Change history |
| PATCH | `/api/assessments/[id]/manage` | consultant, admin | — | Case status; assigning a consultant is admin-only |
| POST | `/api/assessments/[id]/measurements` | any signed-in user | — | Save a microphone recording (summary statistics only, no audio) |
| DELETE | `/api/assessments/[id]/measurements/[mid]` | any signed-in user | — | Delete a recording |
| POST | `/api/assessments/[id]/notes` | consultant, admin | — | Add an internal or customer-visible note |
| PATCH | `/api/assessments/[id]/recommendations/[rid]` | consultant, admin | — | Modify a recommendation (title, price range, best-fit, note) |
| POST | `/api/assessments/[id]/report` | any signed-in user | — | Generate a preliminary version, or (staff) issue the final report |
| POST | `/api/assessments/[id]/room` | any signed-in user | — | Room analysis preview (stateless; use `preview` as id before an assessment exists) |
| PUT | `/api/assessments/[id]/room` | any signed-in user | — | Save room details |
| POST | `/api/assessments/[id]/submit` | customer | — | Validate, run the engines, create the preliminary report |
| POST | `/api/auth/login` | public | 15 / 15 min | Sign in (sets session cookie) |
| POST | `/api/auth/logout` | any signed-in user | — | Sign out (revokes the session) |
| POST | `/api/auth/password` | public | 5 / 60 min | Forgot password — always the same answer whether or not the account exists |
| PUT | `/api/auth/password` | public | 10 / 60 min | Set a new password with the e-mailed token (single use, 60 min) |
| POST | `/api/auth/register` | public | 8 / 60 min | Create a customer account (consent required) |
| POST | `/api/auth/verify` | public | 20 / 15 min | Verify e-mail with the token (24 h) |
| PUT | `/api/auth/verify` | public | 5 / 60 min | Request a fresh verification e-mail (same answer whether or not the account exists) |
| GET | `/api/availability` | any signed-in user | — | Slots for a date range, each with `available` and a `reason` when not |
| GET | `/api/bookings` | any signed-in user | — | List bookings (scoped by role) |
| POST | `/api/bookings` | customer | 20 / 60 min | Request a consultation for a free slot |
| PATCH | `/api/bookings/[id]` | any signed-in user | — | Action: confirm, decline, cancel, reschedule_request, approve/decline_reschedule, cancel_request, approve/decline_cancel, complete, assign |
| GET | `/api/chat` | any signed-in user | — | My conversations |
| POST | `/api/chat` | public | 40 / 10 min | Send a message (guests allowed) |
| DELETE | `/api/chat/[id]` | any signed-in user | — | Delete a conversation |
| GET | `/api/chat/[id]` | any signed-in user | — | Conversation messages |
| POST | `/api/chat/[id]` | any signed-in user | — | Escalate to the team, or staff reply |
| GET | `/api/consultants` | admin, consultant | — | Active consultants (for assignment menus) |
| GET | `/api/feedback` | any signed-in user | — | Admin: all feedback + aggregates; customer: own |
| POST | `/api/feedback` | customer | — | Submit feedback |
| GET | `/api/me` | any signed-in user | — | Current user |
| PATCH | `/api/me` | any signed-in user | — | Update profile |
| PUT | `/api/me` | any signed-in user | 10 / 60 min | Change password (needs the current one) |
| GET | `/api/notifications` | any signed-in user | — | My notifications |
| POST | `/api/notifications` | any signed-in user | — | Mark read (one id, or all) |
| GET | `/api/reports` | any signed-in user | — | My reports with assessment reference |
| GET | `/api/reports/[id]/pdf` | any signed-in user | — | Download report PDF |
| GET | `/api/stats` | any signed-in user | — | Dashboard metrics for my role, with filters |

## Example

```bash
curl -c jar -H 'content-type: application/json' -H 'origin: http://localhost:3000' \
  -d '{"email":"customer@demo.soundsense.test","password":"Demo-Customer-1"}' http://localhost:3000/api/auth/login
curl -b jar http://localhost:3000/api/assessments
```
