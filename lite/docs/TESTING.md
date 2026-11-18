# Testing report (SoundSense 2.0, Lite)

Run from `lite/`:

```bash
npm run typecheck
npm test                                   # 146 unit tests in 20 files
NEXT_PUBLIC_BASE_PATH=/soundsense npm run build
BASE_PATH=/soundsense PORT=4100 npm run serve &
npm run test:e2e                           # 42 existing + 53 SoundSense 2.0 browser checks in real Chrome
npx tsx e2e/shots.ts                       # regenerates docs/screenshots from a demo workspace
```

## Unit tests (146)

Screening and alerts (bands, honest levels, red rules, dedupe, escalation, hysteresis, cooldown, acknowledgement, required alert fields) · audio fingerprinting on synthetic signals (hum, fan, traffic, keyboard, speech vs overlapping voices, refusal when too short or quiet, confidence cap, clipping, feedback) · health score (insufficient data, evidence labels, deductions, monotonicity, weights) · mitigation (no invented prices, free first, professional only when warranted) · workspace store and operations · live evaluation · derivation of score inputs from assessments · readiness verdicts · before/after fairness rules · copilot answers · map rules · passport (field choice, encryption, wrong passcode, tamper, junk links, QR size) · trend notes · portfolio filters and CSV · ROI · goals and badges · captions · PDF output. The earlier Lite and engine tests still run.

## Browser checks (53 new)

Add a room; honest "Insufficient data"; link an assessment and see labelled evidence and deductions; mitigation order and persistence; live monitoring with the browser's fake microphone (uncalibrated estimate, no red, reading saved); Test my room verdict; before/after with PDF download and refusal of an unfair pair; encrypted passport round-trip in a second page (wrong passcode rejected); map placement and feedback warning; keyboard arrow-key movement; analytics filter and CSV; ROI inputs and caveat; marketplace has no prices or reviews; captions need consent; settings persist; backup contains the workspace and delete-all clears it; **no request leaves the site's own origin**; no console errors; no horizontal overflow at 375, 768 and 1280 px on all 16 new pages; axe (WCAG 2 A/AA, 2.1 AA) on all of them in light and dark mode with no serious or critical issues.

## Not covered

Real microphones and real rooms, Safari, Firefox, mobile browsers, screen readers, phone-camera QR scanning, and live Web Speech recognition (the browser service needs real speech and network). These are listed as limitations in `SOUNDSENSE-2.0.md`.
