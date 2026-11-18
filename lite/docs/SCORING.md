# Thresholds, scores and where they come from

Labels used below: **Researched** = taken from a published source. **Brief** = a value given in the SoundSense 2.0 specification. **Judgement** = chosen by the team, with no published standard behind it.

## Noise screening bands (meeting rooms)

| Band | Upper limit (dB) | Severity | Origin |
|---|---|---|---|
| Quiet | 35 | Normal (green) | **Brief** |
| Generally acceptable | 45 | Normal (green) | **Brief** |
| Caution | 50 | Caution (yellow) | **Brief** |
| High concern | 55 | High concern (orange) | **Brief** |
| Priority investigation | above 55 | High concern (orange) | **Brief** |

All limits can be changed in Settings. They are **indicative screening values for speech comfort**, not legal limits and not hearing-safety limits.

Context that supports the low end of the scale (**Researched**): the US classroom acoustics standard ANSI/ASA S12.60 sets a maximum unoccupied background noise of 35 dBA and a maximum reverberation time of 0.6 s for classrooms under 10 000 cubic feet (see the Audiology and acoustics-industry summaries in Sources). Meeting rooms are not classrooms, so SoundSense does not claim the standard applies to them.

## Urgent (red) level

Default **85 dB**, enabled, configurable. It applies only to a **calibrated** reading.

**Researched:** the NIOSH recommended exposure limit for occupational noise is 85 dBA as an 8-hour time-weighted average; exposures at or above it are considered hazardous, and NIOSH recommends a hearing-loss-prevention programme from that level (NIOSH Publication 98-126).

**Limits of how SoundSense uses it:** the standard is about **A-weighted, 8-hour averages**. SoundSense uses a short, unweighted, single-point-calibrated browser reading. It is therefore a prompt to check with a proper sound level meter, not a hearing-safety assessment. It is kept completely separate from meeting-room comfort.

## Uncalibrated estimates

Estimated dB = measured dBFS + 100 dB assumed offset, shown with ±20 dB. **Judgement** (the offset is an assumption for a typical phone microphone; real devices differ widely). Severity uses the low end, so an estimate cannot be red.

## Alerts

Hysteresis 2 dB (an alert clears only after the level falls 2 dB below its threshold) and cooldown 10 min (a cleared alert that returns within 10 min reopens quietly). **Brief/Judgement**, both configurable. Repeats update one alert instead of creating new ones; a higher severity escalates and notifies; an acknowledged alert stays quiet until it gets worse.

## Noise-type fingerprint

Heuristic rules on level steadiness, low-frequency share, tonal persistence, syllable-rate modulation and click rate. Confidence is capped at 80 %. Bands: low under 45 %, medium under 65 %, high above. **Judgement.** Validated on synthetic signals only.

## Acoustic Health Score

Five areas with default weights: noise 25 %, reverberation 20 %, speech intelligibility 25 %, equipment 15 %, reported issues 15 %, with presets for conference rooms, auditoriums, temples/public venues, education, home offices and studios. **Judgement.** Areas without evidence are left out and their weight is shared by the rest. Fewer than two areas, or under 40 % of the weight, gives "Insufficient data".

Curves (piecewise linear, **Judgement**): noise 35 dB → 100, 45 → 85, 50 → 65, 55 → 45, 65 → 20, 75 → 5. Speech-to-noise gap 0 dB → 10, 10 → 45, 25 → 90, 30 → 100 (the 25 dB "good" point matches the existing Lite sound-check guidance). Reverberation as a multiple of the target RT60: 1.0 → 100, 1.3 → 75, 2.0 → 40, 3.0 → 10. RT60 targets by room type come from the existing room calculator (WELL v4 / GSA meeting rooms ≈ 0.6 s, ANSI S12.60 classrooms ≤ 0.6 s, others as documented in `src/lib/acoustics/room.ts`).

## Other judgement values

- "No clear change" below 3 dB between two recordings: a common rule of thumb that smaller changes are within normal session-to-session variation. Not a standard.
- Map rules: microphone to speaker at least 1.5 m, microphone to noise source at least 2 m, seats within 3 m of a microphone. Rules of thumb, not simulation.
- Badge criteria and goal logic: see `src/lib/workspace/goals.ts`.
- Cautious / as entered / optimistic ROI scenarios use half, 1× and 1.5× of the reduction the person enters.

## Sources

- NIOSH, *Criteria for a Recommended Standard: Occupational Noise Exposure, Revised Criteria 1998* (Publication 98-126): https://stacks.cdc.gov/view/cdc/6376
- NIOSH Workplace Solutions 2019-155, summary of the REL: https://www.cdc.gov/niosh/docs/wp-solutions/2019-155/pdfs/2019-155.pdf
- American Academy of Audiology, classroom acoustics position statement (ANSI S12.60 values): https://www.audiology.org/wp-content/uploads/2021/05/ClassroomAcousticsPosStatem.pdf_539953c8796547.05480496.pdf
- Armstrong, summary of ANSI S12.60 (reverberation and background noise limits): https://www.armstrong.com/en-us/articles/classroom-acoustics-ansi-standard.html
