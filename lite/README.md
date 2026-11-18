# SoundSense Lite – no sign-in, runs in your browser

> **SoundSense 2.0** adds live monitoring and alerts, room health scores, mitigation plans, readiness checks, before/after verification, room passports (QR), room maps, analytics, captions, ROI and goals, all on the device. See [docs/SOUNDSENSE-2.0.md](docs/SOUNDSENSE-2.0.md) for what was added, what a static site cannot do (and what replaces it), [docs/SCORING.md](docs/SCORING.md) for thresholds and sources, and [docs/TESTING.md](docs/TESTING.md) for the test report.

The same acoustic diagnosis engine as the full SoundSense platform, packaged as a **static website** that anyone can open and test in a minute:

- **No account, no login, no server, no database.** Nothing is uploaded; microphone audio never leaves the device.
- Questionnaire → likely cause with the evidence behind it → three-tier recommendations → **PDF report built on your device**.
- Room calculator (Sabine RT60 estimate), microphone sound check (relative dBFS, honestly labelled), rule-based assistant, learning centre.
- **Try a sample** opens six ready-made rooms, so a tester sees a full result without answering anything.
- Your assessments are saved in this browser (localStorage). *My data* lets you download a backup, restore it, or delete everything.

What is **not** in Lite (it needs a server): accounts and roles, e-mail/SMS sending, consultants, bookings, case notes, admin console, price editing, the AI-model assistant, revocable shared links. Those live in the full version (branch `full-version`, repository root).

## Try it online (GitHub Pages)

1. Make sure the repository is **public** (GitHub Pages is not available for private repositories on the free plan).
2. *Settings → Pages → Build and deployment → Source: **GitHub Actions**.*
3. Push to `main` (or run the workflow *Deploy SoundSense Lite to GitHub Pages* by hand). The site appears at `https://<your-user>.github.io/<repository-name>/`.

The workflow type-checks, runs the tests, builds with `NEXT_PUBLIC_BASE_PATH=/<repository-name>` and publishes `lite/out`.

## Run it locally

```bash
cd lite
npm ci
npm run build          # static site in lite/out
npm run serve          # http://localhost:4100/   (BASE_PATH=/name if you built with a base path)
```
`npm run dev` also works for development.

## Other hosts
Any static host works: build once, upload `lite/out`. Netlify: drag the `out` folder onto <https://app.netlify.com/drop>, or import the repo with *Base directory* `lite`. For a host that serves the site from a sub-path, build with `NEXT_PUBLIC_BASE_PATH=/that-path`.

## Tests
```bash
npm test               # 146 tests: data layer, scenarios, PDF output, and the 2.0 engines (alerts, fingerprinting, health score, mitigation, passport…)
npm run build && NEXT_PUBLIC_BASE_PATH=/soundsense npm run build   # (rebuild with the base path used by the e2e run)
BASE_PATH=/soundsense PORT=4100 npm run serve &
E2E_BASE=http://localhost:4100/soundsense npm run test:e2e   # 95 browser checks in real Chrome incl. axe accessibility
```

## How it works
`src/lib/client.ts` is the only place the UI talks to "the server". In Lite, `call("/api/…")` is answered by `src/lib/local/api.ts`, a small router over localStorage that runs the same engines (`src/lib/acoustics/*`) and PDF builder (`src/lib/report/pdf.ts`) as the full app. Assessment pages use `/app/assessments/view/?id=…` because a static host cannot have a page per id.

## Honest limitations
- Data lives in one browser on one device. Clearing site data, a private window, or another browser/device means it is gone – use the backup.
- Static hosting cannot set security headers (CSP etc.). The app has no server-side code, accounts or secrets, so the exposure is small, but it is less hardened than the full version.
- Prices are the team's **indicative estimates** (not vendor quotes) and cannot be edited here; scoring weights are the team's own judgement. Browser microphone levels are **relative**, not calibrated dB SPL. See `../docs/LIMITATIONS.md`.
- Verified in Chrome (automated) only. Firefox/Safari, real microphones and screen readers were not tested.
- Noise-type detection is a heuristic tuned on synthetic sounds; it has not been validated on real rooms. Uncalibrated levels are estimates (±20 dB).
