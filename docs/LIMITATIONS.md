# Limitations — read before relying on the output

SoundSense is a **screening, education and triage** tool that helps a person understand what kind of sound problem they probably have and what to check first. It is not a certified acoustic survey, a compliance report or a purchasing authority.

## Measurement

- **Browser microphones are not measurement instruments.** Sensitivity, frequency response, automatic gain control and noise suppression vary by device and cannot be fully disabled from a web page. Uncalibrated results are shown as **relative dBFS** and are only comparable between recordings made on the same device.
- The "rough estimate" adds an **assumed** typical-phone offset with a stated **±20 dB** uncertainty. It was not researched per device.
- "Single-point calibrated" means one offset against a reference meter at one level. It is **not** certified, not A/C-weighted per IEC 61672, and not valid far from the calibration level. For compliance claims use a Type 1/2 sound-level meter (NIOSH found only 4 of 10 qualifying iOS apps within ±2 dB(A) of a Type 1 meter, even before considering Android devices).
- Level statistics (Leq, L90, L10) are computed on the unweighted relative signal, not dB(A).
- The only microphone testing done was with Chrome's synthetic fake device. Real-device behaviour (including iOS Safari) is untested.

## Room analysis

- RT60 is a **Sabine estimate from declared materials**, not a measurement (ISO 3382). It assumes a reasonably diffuse field and uses mid-frequency absorption only; real rooms with uneven absorption, openings, balconies, curved surfaces or large volumes can differ substantially.
- The area fractions behind "some / lots" of glass, curtains and panels, and the talker directivity for critical distance, are **judgement**, not researched values.
- RT60 targets come from published guidance for the stated room types (see ACOUSTICS.md). Standards were read through public summaries, not the paywalled texts; verify against the current edition before using a number in a contract.
- Background-noise limits, sound insulation between rooms, speech-intelligibility indices (STI) and low-frequency/room-mode behaviour are **not** assessed.

## Diagnosis

- Scoring weights are **engineering judgement** tuned on six reference scenarios. They are not derived from a validated dataset, have not been checked against consultant-confirmed real cases, and may be wrong for situations unlike those scenarios.
- Confidence is a transparent heuristic, **not a probability**. It is deliberately capped (0.68 with only reported evidence), so a self-reported assessment can never read as "high".
- Root causes are hypotheses until the listed tests confirm them. A human consultant should review anything that will drive a purchase.
- Questionnaire answers are self-reported; wrong answers produce wrong diagnoses, and the report says which evidence was reported vs calculated vs measured.

## Recommendations and prices

- **Prices are indicative placeholders** written by the project team. They are *not* from vendor quotes, price lists or market research, and will be wrong for specific products, dates, taxes, installation and logistics. Replace them in Admin → Products & pricing and set the price basis.
- The catalogue lists **solution types**, not specific vendor products or SKUs, and makes no brand recommendations.
- The "improvement to expect" statements are qualitative; no dB or percentage improvement is promised.

## Assistant (chatbot)

- With no `ANTHROPIC_API_KEY`, answers come from a keyword-driven fallback labelled "Offline guidance mode"; it covers common questions only.
- With a key, answers come from a large language model, which can be wrong. It is instructed to be cautious, not to sell, and to offer a human, but its output is not verified. The live API path was not exercised in testing here.
- Conversation content goes to the model provider when the LLM is enabled; the operator must decide whether that is acceptable for their users and disclose it.

## Platform

- **Browsers:** only Chromium/Chrome has been run. Firefox and Safari are untested.
- **Hosting:** not deployed to Vercel/Render/Supabase in this work; verified on a local production build and on PostgreSQL 18. The embedded PGlite database is single-process and for development/tests only.
- **Bookings:** single time zone (IST), 60-minute slots, one consultation per slot, request-then-confirm. No payments, no calendar sync (Google/Outlook), no SMS/WhatsApp, no automatic reminders.
- **E-mail** needs SMTP configured; otherwise messages are only logged.
- **Documents** are stored in the database (≤ 3 MB each), not in object storage, and are not virus-scanned.
- **Education centre:** text articles with two inline diagrams. **No videos** are included.
- **Accessibility:** automated axe-core checks pass for WCAG 2.1 A/AA rules on the tested pages; no manual screen-reader audit was done, and automated checks cannot establish full conformance.
- **Internationalisation:** English only; currency INR; Indian-market assumptions in the catalogue.
- **Data protection:** no self-service account deletion or data export yet; retention and consent wording must be set by the operating organisation. No security audit or penetration test has been performed (see SECURITY.md).
- **Scale:** designed for a pilot (hundreds of users). No load testing has been done beyond the booking-concurrency tests, so capacity is unmeasured.
