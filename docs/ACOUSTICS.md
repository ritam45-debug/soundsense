# Acoustics: methods, sources and assumptions

SoundSense is a **screening and triage tool**. This document separates, for every number the engines use, what comes from a cited source from what is engineering judgement. Nothing here makes the output a certified acoustic survey.

Legend: **[S]** sourced · **[A]** assumption / engineering judgement · **[D]** derived by simple arithmetic from the above.

---

## 1. Room reverberation (RT60) — `src/lib/acoustics/room.ts`

**Method [S].** Sabine equation, `RT60 = 0.161 · V / A`, V in m³, A = Σ(S·α) in m² sabins. It is a *diffuse-field estimate*: it over-predicts absorption effects in rooms with very uneven absorption, and the number is only as good as the declared materials.

**Absorption coefficients [S, mid-frequency].** Representative values for common surfaces from the Sabine absorption-coefficient table used in Montana State University's EELE 217 acoustics notes; the engine uses the mean of the 500 Hz and 1 kHz values because those bands matter most for speech. Examples in the code: concrete/tile floor 0.02, thick carpet 0.625, plasterboard wall 0.045, suspended acoustic tile 0.675, glass 0.15.

**Per-person absorption [S/A].** 0.5 m² sabins per occupant (mid-frequency). The published range is wider (about 0.5–0.9); the lower end is used deliberately so occupancy is not allowed to hide a problem.

**Not sourced — assumptions [A].** The "none / some / lots" answers are converted to area fractions by judgement:

| Answer | Assumed fraction |
|---|---|
| Glass: some / large | 20 % / 50 % of wall area |
| Soft furnishings (curtains etc.): some / lots | 8 % / 20 % of wall area, α = 0.625 |
| Acoustic panels: some / extensive | 8 % / 25 % of wall + floor-area equivalent, α = 0.825 (2 in fibreglass on rigid backing) |
| Talker directivity for critical distance | Q = 2 |

**Targets.**

| Room type | Target RT60 | Basis |
|---|---|---|
| Conference / meeting room | 0.6 s | WELL v4 Feature 78 (conference rooms); US GSA *Sound Matters* (meeting rooms) **[S]** |
| Open workspace | 0.5 s | WELL v4 Feature 78 **[S]** — see note below |
| Education | 0.6 s | ANSI/ASA S12.60: unoccupied, furnished classroom < ~280 m³ (10,000 ft³) **[S]** |
| Home office, "other" | 0.6 s | Treated as a meeting room **[A]** |
| Lecture hall / auditorium (amplified speech) | 0.8 s | Maher, EELE 217 **[S/A]** |
| Worship / public speech space | 1.0 s | Maher, EELE 217 **[S/A]** |

*Note:* WELL has been revised since v4; later versions restructured the reverberation-time feature (including how open-plan offices are treated). Check the version your client cites before quoting a target.

**Risk label [A].** unoccupied RT60 ÷ target: ≤ 1.1 low, ≤ 1.5 moderate, above that high. The thresholds are judgement.

**Other outputs [D].** Schroeder frequency `2000·√(RT60/V)`, critical distance `0.057·√(2V/RT60)` (with Q = 2), cube-like proportion flag (longest/shortest side < 1.25), "reflective boundaries" flag (wall and ceiling α < 0.1).

**Always labelled** "screening estimate from declared materials – not a measured reverberation time and not a compliance result". A real RT60 needs an impulse-response or interrupted-noise measurement per ISO 3382; the diagnosis recommends one.

## 2. Microphone measurement — `src/lib/acoustics/measurement.ts`

The browser meter computes levels from the Web Audio API with echo cancellation, noise suppression and auto-gain requested **off** (browsers/OSs may still apply processing; this cannot be guaranteed).

Three tiers are kept strictly apart and labelled in the UI, the report and the database:

1. **Relative (dBFS)** — level versus the digital full scale of *this* device. Always available. Valid for comparing recordings made on the same device. Not a sound pressure level.
2. **Rough estimate** — dBFS plus an *assumed* typical-phone sensitivity offset, shown with ±20 dB. The offset is an **[A]**; it was not researched per device. Use only for "quiet / moderate / loud".
3. **Single-point calibrated** — dBFS plus an offset measured against a reference sound-level meter at one level. Better, but still not certified: no IEC 61672 A/C or time weighting, valid near the calibration level, sensitive to device processing.

Why the caution **[S]**: NIOSH's study of smartphone sound-measurement apps examined 192 apps; only 10 iOS apps met its selection criteria for functionality and calibration capability, and only 4 of those met its accuracy criterion of ±2 dB(A) mean difference from a Type 1 meter. NIOSH recommends an external, calibratable microphone for proper measurements and does not present the app as suitable for compliance use. (Kardous & Shaw, *J. Acoust. Soc. Am.* 135, 2014; NIOSH Science Blog, "So How Accurate Are These Smartphone Sound Measurement Apps?", 2014.)

**Statistics [D].** Leq (energy-average), L90 (level exceeded 90 % of the time ≈ background), L10 (≈ peaks), from short-time frames. These are computed on the **unweighted, relative** signal; they are not dB(A).

**Relative SNR.** Speech Leq − room-noise Leq, both on the same device so the unknown sensitivity cancels. Rating: < 10 dB poor, 10–25 dB marginal, ≥ 25 dB good. **[S, vendor guidance]** — taken from a conferencing-vendor support note (Biamp) stating at least 10 dB is needed and about 25 dB is best for speech intelligibility; it is a rule of thumb, not a standard.

## 3. Diagnostic engine — `src/lib/acoustics/diagnostic.ts` (v1.0.0)

- **Categories (8):** room acoustics, microphone, speaker, background noise, conference system, connectivity, hybrid setup — plus "multiple interacting problems" when two or more categories carry comparable weight.
- **Rules:** an explicit table; each rule has an id, a plain-language label, an *evidence basis* (`reported` by the customer, `calculated` by the engines, `measured` by the meter), point effects per category and a `when()` predicate. Every fired rule is stored and printed ("Show the rules that fired").
- **Weights [A].** The point values are engineering judgement tuned against the six reference scenarios in `tests/scenarios.test.ts`. They are **not** derived from a published model or a validated dataset, and the app says so.
- **Confidence [A].** `0.12 + 0.38·evidenceStrength + 0.20·separation + 0.18·completeness + 0.12·corroboration`, then capped: **0.68** if everything is merely reported, **0.74** if some evidence is calculated, **0.90** only if a measured fact supports the leading category; never above 0.92 and capped at 0.30 with no evidence. This is *not* a probability. A rule-based screening result with only self-reported evidence therefore cannot reach "high" confidence by construction.
- **Root causes** are shown as hypotheses with a "how to check" for each; recommended tests are listed with who does them and the effort.

## 4. Recommendation engine — `src/lib/acoustics/recommend.ts`

Principle: *diagnose first, recommend second, sell last.*

- Free / low-cost steps are always listed first.
- Per problem category up to three tiers: **budget**, **recommended**, **premium** (`catalogue.ts`).
- **Best fit** defaults to *recommended*; with low confidence it defaults to *budget* until the diagnosis is confirmed; **premium is never auto-selected.** The stated budget caps the plan: the least important categories are stepped down first, and if even the lowest estimate exceeds the budget the report says so and suggests phasing.
- Every item carries advantages, **limitations** and a "what we would not buy yet" note.
- **Prices are indicative placeholders [A]** set by the project team for the Indian market. They are *not* vendor quotes or price lists. They are always labelled "indicative", carry a `price_basis`, and are meant to be replaced by an administrator in *Admin → Products & pricing* with verified figures. The catalogue lists **solution types**, not specific vendor products.

## 5. Sources

- Sabine equation and absorption table: Maher, *EELE 217 Acoustics notes*, Montana State University (table of Sabine absorptivities).
- WELL Building Standard v4, Feature 78 *Reverberation time*: conference rooms 0.6 s, open offices 0.5 s; learning spaces < 0.6 s up to 10,000 ft³. https://standard.wellcertified.com/v4/node/12130 (legacy version page; it also cites the GSA recommendation for meeting rooms).
- US General Services Administration, *Sound Matters: How to Achieve Acoustic Comfort in the Contemporary Office* — meeting rooms 0.6 s.
- ANSI/ASA S12.60, *Acoustical Performance Criteria, Design Requirements, and Guidelines for Schools* — max 0.6 s RT (unoccupied, furnished classrooms under about 10,000 ft³) and 35 dBA background noise. Summaries: Acoustical Society/ANSI material reproduced by Larson Davis (https://larsondavis.com/learn/building-acoustics/ansi-standards-for-classroom-acoustics) and the American Academy of Audiology position statement on classroom acoustics.
- NIOSH smartphone sound-app evaluation: https://www.cdc.gov/niosh/blogs/2014/sound-app.html and https://stacks.cdc.gov/view/cdc/203723
- ISO 3382 (room acoustics measurement) and IEC 61672 (sound level meters): referenced as the standards a real measurement must follow; their text was not reproduced or used for any calculation here.
- Biamp support note on speech SNR (10 dB minimum, ≈25 dB best): vendor guidance, see §2.

The standards' full texts are paywalled and were consulted only through the public summaries above. Anyone relying on a threshold for a contract or compliance claim should read the current edition of the standard itself.
