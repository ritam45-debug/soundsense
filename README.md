# SoundSense — Making Every Sound Count

> **Two editions in this repository**
> - **Full platform** (this folder, branch `full-version` keeps a frozen copy): accounts, consultants, bookings, admin, PostgreSQL. Needs a server.
> - **SoundSense Lite** (`lite/`): no login, no server – a static site that runs in the browser and keeps data on the device. Easy to test and to host on GitHub Pages. SoundSense 2.0 (monitoring, alerts, room health, mitigation, passports) is in this edition only. See [`lite/README.md`](lite/README.md).


Smart acoustic assessment, diagnosis and consultation platform (CPP International Project, GLIM Chennai).

> **Diagnose first. Recommend second. Sell last.**
> A customer answers a short, adaptive questionnaire, optionally measures the room with their own microphone, and gets a transparent, rule-based diagnosis, tiered recommendations, a PDF report and the option to book a human consultant. Nothing is presented as more certain than it is.

This is a working application, not a mock-up. Everything on screen is read from or written to the database.

---

## What is in it

| Area | What it does |
|---|---|
| **Roles** | Customer, consultant, admin — enforced in the API *and* by PostgreSQL row-level security |
| **Auth** | Register, e-mail verification, login, logout, password reset, 7-day server-side sessions, lockout after 5 failures |
| **Questionnaire** | The 14 required questions (Q1–Q14) plus contact, space, follow-up and consent fields (36 in all) over 7 steps and an optional room / sound-check slide; conditional follow-ups, autosave, resume later |
| **Measurement** | Browser microphone: live waveform + level, Leq / L90 / L10, relative SNR. Room calculator (Sabine RT60 estimate). Results are labelled **relative**, **rough estimate** or **single-point calibrated** — never as certified dB |
| **Diagnosis** | 8 categories (7 problem areas + "multiple interacting"), transparent rule table, evidence tagged *reported / calculated / measured*, confidence ceilings, root causes shown as hypotheses, "show the rules that fired" |
| **Recommendations** | Free steps first, then budget / recommended / premium tiers, honest "what we would not buy yet", prices labelled **indicative** |
| **Assistant** | Server-side LLM call (Anthropic Messages API) with a rule-based offline fallback that says so; reads an assessment only if the customer ticked consent; escalates to a human |
| **Reports** | Real PDFs (pdf-lib): preliminary on submit, final issued by a consultant with remarks |
| **Bookings** | Mon–Fri 10:00–17:00 IST (13:00–14:00 break), 60-min slots, 12 h notice, 45-day horizon; unavailable slots are visible but disabled; request → confirm → reschedule/cancel → complete; admin calendar + day closures; concurrency-safe |
| **Consultant tools** | Case notes (internal or customer-visible), documents, edit recommendations, change history, issue final report |
| **Admin** | Live dashboard with filters and charts, users, bookings, products & pricing, feedback, settings, audit log |
| **Learn** | Education centre (plain-language articles with two inline diagrams; no videos) |
| **PWA / UX** | Installable, offline page, dark/light, mobile-first, WCAG 2.1 AA checked with axe-core |

## Quick start (zero setup)

Requires Node 20+ (developed on Node 22).

```bash
npm install
cp .env.example .env.local          # then edit ADMIN_EMAIL / ADMIN_PASSWORD / SESSION_SECRET
npm run db:seed                     # creates the catalogue + first admin (embedded database, no install)
npm run dev                         # http://localhost:3000
```

With `DATABASE_URL` empty the app uses **PGlite** (an embedded PostgreSQL in WebAssembly) stored in `.data/pglite`. That is for local development and tests only — use real PostgreSQL in production (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

Set `SEED_DEMO=true` before seeding to also create two **development-only** demo accounts:
`consultant@demo.soundsense.test` / `Demo-Consultant-1` and `customer@demo.soundsense.test` / `Demo-Customer-1`. Never enable this in production.

E-mails (verification, reset, booking notices) are printed to the server console until `SMTP_HOST` is set.
The chatbot runs in clearly-labelled *Offline guidance mode* until `ANTHROPIC_API_KEY` is set.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | 58 unit / API / DB / security / scenario tests (in-memory PGlite) |
| `npm run test:e2e` | 70 real-Chrome end-to-end checks against a running build — see [docs/TESTING.md](docs/TESTING.md) |
| `npm run db:migrate` · `db:seed` · `db:reset` | Migrations, idempotent seed, wipe local DB |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack, data model, RLS, request pipeline, assumptions
- [docs/API.md](docs/API.md) — all 58 endpoints (method, access, limits) and conventions
- [docs/ACOUSTICS.md](docs/ACOUSTICS.md) — the physics and thresholds, **what is sourced and what is assumed**
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Vercel/Render + Supabase, environment variables, go-live checklist
- [docs/SECURITY.md](docs/SECURITY.md) — controls, threat notes, hardening still to do
- [docs/TESTING.md](docs/TESTING.md) — what is tested, how to run it, what is not covered
- [docs/LIMITATIONS.md](docs/LIMITATIONS.md) — **read this before relying on the output**

## Honest summary of limits

Browser microphones are not measuring instruments; RT60 here is a screening estimate; scoring weights are engineering judgement; prices are indicative placeholders; the product catalogue is generic solution types, not vendor SKUs. Details and the rest in [docs/LIMITATIONS.md](docs/LIMITATIONS.md).
