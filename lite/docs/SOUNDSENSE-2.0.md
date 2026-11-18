# SoundSense 2.0 (Lite edition)

SoundSense 2.0 adds continuous monitoring, alerts, room health scores, mitigation plans, readiness checks, shareable room passports and planning tools to **SoundSense Lite** (the static, no-login site on GitHub Pages). It does **not** change the Netlify full app.

Everything runs in the browser. Data stays on the device. There are no accounts, no server and no API keys.

## What was added

| Area | Screen (path under `/app/`) | Engine (`src/lib/…`) |
|---|---|---|
| Live monitoring, noise severity, alerts | `monitor` | `acoustics/screening.ts`, `acoustics/useLiveAudio.ts`, `workspace/live.ts` |
| Noise-type fingerprinting (heuristic) | `monitor`, `speech` | `acoustics/audio.ts` |
| Rooms and per-room history | `rooms` | `workspace/store.ts`, `workspace/derive.ts` |
| Acoustic Health Score (0–100) | `rooms` | `acoustics/health.ts` |
| Mitigation Centre (3 levels) | `mitigation`, `rooms` | `acoustics/mitigation.ts` |
| Alerts, notifications, history, escalation text | `notifications` | `workspace/ops.ts` |
| Meeting readiness ("Test my room") | `readiness` | `acoustics/readiness.ts` |
| Before/after verification and PDF | `verify` | `acoustics/compare.ts`, `workspace/simplePdf.ts` |
| Room assistant (rule-based) | `assistant` | `workspace/copilot.ts` |
| Room acoustic map | `map` | `workspace/mapPlan.ts` |
| Room passport (QR / link, optional passcode) | `passport` | `workspace/passport.ts` |
| Multi-room analytics, filters, trend notes | `analytics` | `workspace/portfolio.ts`, `workspace/trends.ts` |
| Captions and clarity | `speech` | `acoustics/captions.ts` |
| ROI calculator | `roi` | `acoustics/roi.ts` |
| Goals and badges | `goals` | `workspace/goals.ts` |
| Find help (solution types, quote requests) | `marketplace` | `acoustics/catalogue.ts` (existing) |
| Settings (bands, hysteresis, cooldown, urgent level, weights, contacts) | `settings` | `workspace/store.ts` |

Existing Lite features are unchanged: questionnaire, diagnosis, recommendations, PDF report, room calculator, microphone sound check, assistant, learning centre, backup/restore. *My data* now backs up and deletes the 2.0 data too.

## Honesty rules the code enforces (each is tested)

- A microphone reading is **never** called calibrated dB SPL unless the person completed a single-point calibration against a reference meter. Uncalibrated readings are shown as `≈ N dB, could be N−20 … N+20`.
- Severity of an uncalibrated estimate comes from the **low end** of its range, and an estimate can **never** raise a red alert.
- Red is reserved for a **calibrated** reading at or above the configurable urgent level (default 85 dB, see `SCORING.md`). Ordinary meeting-room noise cannot be red.
- Noise-type results are a heuristic with a confidence cap of 80 %, evidence, alternatives and a caveat. Too-short or too-quiet recordings are refused rather than guessed.
- The health score says **Insufficient data** instead of inventing a number, labels each area as calibrated / estimate / calculated / reported, and lists every deduction.
- Mitigation costs are only "free" or "needs a local quote". No prices, vendors or reviews are invented.
- Before/after comparisons are refused when the two recordings are not comparable, never use percentages for dB, and never claim a fix caused a change.
- Trend notes describe past data only and need at least three points. They are not forecasts.
- Badges need evidence (comparable recordings, snapshots, readiness). Ticking boxes earns nothing.
- No audio or transcript is stored. Captions use the browser's own speech service, which the page says in plain words.

## Server-only features: how they were adapted

The 2.0 brief assumes a server, accounts and a database. This edition is a static site, so these parts are **not implemented as asked** and have an on-device substitute:

| Brief item | Not possible here because | What this edition does instead |
|---|---|---|
| User accounts, roles, admin console, row-level security | No server, no login (a standing requirement) | Single local workspace; no roles. |
| Email / SMS / push sending, escalation delivery | No mail server or push service | In-app notifications; optional browser notifications while the tab is open; escalation is a message to **copy**, or open in the person's own mail app. |
| Server-side AI model (copilot) | An API key cannot be kept safe in a static page | Rule-based room assistant, labelled as not an AI model. The older assessment assistant is also rule-based. |
| Shared multi-user data, live team dashboards | No shared storage | Multi-room view over rooms on this device; backup/restore to move data. |
| Revocable or access-controlled QR passports | No server to check who is asking | The passport data is inside the link (URL fragment, never sent to a server). Optional passcode encrypts it with AES-GCM (PBKDF2, 150 000 iterations). Links **cannot be revoked or tracked**. The screen says so. |
| Marketplace with vendor listings, prices, reviews, orders | No vendor data may be invented | 27 solution **types** with advantages and limits, side-by-side comparison, quote requests prepared for suppliers the person adds themselves (sponsored flag supported), no prices. |
| Scheduled background jobs | No server | Reassessment reminders that appear in the app when it is opened. |
| Audit trail across users | Single user | A local history of alert changes and completed fixes. |

## What was not verified

- Real devices: tests use Chrome with a fake microphone. Fingerprinting was tuned on synthetic signals only; it has **not** been validated on recordings of real rooms.
- Safari, Firefox, mobile browsers and screen readers were not tested. Web Speech captions work only where the browser offers them (mainly Chrome and Edge).
- Browser microphones differ by tens of dB, so uncalibrated numbers are screening hints only.
- The health-score curves and weights, the 3 dB "clear change" threshold, the placement distances on the map, and the badge criteria are **team judgement**, documented in `SCORING.md`. They are not published standards.
- The QR code was generated and its link was decoded in tests, but scanning with a phone camera was not tested.

## Future enhancements

Real-room validation of the noise fingerprint; optional calibrated reference-meter workflow with multi-point calibration; an opt-in server edition for accounts, email and an AI model (the full app already has this); import of room measurements from professional meters; Firefox/Safari testing; translated interface.
