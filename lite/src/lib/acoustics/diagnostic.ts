import { Answers, QUESTION_BY_ID, STEPS, visibleQuestions } from "./questionnaire";
import { RoomAnalysis } from "./room";
import { Basis, CATEGORY_IDS, CATEGORY_LABEL, CategoryId, DiagnosisCategory } from "./types";
import { LevelStats, relativeSnr } from "./measurement";

/**
 * SoundSense diagnostic engine – transparent, rule-based scoring.
 *
 * Every rule adds (or subtracts) points to one or more of the seven problem categories. Nothing is hidden:
 * the full list of fired rules, with their points and the basis of each fact, is returned and printed in the
 * report.  The rule WEIGHTS are engineering judgement calibrated on the six reference scenarios in
 * tests/scenarios.test.ts – they are not derived from a published standard, and we say so in the UI.
 * The physical thresholds the rules use (RT60 targets, SNR guidance) ARE sourced – see room.ts / measurement.ts.
 */
export const ENGINE_VERSION = "1.0.0";

export interface MeasurementFacts {
  sessions: number;
  ambient?: LevelStats;
  speech?: LevelStats;
  snrDb?: number;
  snrRating?: "poor" | "marginal" | "good";
  calibrated: boolean;
}

export interface Facts {
  a: Answers;
  problems: Set<string>;
  equipment: Set<string>;
  attempted: Set<string>;
  env: string;
  occupants: number | null;
  room?: RoomAnalysis;
  meas?: MeasurementFacts;
}

export interface Rule {
  id: string;
  label: string;
  basis: Basis;
  effects: Partial<Record<CategoryId, number>>;
  when: (f: Facts) => boolean;
  evidence: (f: Facts) => string;
}

const is = (f: Facts, k: string, ...vals: string[]) => vals.includes(f.a[k]);
const arrHas = (f: Facts, k: string, ...vals: string[]) => Array.isArray(f.a[k]) && f.a[k].some((v: string) => vals.includes(v));
const p = (f: Facts, ...ids: string[]) => ids.some((i) => f.problems.has(i));
const onlineMode = (f: Facts) => is(f, "q5_mode", "online", "both");

export const RULES: Rule[] = [
  // ── Room acoustics ───────────────────────────────────────────────
  { id: "R-ROOM-ECHO", label: "Echo reported", basis: "reported", effects: { room: 1.5 }, when: (f) => p(f, "echo"), evidence: () => "Customer reports echo." },
  // Conferencing systems can only cause echo when remote participants exist, so this is skipped for in-person-only spaces.
  { id: "R-CONF-ECHO-ONLINE", label: "Echo in a meeting with remote participants", basis: "reported", effects: { conference: 1.5, hybrid: 1 }, when: (f) => p(f, "echo") && onlineMode(f), evidence: () => "Echo is reported in meetings that include remote participants, so the conferencing set-up (echo cancellation, open devices) is a candidate as well as the room." },
  { id: "R-ROOM-REVERB", label: "Reverberation reported", basis: "reported", effects: { room: 3 }, when: (f) => p(f, "reverb"), evidence: () => "Customer reports reverberation (hollow / lingering sound)." },
  { id: "R-ROOM-CLAP-LONG", label: "Clap test rings", basis: "reported", effects: { room: 3 }, when: (f) => is(f, "f_clap", "lingers"), evidence: () => "A clap in the room leaves an audible ring/tail." },
  { id: "R-ROOM-CLAP-SHORT", label: "Clap test is dry", basis: "reported", effects: { room: -2.5 }, when: (f) => is(f, "f_clap", "short"), evidence: () => "A clap sounds short and dry, which argues against a reverberant room." },
  {
    id: "R-ROOM-RT60-HIGH",
    label: "Estimated RT60 well above target",
    basis: "calculated",
    effects: { room: 3.5 },
    when: (f) => !!f.room && f.room.ratio > 1.3,
    evidence: (f) => `Sabine estimate RT60 ≈ ${f.room!.rt60Unoccupied} s vs ≈ ${f.room!.target} s target (${f.room!.ratio}× target).`,
  },
  {
    id: "R-ROOM-RT60-SEVERE",
    label: "Estimated RT60 more than double the target",
    basis: "calculated",
    effects: { room: 1.5 },
    when: (f) => !!f.room && f.room.ratio > 2,
    evidence: (f) => `The estimate is ${f.room!.ratio}× the target, far enough above it that the room is very likely a major contributor even allowing for the error in a screening estimate.`,
  },
  {
    id: "R-ROOM-OCC-OK",
    label: "People in the room bring RT60 within target",
    basis: "calculated",
    effects: { room: -1 },
    when: (f) => !!f.room && f.occupants !== null && f.occupants >= 10 && f.room.ratio > 1.0 && f.room.rt60Occupied <= f.room.target,
    evidence: (f) => `The empty-room estimate (≈ ${f.room!.rt60Unoccupied} s) is above target, but with about ${f.occupants} people the estimate falls to ≈ ${f.room!.rt60Occupied} s, within the ≈ ${f.room!.target} s target. Check whether the problem occurs when the room is full.`,
  },
  {
    id: "R-ROOM-RT60-MID",
    label: "Estimated RT60 slightly above target",
    basis: "calculated",
    effects: { room: 1.5 },
    when: (f) => !!f.room && f.room.ratio > 1.0 && f.room.ratio <= 1.3,
    evidence: (f) => `Sabine estimate RT60 ≈ ${f.room!.rt60Unoccupied} s vs ≈ ${f.room!.target} s target.`,
  },
  {
    id: "R-ROOM-RT60-OK",
    label: "Estimated RT60 within target",
    basis: "calculated",
    effects: { room: -2 },
    when: (f) => !!f.room && f.room.ratio <= 0.9,
    evidence: (f) => `Sabine estimate RT60 ≈ ${f.room!.rt60Unoccupied} s is under the ≈ ${f.room!.target} s target – the room itself is unlikely to be the main cause.`,
  },
  {
    id: "R-ROOM-HARD",
    label: "Hard reflective surfaces",
    basis: "calculated",
    effects: { room: 1 },
    when: (f) => !!f.room && f.room.geometry.reflectiveSurfaces,
    evidence: () => "Walls and ceiling are both highly reflective (low absorption).",
  },
  {
    id: "R-ROOM-LARGE",
    label: "Large volume with echo/reverb",
    basis: "calculated",
    effects: { room: 1 },
    when: (f) => !!f.room && f.room.volume > 150 && p(f, "echo", "reverb"),
    evidence: (f) => `Room volume is ${f.room!.volume} m³, which sustains reverberation.`,
  },
  {
    id: "R-ROOM-CRIT",
    label: "Short critical distance",
    basis: "calculated",
    effects: { room: 1, microphone: 0.5 },
    when: (f) => !!f.room && f.room.geometry.criticalDistanceM < 1.5 && p(f, "poor_mic_pickup", "distorted_speech", "echo", "reverb"),
    evidence: (f) => `Critical distance ≈ ${f.room!.geometry.criticalDistanceM} m: beyond that, microphones pick up mostly room reverberation.`,
  },
  // ── Echo that is really software / system ────────────────────────
  {
    id: "R-CONF-ECHO-FAREND",
    label: "Remote side hears their own voice",
    basis: "reported",
    effects: { conference: 3, hybrid: 1.5, room: -0.5 },
    when: (f) => is(f, "f_echo_remote", "yes"),
    evidence: () => "Remote participants hear their own voice returned – the signature of missing or failing acoustic echo cancellation.",
  },
  {
    id: "R-ROOM-ECHO-NOT-FAREND",
    label: "Echo is local, not returned to remote side",
    basis: "reported",
    effects: { room: 1.5 },
    when: (f) => is(f, "f_echo_remote", "no") && p(f, "echo", "reverb"),
    evidence: () => "Remote participants do not hear themselves back, so the echo is more likely produced by the room.",
  },
  { id: "R-FEEDBACK", label: "Whistling / feedback", basis: "reported", effects: { speaker: 2, room: 1 }, when: (f) => p(f, "feedback"), evidence: () => "Customer reports squeal/feedback when microphones are open (gain-structure or speaker–mic coupling)." },
  { id: "R-CONF-FEEDBACK-ONLINE", label: "Feedback in a conferencing set-up", basis: "reported", effects: { conference: 2 }, when: (f) => p(f, "feedback") && onlineMode(f), evidence: () => "Feedback with a conferencing system usually means microphone and speaker gain or placement in the room system needs tuning." },
  // ── Microphone ───────────────────────────────────────────────────
  { id: "R-MIC-PICKUP", label: "Poor microphone pickup", basis: "reported", effects: { microphone: 3 }, when: (f) => p(f, "poor_mic_pickup"), evidence: () => "Customer reports people are too quiet or cut out." },
  { id: "R-MIC-DIST", label: "Talkers are far from the microphone", basis: "reported", effects: { microphone: 2 }, when: (f) => is(f, "f_mic_distance", "3_6", "gt6"), evidence: (f) => `Farthest talker is ${f.a.f_mic_distance === "gt6" ? "over 6 m" : "3 – 6 m"} from the microphone.` },
  { id: "R-MIC-DIST-FAR", label: "Talkers are very far from the microphone", basis: "reported", effects: { microphone: 1 }, when: (f) => is(f, "f_mic_distance", "gt6"), evidence: () => "Distance beyond 6 m exceeds what a single laptop/speakerphone mic can cover." },
  {
    id: "R-MIC-LAPTOP-GROUP",
    label: "Laptop microphone covering a group",
    basis: "reported",
    effects: { microphone: 2.5 },
    when: (f) => f.equipment.has("laptop_mic") && (f.occupants ?? 0) > 4 && !f.equipment.has("conf_bar") && !f.equipment.has("ceiling_mic"),
    evidence: (f) => `A laptop microphone is the only pickup for about ${f.occupants} people.`,
  },
  { id: "R-MIC-QUIET-OK-PICKUP", label: "Clear when quiet (pickup)", basis: "reported", effects: { microphone: 1 }, when: (f) => is(f, "f_quiet_ok", "yes") && p(f, "poor_mic_pickup"), evidence: () => "Audio is clear in a quiet room, so the device works – placement/directionality or noise handling is the issue." },
  { id: "R-MIC-RETRY", label: "New microphone didn't solve it", basis: "reported", effects: { microphone: -1, room: 1 }, when: (f) => f.attempted.has("new_mic") && p(f, "poor_mic_pickup", "echo", "reverb", "distorted_speech"), evidence: () => "A new microphone has already been tried without fixing the problem, which points beyond the microphone itself." },
  {
    id: "R-MIC-CLIP",
    label: "Speech recording is overloaded",
    basis: "measured",
    effects: { microphone: 1.5 },
    when: (f) => !!f.meas?.speech && f.meas.speech.maxDb >= -3,
    evidence: (f) => `Your speech recording reaches ${f.meas!.speech!.maxDb} dBFS (relative), essentially full scale: the input gain is too high or the talker is too close, which causes distortion.`,
  },
  {
    id: "R-MIC-LOW-LEVEL",
    label: "Speech recording is very quiet",
    basis: "measured",
    effects: { microphone: 1.5 },
    when: (f) => !!f.meas?.speech && f.meas.speech.leqDb < -50,
    evidence: (f) => `Your speech recording averages only ${f.meas!.speech!.leqDb} dBFS (relative): the microphone is far from the talker or the input gain is low. Browser microphones are uncalibrated, so treat this as a comparison, not an absolute level.`,
  },
  // ── Background noise ─────────────────────────────────────────────
  { id: "R-NOISE-REPORTED", label: "Background noise reported", basis: "reported", effects: { noise: 3.5 }, when: (f) => p(f, "background_noise"), evidence: () => "Customer reports background noise." },
  { id: "R-NOISE-NC", label: "Noise cancellation not working", basis: "reported", effects: { noise: 2, microphone: 1 }, when: (f) => p(f, "poor_noise_cancel"), evidence: () => "Noise cancellation is not removing the noise." },
  { id: "R-NOISE-QUIET-OK", label: "Clear in a quiet room", basis: "reported", effects: { noise: 2 }, when: (f) => is(f, "f_quiet_ok", "yes") && p(f, "background_noise", "poor_noise_cancel"), evidence: () => "Audio is clear when the room is quiet, so equipment works and the noise itself is the problem." },
  { id: "R-NOISE-SRC-STEADY", label: "Steady noise source", basis: "reported", effects: { noise: 1.5 }, when: (f) => arrHas(f, "f_noise_source", "hvac", "street", "equipment", "construction"), evidence: (f) => `Noise source: ${(f.a.f_noise_source as string[]).filter((s) => ["hvac", "street", "equipment", "construction"].includes(s)).join(", ")}.` },
  { id: "R-NOISE-SRC-VOICES", label: "Nearby conversations", basis: "reported", effects: { noise: 1.5 }, when: (f) => arrHas(f, "f_noise_source", "conversations") && ["open_workspace", "corporate_office", "education"].includes(f.env), evidence: () => "Nearby conversations in a shared space are the main noise." },
  { id: "R-NOISE-OPEN", label: "Open workspace", basis: "reported", effects: { noise: 1 }, when: (f) => f.env === "open_workspace" && p(f, "background_noise", "poor_noise_cancel"), evidence: () => "Open workspaces have little separation between talkers." },
  {
    id: "R-NOISE-SNR-POOR",
    label: "Measured relative SNR is poor",
    basis: "measured",
    effects: { noise: 3, microphone: 0.5 },
    when: (f) => f.meas?.snrRating === "poor",
    evidence: (f) => `Relative SNR from your recordings is ${f.meas!.snrDb} dB (guidance: at least 10 dB, closer to 25 dB is best).`,
  },
  { id: "R-NOISE-SNR-MID", label: "Measured relative SNR is marginal", basis: "measured", effects: { noise: 1 }, when: (f) => f.meas?.snrRating === "marginal", evidence: (f) => `Relative SNR from your recordings is ${f.meas!.snrDb} dB – usable but below the ≈25 dB target.` },
  { id: "R-NOISE-SNR-GOOD", label: "Measured relative SNR is good", basis: "measured", effects: { noise: -2, microphone: -0.5 }, when: (f) => f.meas?.snrRating === "good", evidence: (f) => `Relative SNR from your recordings is ${f.meas!.snrDb} dB, so room noise is unlikely to be the main cause.` },
  // ── Speaker ──────────────────────────────────────────────────────
  { id: "R-SPK-LOW", label: "Low speaker volume", basis: "reported", effects: { speaker: 3.5 }, when: (f) => p(f, "low_speaker_volume"), evidence: () => "Customer reports sound is too quiet even at high volume." },
  { id: "R-SPK-ALL", label: "Quiet everywhere", basis: "reported", effects: { speaker: 1.5 }, when: (f) => is(f, "f_speaker_where", "everywhere"), evidence: () => "Volume is low even close to the speakers, which points at the speakers / amplification itself." },
  { id: "R-SPK-FAR", label: "Fine close, poor far away", basis: "reported", effects: { speaker: 1, room: 1 }, when: (f) => is(f, "f_speaker_where", "far_seats"), evidence: () => "Sound is acceptable close to the speakers but poor far away – coverage and room reverberation both contribute." },
  { id: "R-SPK-SPOTS", label: "Only certain spots are poor", basis: "reported", effects: { speaker: 1.5 }, when: (f) => is(f, "f_speaker_where", "specific_spots"), evidence: () => "Only certain spots are affected – typical of speaker placement or coverage gaps." },
  { id: "R-SPK-DISTORT", label: "Distorted or unclear speech", basis: "reported", effects: { room: 1.5, speaker: 1.5, microphone: 1 }, when: (f) => p(f, "distorted_speech"), evidence: () => "Customer reports distorted or unclear speech." },
  { id: "R-SPK-LAPTOP", label: "Small speakers for a group", basis: "reported", effects: { speaker: 2 }, when: (f) => (f.equipment.has("laptop_speaker") || f.equipment.has("tv_speakers")) && (f.occupants ?? 0) > 6 && p(f, "low_speaker_volume", "distorted_speech"), evidence: (f) => `Laptop/TV speakers serve about ${f.occupants} people.` },
  // ── Public address / large venues ────────────────────────────────
  { id: "R-PA-VENUE", label: "Large speech venue with unclear sound", basis: "reported", effects: { speaker: 1.5, room: 1.5 }, when: (f) => ["temple_public", "auditorium"].includes(f.env) && p(f, "distorted_speech", "low_speaker_volume", "echo", "reverb"), evidence: (f) => `${f.env === "temple_public" ? "Temple / public venue" : "Auditorium"} with unclear speech – coverage and reverberation are both typical contributors.` },
  { id: "R-PA-BACK", label: "Back rows are worst", basis: "reported", effects: { speaker: 1, room: 1.5 }, when: (f) => is(f, "f_pa_zone", "back_rows"), evidence: () => "Speech is hardest to understand far from the speakers, where reverberant sound dominates direct sound." },
  { id: "R-PA-EVERY", label: "Poor everywhere in the venue", basis: "reported", effects: { speaker: 1.5 }, when: (f) => is(f, "f_pa_zone", "everywhere", "near_speakers"), evidence: () => "Poor intelligibility even near the speakers suggests the PA system (speaker type, tuning, microphone technique)." },
  { id: "R-PA-EQUIP", label: "PA system in use", basis: "reported", effects: { speaker: 1 }, when: (f) => f.equipment.has("pa_system") && ["temple_public", "auditorium", "education"].includes(f.env), evidence: () => "An existing PA system is in use, so tuning and placement are the first things to review." },
  // ── Conference system / remote participants ──────────────────────
  { id: "R-CONF-REMOTE", label: "Remote participants affected", basis: "reported", effects: { conference: 1.5, hybrid: 1.5 }, when: (f) => is(f, "q6_remote", "yes") || arrHas(f, "q3_where", "remote_only"), evidence: () => "Remote participants are affected." },
  { id: "R-CONF-LOCAL-ONLY", label: "Remote side unaffected", basis: "reported", effects: { conference: -1, hybrid: -1 }, when: (f) => is(f, "q6_remote", "no") && is(f, "q5_mode", "offline"), evidence: () => "Only in-room participants are affected; conferencing setup is less likely." },
  { id: "R-CONF-PLATFORM", label: "Only one meeting platform", basis: "reported", effects: { conference: 1.5, hybrid: 1.5, connectivity: 1 }, when: (f) => is(f, "f_platform_specific", "yes"), evidence: () => "The fault appears only on one meeting platform, pointing to software/audio-settings." },
  { id: "R-CONF-HEADSET-FIX", label: "Headset fixes it", basis: "reported", effects: { room: 1.5, microphone: 1.5, conference: -0.5 }, when: (f) => is(f, "f_headset_fix", "yes"), evidence: () => "Using a headset resolves it – the network and platform are fine; the room microphone/speaker path is the issue." },
  { id: "R-CONF-HEADSET-NOFIX", label: "Headset does not fix it", basis: "reported", effects: { connectivity: 1.5, conference: 1 }, when: (f) => is(f, "f_headset_fix", "no"), evidence: () => "A headset does not help, which points to the network, platform or the far end rather than the room." },
  { id: "R-CONF-BAR", label: "Dedicated room system present", basis: "reported", effects: { conference: 1 }, when: (f) => (f.equipment.has("conf_bar") || f.equipment.has("ceiling_mic") || f.equipment.has("dsp_mixer")) && onlineMode(f) && p(f, "echo", "feedback", "overlapping_voices", "poor_mic_pickup"), evidence: () => "A dedicated conferencing system is installed, so its configuration (AEC, gain, mic zones) is a prime suspect." },
  // ── Hybrid ───────────────────────────────────────────────────────
  { id: "R-HYB-OVERLAP", label: "Overlapping voices", basis: "reported", effects: { hybrid: 3.5, conference: 1, microphone: 1 }, when: (f) => p(f, "overlapping_voices"), evidence: () => "Voices overlap in hybrid meetings." },
  { id: "R-HYB-BOTH", label: "Hybrid usage", basis: "reported", effects: { hybrid: 1 }, when: (f) => is(f, "q5_mode", "both") && p(f, "overlapping_voices", "echo", "poor_mic_pickup"), evidence: () => "Problems occur in meetings that mix in-room and remote participants." },
  // ── Connectivity ─────────────────────────────────────────────────
  { id: "R-CONN-BT", label: "Bluetooth disconnects", basis: "reported", effects: { connectivity: 4 }, when: (f) => p(f, "bt_disconnect"), evidence: () => "Bluetooth connection drops." },
  { id: "R-CONN-NOREC", label: "Device not recognised", basis: "reported", effects: { connectivity: 4 }, when: (f) => p(f, "device_not_recognised"), evidence: () => "The meeting app or computer does not recognise the audio device." },
  { id: "R-CONN-INTERMIT", label: "Intermittent audio", basis: "reported", effects: { connectivity: 3 }, when: (f) => p(f, "intermittent_audio"), evidence: () => "Audio cuts in and out." },
  { id: "R-CONN-DEVICE", label: "Fault follows the device", basis: "reported", effects: { connectivity: 2 }, when: (f) => is(f, "f_follows_device", "yes") && p(f, "bt_disconnect", "device_not_recognised", "intermittent_audio"), evidence: () => "The same fault appears with this device elsewhere, so it travels with the equipment rather than the room." },
  { id: "R-CONN-ROOMONLY", label: "Fault only in this room", basis: "reported", effects: { connectivity: 0.5, room: 0.5 }, when: (f) => is(f, "f_follows_device", "no"), evidence: () => "The device works elsewhere; interference or the room's wireless environment may be involved." },
  { id: "R-CONN-TYPE", label: "Wireless link in use", basis: "reported", effects: { connectivity: 1 }, when: (f) => is(f, "f_connection_type", "bluetooth", "wifi"), evidence: (f) => `Audio is carried over ${f.a.f_connection_type === "wifi" ? "Wi-Fi" : "Bluetooth"}, which is sensitive to range and interference.` },
  { id: "R-CONN-NOROOM", label: "Connectivity symptoms are not acoustic", basis: "reported", effects: { room: -2, noise: -1 }, when: (f) => p(f, "bt_disconnect", "device_not_recognised", "intermittent_audio") && !p(f, "echo", "reverb", "background_noise", "distorted_speech"), evidence: () => "Symptoms are about the connection, not about how the sound behaves in the room." },
  // ── Impact modifiers ─────────────────────────────────────────────
  { id: "R-IMPACT-OFFLINE", label: "In-person repeats", basis: "reported", effects: { speaker: 1, room: 1.5 }, when: (f) => is(f, "q7_repeat", "often") && is(f, "q5_mode", "offline"), evidence: () => "People often ask others to repeat themselves in in-person meetings (room/PA intelligibility)." },
  { id: "R-IMPACT-ONLINE", label: "Online repeats", basis: "reported", effects: { microphone: 1, connectivity: 0.5, noise: 0.5 }, when: (f) => is(f, "q7_repeat", "often") && is(f, "q5_mode", "online"), evidence: () => "People often ask others to repeat themselves in online meetings (microphone/line quality)." },
  { id: "R-TRIED-PANELS", label: "Panels already tried", basis: "reported", effects: { room: -1 }, when: (f) => f.attempted.has("panels") && p(f, "echo", "reverb"), evidence: () => "Acoustic panels were already installed; check their coverage and placement before adding more." },
];

// ───────────────────────────── Knowledge per category ─────────────────────────────
interface Knowledge {
  causes: { cause: string; check: string }[];
  tests: { test: string; why: string; who: "customer" | "consultant"; effort: "5 min" | "30 min" | "half-day" }[];
  solution: string;
  benefits: string[];
  complexity: "low" | "medium" | "high";
  freeSteps: string[];
  notHelpful: string[];
}

export const KNOWLEDGE: Record<CategoryId, Knowledge> = {
  room: {
    causes: [
      { cause: "Excess reverberation from hard, reflective surfaces", check: "Clap test; RT60 measurement" },
      { cause: "Flutter echo between parallel hard walls or glass", check: "Listen for a rapid 'zing' when clapping between walls" },
      { cause: "Room too large for the amount of absorption", check: "Compare estimated RT60 with target" },
      { cause: "Microphones too far from talkers (more reverb than voice)", check: "Compare recording at 0.5 m vs 3 m" },
    ],
    tests: [
      { test: "Clap test in the empty room", why: "Quick check of how long sound lingers", who: "customer", effort: "5 min" },
      { test: "Record a test call and listen from the far-end side", why: "Hears what remote people actually hear", who: "customer", effort: "30 min" },
      { test: "Measure RT60 (impulse response, ISO 3382)", why: "Replaces the screening estimate with a real number", who: "consultant", effort: "half-day" },
    ],
    solution: "Reduce reverberation with targeted absorption (ceiling and wall treatment) and bring microphones closer to talkers.",
    benefits: ["Clearer speech for everyone in the room", "Less echo on remote calls", "Less listening fatigue and fewer repeats"],
    complexity: "medium",
    freeSteps: ["Close curtains/blinds and add rugs or soft furniture as a trial", "Move the microphone closer to the talkers", "Ask remote participants how it sounds before and after"],
    notHelpful: ["Replacing speakers alone will not remove a reverberant room"],
  },
  microphone: {
    causes: [
      { cause: "Microphone too far from talkers or poorly placed", check: "Record at the seat that is worst" },
      { cause: "Omnidirectional laptop microphone covering a group", check: "Compare with a headset recording" },
      { cause: "Input gain too low or auto-gain interfering", check: "Check OS/meeting-app input levels" },
      { cause: "Microphone coverage gap for some seats", check: "Walk-test each seat while a colleague listens remotely" },
    ],
    tests: [
      { test: "Record the same sentence from each seat with the room microphone", why: "Maps coverage gaps", who: "customer", effort: "30 min" },
      { test: "Compare with a headset on the same call", why: "Separates room/mic path from network/platform", who: "customer", effort: "5 min" },
      { test: "Check input level and noise-suppression settings in the meeting app", why: "Wrong gain or aggressive suppression clips quiet talkers", who: "customer", effort: "5 min" },
    ],
    solution: "Fix microphone placement and coverage first; add a conferencing microphone or array sized to the room only if placement is not enough.",
    benefits: ["Even pickup across seats", "Less 'who is that?' on calls", "Fewer interruptions to repeat"],
    complexity: "low",
    freeSteps: ["Place the microphone centrally on the table, away from laptops/fans", "Set input gain so normal speech peaks around the upper-middle of the meter", "Ask people to face the microphone"],
    notHelpful: ["Acoustic panels will not fix distance or gain problems"],
  },
  speaker: {
    causes: [
      { cause: "Speakers underpowered or too few for the room/audience", check: "Check volume at far positions with a known test track" },
      { cause: "Speaker placement/aiming leaves coverage gaps", check: "Walk the room listening to speech" },
      { cause: "Poor tuning (EQ, gain structure) or distortion at high volume", check: "Check for clipping on the amplifier / mixer" },
      { cause: "Reverberation masking the speaker output (large venues)", check: "Compare intelligibility close vs far" },
    ],
    tests: [
      { test: "Play a speech recording and walk the space noting clarity by zone", why: "Finds coverage gaps and dead spots", who: "customer", effort: "30 min" },
      { test: "Check amplifier/mixer gain for clipping", why: "Distortion often looks like 'low volume'", who: "customer", effort: "5 min" },
      { test: "System tuning review with measurement microphone", why: "Identifies EQ, delay and coverage issues", who: "consultant", effort: "half-day" },
    ],
    solution: "Improve speaker coverage and tuning (placement, aiming, EQ, gain) before replacing equipment; add distributed speakers if coverage is the limit.",
    benefits: ["Even loudness across the audience", "Clearer words at the back", "No need to run the system near its limit"],
    complexity: "medium",
    freeSteps: ["Re-aim or raise speakers so the audience is covered directly", "Reduce bass/boost speech clarity range slightly on the mixer", "Position the speaker's microphone close to the mouth"],
    notHelpful: ["A bigger amplifier alone can make a reverberant venue less intelligible"],
  },
  noise: {
    causes: [
      { cause: "Steady noise (AC, fans, street) raising the noise floor", check: "Record 30 s of room noise" },
      { cause: "Nearby conversations in open space", check: "Note timing; try a quieter room" },
      { cause: "Microphone picking up the room instead of the talker", check: "Compare close-mic vs room-mic recordings" },
      { cause: "Noise suppression disabled or not suited to this noise", check: "Test with platform noise removal on/off" },
    ],
    tests: [
      { test: "Record 30 s of 'room noise' with the in-app meter", why: "Gives a relative noise floor", who: "customer", effort: "5 min" },
      { test: "Record speech from the usual seat and compute relative SNR", why: "SNR below ≈10 dB is poor; ≈25 dB is best", who: "customer", effort: "5 min" },
      { test: "Identify the noise source by switching systems (AC, projector) off", why: "Finds a fixable source", who: "customer", effort: "30 min" },
    ],
    solution: "Cut noise at the source where possible, use a close or directional microphone/headset, and enable suitable noise suppression; add partitions or a quieter room if noise stays high.",
    benefits: ["Better signal-to-noise on calls", "Less strain for listeners", "Works without major construction"],
    complexity: "low",
    freeSteps: ["Close doors/windows and move to a quieter room for important calls", "Turn on platform noise suppression and test", "Use a headset with a boom or directional microphone"],
    notHelpful: ["Absorption panels reduce reverberation, not steady background noise from outside the room"],
  },
  conference: {
    causes: [
      { cause: "Acoustic echo cancellation (AEC) missing, disabled or overwhelmed", check: "Ask remote side if they hear themselves" },
      { cause: "Gain structure / speaker–mic coupling causing feedback", check: "Lower speaker volume; test mic mute zones" },
      { cause: "Outdated firmware or wrong default audio device", check: "Check device and app settings" },
      { cause: "Mixing a room system with participants' own laptops (double audio)", check: "Ask in-room people to mute laptop mics/speakers" },
    ],
    tests: [
      { test: "Run a call with only the room system active (laptops muted)", why: "Rules out echo from duplicate devices", who: "customer", effort: "30 min" },
      { test: "Check firmware, default devices and AEC settings", why: "Most conference-system faults are configuration", who: "customer", effort: "30 min" },
      { test: "Review DSP/gain structure", why: "Removes feedback and echo at the system level", who: "consultant", effort: "half-day" },
    ],
    solution: "Fix the conference-system configuration (AEC, gain, devices, firmware) first; replace with a room system that has built-in AEC and beamforming if it is limited.",
    benefits: ["Remote participants stop hearing echo", "Predictable audio on every call", "Less IT firefighting before meetings"],
    complexity: "medium",
    freeSteps: ["Ensure only one microphone and one speaker are active in the room", "Update firmware/drivers and set the room device as the default", "Lower speaker volume slightly and retest"],
    notHelpful: ["Wall panels will not remove echo that is generated electronically"],
  },
  connectivity: {
    causes: [
      { cause: "Bluetooth range/interference or a weak pairing", check: "Test next to the computer; re-pair" },
      { cause: "Faulty cable, port or adapter", check: "Swap cable/port" },
      { cause: "Driver/OS or firmware issue", check: "Update and retest on another computer" },
      { cause: "Power-saving settings dropping USB/Bluetooth", check: "Disable power saving for the device" },
    ],
    tests: [
      { test: "Try the device on a second computer and in a second room", why: "Shows whether the fault travels with the device", who: "customer", effort: "30 min" },
      { test: "Swap cable, port and adapter one at a time", why: "Isolates hardware", who: "customer", effort: "30 min" },
      { test: "Update firmware and drivers", why: "Fixes many intermittent faults", who: "customer", effort: "30 min" },
    ],
    solution: "Treat this as an equipment/connection fault: isolate, update and replace the failing link. Acoustic treatment is not indicated.",
    benefits: ["Stable audio without drop-outs", "Lower cost – usually no acoustic work needed"],
    complexity: "low",
    freeSteps: ["Re-pair the device and keep it within a couple of metres of the computer", "Try a wired/USB connection", "Update firmware and drivers"],
    notHelpful: ["Acoustic panels, new speakers or premium room systems will not fix a connection fault"],
  },
  hybrid: {
    causes: [
      { cause: "Several open microphones capturing the same voice", check: "Count active mics/laptops in the room" },
      { cause: "No single room microphone or voice tracking for the group", check: "Check conferencing set-up" },
      { cause: "Meeting etiquette: no turn-taking or mute discipline", check: "Observe a meeting" },
      { cause: "Remote participants cannot be heard by the room (no monitor speaker)", check: "Ask in-room people to rate remote audio" },
    ],
    tests: [
      { test: "Count active microphones and speakers across devices", why: "Duplicate audio paths cause overlap and echo", who: "customer", effort: "5 min" },
      { test: "Pilot meeting using one room device and a facilitator", why: "Checks whether process alone helps", who: "customer", effort: "30 min" },
      { test: "Review room layout against microphone and camera coverage", why: "Verifies everyone is inside the pickup zone", who: "consultant", effort: "half-day" },
    ],
    solution: "Standardise on one room audio device, add simple hybrid-meeting rules (one active mic, facilitator, mute discipline), and upgrade to voice-tracking pickup if needed.",
    benefits: ["Remote participants hear one clean voice at a time", "Fewer interruptions", "Meetings start on time"],
    complexity: "low",
    freeSteps: ["Everyone in the room mutes laptop microphones and speakers", "Use one speakerphone/bar as the room device", "Name a facilitator who watches the remote participants"],
    notHelpful: ["Acoustic panels do not fix overlapping microphones"],
  },
};

// ───────────────────────────── Engine ─────────────────────────────
export interface FiredRule {
  id: string;
  label: string;
  basis: Basis;
  effects: Partial<Record<CategoryId, number>>;
  evidence: string;
}

export interface Diagnosis {
  engineVersion: string;
  primary: DiagnosisCategory;
  primaryLabel: string;
  contributing: CategoryId[];
  scores: Record<CategoryId, number>;
  confidence: number;
  confidenceLevel: "low" | "medium" | "high";
  confidenceBreakdown: { evidenceStrength: number; separation: number; completeness: number; corroboration: number };
  /** Observations backed by a measurement or a calculation. */
  confirmedObservations: { text: string; basis: Basis; category: CategoryId; points: number }[];
  /** What the customer told us. */
  reportedObservations: { text: string; category: CategoryId; points: number }[];
  /** Evidence that argues against the diagnosis. */
  contradictingEvidence: { text: string; category: CategoryId }[];
  rootCauses: { cause: string; category: CategoryId; status: "possible" | "likely"; check: string }[];
  recommendedTests: { test: string; why: string; who: "customer" | "consultant"; effort: string; category: CategoryId }[];
  solution: string;
  expectedBenefits: string[];
  complexity: "low" | "medium" | "high";
  freeFirstSteps: string[];
  notRecommended: string[];
  expertInspection: { needed: boolean; reasons: string[] };
  explanation: FiredRule[];
  dataQuality: { completeness: number; missing: string[] };
  caveat: string;
}

export function buildFacts(answers: Answers, room?: RoomAnalysis | null, measurements?: { kind: string; stats: LevelStats; calibrated?: boolean }[]): Facts {
  const arr = (k: string): string[] => (Array.isArray(answers[k]) ? answers[k] : []);
  let meas: MeasurementFacts | undefined;
  if (measurements && measurements.length) {
    const latest = (kind: string) => [...measurements].reverse().find((m) => m.kind === kind)?.stats;
    const ambient = latest("ambient");
    const speech = latest("speech");
    meas = { sessions: measurements.length, ambient, speech, calibrated: measurements.some((m) => m.calibrated) };
    if (ambient && speech) {
      const r = relativeSnr(speech, ambient);
      meas.snrDb = r.snrDb;
      meas.snrRating = r.rating;
    }
  }
  return {
    a: answers,
    problems: new Set(arr("q2_problems")),
    equipment: new Set(arr("q9_equipment")),
    attempted: new Set(arr("q10_attempted")),
    env: answers.environment ?? "other",
    occupants: typeof answers.q4_occupants === "number" ? answers.q4_occupants : null,
    room: room ?? undefined,
    meas,
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r2 = (n: number) => Math.round(n * 100) / 100;

export function diagnose(f: Facts): Diagnosis {
  const scores = Object.fromEntries(CATEGORY_IDS.map((c) => [c, 0])) as Record<CategoryId, number>;
  const fired: FiredRule[] = [];
  for (const rule of RULES) {
    if (!rule.when(f)) continue;
    fired.push({ id: rule.id, label: rule.label, basis: rule.basis, effects: rule.effects, evidence: rule.evidence(f) });
    for (const [c, w] of Object.entries(rule.effects)) scores[c as CategoryId] += w!;
  }
  for (const c of CATEGORY_IDS) scores[c] = r2(Math.max(0, scores[c]));

  const ranked = [...CATEGORY_IDS].sort((a, b) => scores[b] - scores[a]);
  const top = scores[ranked[0]];
  const second = scores[ranked[1]];
  const noEvidence = top < 2;

  // Multiple interacting: two or more categories carry substantial, comparable weight.
  const contributing: CategoryId[] = ranked.filter((c) => scores[c] >= Math.max(3, top * 0.6)).slice(0, 3);
  const multiple = !noEvidence && contributing.length >= 2;
  const primary: DiagnosisCategory = multiple ? "multiple" : ranked[0];
  const focus: CategoryId[] = multiple ? contributing : [ranked[0]];

  // Evidence for the focus categories.
  const confirmed: Diagnosis["confirmedObservations"] = [];
  const reported: Diagnosis["reportedObservations"] = [];
  const contradicting: Diagnosis["contradictingEvidence"] = [];
  for (const fr of fired) {
    for (const c of focus) {
      const w = fr.effects[c];
      if (!w) continue;
      if (w < 0) contradicting.push({ text: fr.evidence, category: c });
      else if (fr.basis === "reported") reported.push({ text: fr.evidence, category: c, points: w });
      else confirmed.push({ text: fr.evidence, basis: fr.basis, category: c, points: w });
    }
  }

  // Data completeness over the key questions that were visible to this customer.
  // Budget is deliberately not here: it shapes the recommendation, not the diagnosis.
  const keyIds = ["q2_problems", "q3_where", "q5_mode", "q9_equipment", "q4_occupants"];
  const followIds = STEPS.flatMap((s) => visibleQuestions(s, f.a)).filter((q) => q.followUp).map((q) => q.id);
  const wanted = [...keyIds, ...followIds];
  const missing = wanted.filter((id) => {
    const v = f.a[id];
    return v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
  });
  const completeness = wanted.length ? (wanted.length - missing.length) / wanted.length : 0;

  const positive = fired.reduce((s, fr) => s + focus.reduce((t, c) => t + Math.max(0, fr.effects[c] ?? 0), 0), 0);
  const nonReported = fired.filter((fr) => fr.basis !== "reported").reduce((s, fr) => s + focus.reduce((t, c) => t + Math.max(0, fr.effects[c] ?? 0), 0), 0);
  const evidenceStrength = clamp(top / 8, 0, 1);
  const separation = multiple ? 0.35 : top > 0 ? clamp((top - second) / top, 0, 1) : 0;
  const corroboration = positive > 0 ? clamp(nonReported / positive, 0, 1) : 0;
  let confidence = 0.12 + 0.38 * evidenceStrength + 0.2 * separation + 0.18 * completeness + 0.12 * corroboration;
  if (noEvidence) confidence = Math.min(confidence, 0.3);
  // Honesty cap: self-reported symptoms alone can never reach 'high'; calculated estimates from declared
  // materials stay below the 'high' line; only an actual measurement can lift the ceiling.
  const hasMeasured = fired.some((fr) => fr.basis === "measured" && focus.some((c) => (fr.effects[c] ?? 0) > 0));
  const hasCalculated = fired.some((fr) => fr.basis === "calculated" && focus.some((c) => (fr.effects[c] ?? 0) > 0));
  const ceiling = hasMeasured ? 0.9 : hasCalculated ? 0.74 : 0.68;
  confidence = r2(clamp(Math.min(confidence, ceiling), 0.05, 0.92)); // never claims certainty
  const level: Diagnosis["confidenceLevel"] = confidence < 0.45 ? "low" : confidence < 0.75 ? "medium" : "high";

  // Root causes: from focus categories, marked 'likely' if the category has strong evidence, else 'possible'.
  const rootCauses: Diagnosis["rootCauses"] = [];
  for (const c of focus) {
    KNOWLEDGE[c].causes.forEach((k, i) =>
      rootCauses.push({ cause: k.cause, category: c, check: k.check, status: i === 0 && scores[c] >= 5 && level !== "low" ? "likely" : "possible" })
    );
  }
  const tests = focus.flatMap((c) => KNOWLEDGE[c].tests.map((t) => ({ ...t, category: c })));
  // Offer the measurement-based tests only when they have not been done yet.
  const filteredTests = tests.filter((t) => !(f.meas?.snrDb !== undefined && t.test.startsWith("Record speech from the usual seat")));

  const reasons: string[] = [];
  if (f.room && f.room.ratio > 1.5) reasons.push(`Estimated RT60 is ${f.room.ratio}× the target – measure the real RT60 before spending on treatment.`);
  if (f.room && f.room.volume > 250 && focus.includes("room")) reasons.push(`Large room (${f.room.volume} m³): treatment layout needs a professional design.`);
  if (multiple) reasons.push("Several problems interact; a consultant should separate their contributions.");
  if (["temple_public", "auditorium"].includes(f.env) && (focus.includes("speaker") || focus.includes("room"))) reasons.push("Large speech venues need a PA coverage and reverberation survey.");
  if ((f.occupants ?? 0) >= 30 && (focus.includes("conference") || focus.includes("hybrid"))) reasons.push("Large meeting rooms need microphone-zone and speaker layout design.");
  if (level === "low") reasons.push("Evidence is limited – a short consultation will confirm the cause before you spend money.");

  const primaryKnowledge = focus.map((c) => KNOWLEDGE[c]);
  const complexityRank = { low: 1, medium: 2, high: 3 } as const;
  const complexity = multiple ? "high" : primaryKnowledge[0].complexity;
  void complexityRank;

  // "Not recommended": what will not help the diagnosed cause(s), plus purchases the evidence argues against.
  const notRecommended: string[] = focus.flatMap((c) => KNOWLEDGE[c].notHelpful);
  if (!focus.includes("room") && scores.room <= 0.5) notRecommended.push("Acoustic treatment: nothing in your answers points to the room itself.");
  if (!focus.includes("speaker") && scores.speaker <= 0.5) notRecommended.push("New speakers or amplifiers: the evidence does not point to the sound system.");
  if (!focus.includes("microphone") && scores.microphone <= 0.5) notRecommended.push("A new microphone: the evidence does not point to the microphone.");
  const uniqNot = Array.from(new Set(notRecommended));

  const solution = multiple
    ? `Tackle these in order of impact: ${focus.map((c) => KNOWLEDGE[c].solution.split(";")[0].replace(/\.$/, "")).join(" → ")}.`
    : KNOWLEDGE[focus[0]].solution;

  return {
    engineVersion: ENGINE_VERSION,
    primary,
    primaryLabel: noEvidence ? "Not enough information to classify" : CATEGORY_LABEL[primary],
    contributing: focus,
    scores,
    confidence,
    confidenceLevel: level,
    confidenceBreakdown: { evidenceStrength: r2(evidenceStrength), separation: r2(separation), completeness: r2(completeness), corroboration: r2(corroboration) },
    confirmedObservations: confirmed,
    reportedObservations: reported,
    contradictingEvidence: contradicting,
    rootCauses,
    recommendedTests: filteredTests,
    solution,
    expectedBenefits: Array.from(new Set(primaryKnowledge.flatMap((k) => k.benefits))).slice(0, 5),
    complexity,
    freeFirstSteps: Array.from(new Set(primaryKnowledge.flatMap((k) => k.freeSteps))).slice(0, 6),
    notRecommended: uniqNot,
    expertInspection: { needed: reasons.length > 0, reasons },
    explanation: fired,
    dataQuality: { completeness: r2(completeness), missing: missing.map((id) => QUESTION_BY_ID[id]?.label ?? id) },
    caveat:
      "This is a rule-based screening, not a certified acoustic survey. 'Reported' items come from the customer; only items marked calculated or measured were derived from data. Root causes are hypotheses until the recommended tests confirm them.",
  };
}
