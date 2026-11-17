# Testing

## What exists

| Suite | Command | Count | What it covers |
|---|---|---|---|
| Unit / API / DB | `npm test` | 58 | Route handlers called directly with a cookie-keeping client against an in-memory database |
| Real PostgreSQL | `TEST_DATABASE_URL=… npm test` | same 58 | The same suite against a real PostgreSQL server |
| Browser E2E | `npm run test:e2e` | 70 | Real Chrome against a running production build |
| Types | `npm run typecheck` | — | `tsc --noEmit`, strict |

### `npm test` (Vitest)

- `api-auth` — register → verify → login → logout, password-strength field errors, no plaintext passwords, no account enumeration, single-use reset that kills old sessions, lockout, admin user management and deactivation.
- `api-flow` — assessment lifecycle through the API (scenario A), RLS isolation between customers (API and direct DB role), measurement calibration tiers, consultant notes visibility, booking → case hand-over, PDF validity and content, chat fallback / consent / escalation, dashboard stats, feedback.
- `api-booking` — slots never during breaks or outside hours; **concurrent requests for one slot → exactly one wins**; status machine (confirm, decline, reschedule, cancel, complete); admin blocks; settings; admin-only assignment.
- `scenarios` — the six reference scenarios **A–F** through the diagnostic and recommendation engines: A large glass conference room with echo (room acoustics; expert inspection; panels, not microphones), B open-office background noise (noise; headset-level budget solution), C low microphone pickup (microphone problem, not room), D hybrid meeting with overlapping voices and remote echo (hybrid + conference system), E Bluetooth headset connectivity fault (connectivity; never recommends acoustic panels), F temple public-address announcements (speaker + room, expert survey, PA products). Also: confidence is capped without measurements, a real measurement can lift it, the engine never claims certainty, premium is never auto-selected, and low-information input yields low confidence rather than an invented diagnosis.
- `security` — CSRF/origin, anonymous 401s, role guards, forged cookies, login throttling, hostile input (SQL-style, XSS, NUL, oversize), no secrets/hashes in responses, cross-customer isolation, chat prompt-injection.

### Running against real PostgreSQL

The default is embedded PGlite. To run the identical suite on a server (use a **throw-away database** — the tests create users and data in it, and each test file expects an empty schema):

```bash
export TEST_DATABASE_URL=postgresql://user:pw@localhost:5432/soundsense_test
for f in api-auth api-booking api-flow scenarios security; do
  psql "$TEST_DATABASE_URL" -c "drop schema public cascade; create schema public"   # empty schema per file
  npx vitest run tests/$f.test.ts
done
```

Last run: all 58 pass on PostgreSQL 18.6 as well as on PGlite. (Running against PostgreSQL exposed a real bug — migrations failed on `pg` because multi-statement scripts return an array of results — which PGlite had hidden; it is fixed.)

### `npm run test:e2e`

Needs Chrome/Chromium (`CHROME_PATH`, default `/usr/bin/google-chrome`), a seeded database and a running build, e.g.:

```bash
npm run build && npm run db:seed && npx next start -p 3100 &
E2E_BASE=http://localhost:3100 npm run test:e2e
```

The seed must have created the admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD`, defaults `admin@soundsense.test` / `Admin-Pass-12345`) and the demo accounts (`SEED_DEMO=true`). It uses a fake microphone device. It exercises:

1. **Public:** landing, learn, security headers, PWA assets, service-worker `/api` exclusion, 404, protected-route redirect, wrong-password message, guest chat reply with source label.
2. **Customer:** sign-in; the full questionnaire through the UI (scenario B) → diagnosis; evidence/root-cause sections; three recommendation tiers with "indicative"; PDF download is a real PDF; **microphone** start → live meter → stop → result labelled relative, not calibrated → save; room calculator; booking (unavailable slots disabled); chat consent toggle; feedback; notifications; **dark mode** persistence.
3. **Admin:** dashboard, confirm and assign a booking, calendar, all admin pages, edit a product price → audit entry, settings page does not leak secrets.
4. **Consultant:** sees the assigned case, internal note, modify recommendation + change history, issue final report, cannot open admin pages.
5. **Customer again:** sees the final report and the consultant's recommendation note, **not** the internal note; another customer cannot open the assessment.
6. **Responsive:** 8 viewports (320, 360, 375, 414, 768, 1024, 1280, 1920 px) × public, customer and (≤ 768, 1280) admin pages — no horizontal overflow.
7. **Accessibility:** axe-core (WCAG 2.0/2.1 A and AA rules) on public and signed-in pages in light **and** dark — no serious or critical violations; skip link; visible keyboard focus.
8. **Console health:** no unexpected console or page errors across the run.

Screenshots land in `e2e/shots/`.

## What is **not** covered

- **Cross-browser:** only Chromium/Chrome was run. Firefox and Safari (including iOS Safari's microphone and PWA behaviour) were not tested. The code uses standard APIs (Web Audio, `getUserMedia`, CSS variables), but that is not verification.
- **Real microphones:** the E2E uses Chrome's synthetic fake device, which produces a beep pattern; it proves the pipeline, not real-room behaviour on real hardware.
- **Real devices:** "responsive" means emulated viewports in desktop Chrome, not physical phones.
- **Load / soak:** no performance or load testing beyond concurrency tests for booking. No Lighthouse score is claimed.
- **E-mail delivery** (SMTP) and **the live LLM call**: only the offline fallback path and the "no key" behaviour are exercised. The Anthropic request/response handling was not run against the live API.
- **Screen readers:** axe finds rule violations automatically; no manual NVDA/VoiceOver pass was done, and automated tools catch only part of accessibility issues.
- **Real deployments** (Vercel/Render/Supabase): not performed.
- **Penetration testing:** none.
