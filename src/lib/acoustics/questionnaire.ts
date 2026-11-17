/**
 * Questionnaire definition – shared by the browser (to render) and the server (to validate).
 * Keeping one definition guarantees the form and the validator can never drift apart.
 */
export type Answers = Record<string, any>;
export type QType = "single" | "multi" | "text" | "longtext" | "number" | "email" | "tel" | "consent";

export interface Option {
  value: string;
  label: string;
  hint?: string;
}
export interface Question {
  id: string;
  label: string;
  help?: string;
  type: QType;
  options?: Option[];
  required?: boolean;
  min?: number;
  max?: number;
  maxLen?: number;
  placeholder?: string;
  /** Follow-up questions only appear when this returns true. */
  showIf?: (a: Answers) => boolean;
  /** Shown in the question list as a conditional follow-up. */
  followUp?: boolean;
}
export interface Step {
  id: string;
  title: string;
  description: string;
  questions: Question[];
}

const opt = (value: string, label: string, hint?: string): Option => ({ value, label, hint });
const arr = (a: Answers, k: string): string[] => (Array.isArray(a[k]) ? a[k] : []);
const hasAny = (a: Answers, k: string, vals: string[]) => arr(a, k).some((v) => vals.includes(v));
const online = (a: Answers) => a.q5_mode === "online" || a.q5_mode === "both";

export const ENVIRONMENTS: Option[] = [
  opt("corporate_office", "Corporate office"),
  opt("conference_room", "Conference / meeting room"),
  opt("open_workspace", "Open workspace"),
  opt("home_office", "Home office"),
  opt("auditorium", "Auditorium / hall"),
  opt("education", "Educational institution"),
  opt("temple_public", "Temple or public venue"),
  opt("other", "Other"),
];

export const PROBLEMS: Option[] = [
  opt("echo", "Echo", "People hear their own or others' voices repeated"),
  opt("reverb", "Reverberation", "Voices sound hollow, boomy or the sound lingers"),
  opt("background_noise", "Background noise", "AC, chatter, traffic or equipment noise"),
  opt("poor_mic_pickup", "Poor microphone pickup", "Some people are too quiet or cut out"),
  opt("low_speaker_volume", "Low speaker volume", "Hard to hear even at full volume"),
  opt("distorted_speech", "Distorted or unclear speech", "Muffled, harsh, or words are hard to make out"),
  opt("overlapping_voices", "Overlapping voices", "Hybrid meetings where people talk over each other"),
  opt("poor_noise_cancel", "Noise cancellation not working", "Noise still comes through headsets or software"),
  opt("feedback", "Whistling / feedback", "A squeal when a microphone is open"),
  opt("bt_disconnect", "Bluetooth disconnects"),
  opt("device_not_recognised", "Device not recognised", "Mic or speaker missing in the meeting app"),
  opt("intermittent_audio", "Audio cuts in and out"),
];

export const BUDGETS: (Option & { maxInr: number | null })[] = [
  { ...opt("under_25k", "Under ₹25,000"), maxInr: 25_000 },
  { ...opt("25k_1l", "₹25,000 – ₹1 lakh"), maxInr: 100_000 },
  { ...opt("1l_5l", "₹1 lakh – ₹5 lakh"), maxInr: 500_000 },
  { ...opt("5l_15l", "₹5 lakh – ₹15 lakh"), maxInr: 1_500_000 },
  { ...opt("above_15l", "Above ₹15 lakh"), maxInr: 50_000_000 },
  { ...opt("not_sure", "Not sure yet"), maxInr: null },
];

const yn = (extra?: Option[]) => [opt("yes", "Yes"), opt("no", "No"), opt("unsure", "Not sure"), ...(extra ?? [])];

export const STEPS: Step[] = [
  {
    id: "about",
    title: "About you",
    description: "So a consultant can reach you. We only use this for your assessment.",
    questions: [
      { id: "contact_name", label: "Full name", type: "text", required: true, maxLen: 150 },
      { id: "contact_email", label: "Work e-mail", type: "email", required: true, maxLen: 200 },
      { id: "contact_phone", label: "Phone", type: "tel", maxLen: 30, placeholder: "+91 …" },
      { id: "organisation", label: "Organisation", type: "text", required: true, maxLen: 200 },
      { id: "designation", label: "Designation", type: "text", maxLen: 150 },
      { id: "location", label: "Location (city / site)", type: "text", required: true, maxLen: 200 },
    ],
  },
  {
    id: "space",
    title: "Your space",
    description: "Where does the sound problem happen?",
    questions: [
      { id: "environment", label: "What kind of space is it?", type: "single", required: true, options: ENVIRONMENTS },
      { id: "environment_other", label: "Describe the space", type: "text", maxLen: 200, showIf: (a) => a.environment === "other" },
      { id: "q4_occupants", label: "How many people usually occupy the room?", type: "number", required: true, min: 1, max: 5000, help: "A typical day, not the maximum capacity." },
      {
        id: "q3_where",
        label: "Where does the problem occur?",
        type: "multi",
        required: true,
        options: [
          opt("whole_room", "Everywhere in the room"),
          opt("far_end", "Far from the speakers / front"),
          opt("near_speakers", "Close to the speakers"),
          opt("specific_seats", "Specific seats or zones"),
          opt("remote_only", "Only heard by remote participants"),
          opt("different_rooms", "Happens in several rooms / places"),
        ],
      },
      {
        id: "f_pa_zone",
        label: "Where is speech hardest to understand?",
        type: "single",
        followUp: true,
        showIf: (a) => ["temple_public", "auditorium", "education"].includes(a.environment),
        options: [opt("back_rows", "Back rows / far from the speakers"), opt("near_speakers", "Right next to the speakers"), opt("everywhere", "Everywhere"), opt("specific_zones", "Certain zones only"), opt("unsure", "Not sure")],
      },
    ],
  },
  {
    id: "problem",
    title: "The problem",
    description: "Select everything that applies – problems often come in combinations.",
    questions: [
      {
        id: "q1_frequency",
        label: "How often do you experience sound-related issues?",
        type: "single",
        required: true,
        options: [opt("daily", "Every day"), opt("weekly", "Weekly"), opt("monthly", "Monthly"), opt("rarely", "Rarely")],
      },
      { id: "q2_problems", label: "Which sound problems do you experience?", type: "multi", required: true, options: PROBLEMS },
      {
        id: "f_echo_remote",
        label: "Do remote participants hear their own voice coming back?",
        help: "That points to a software/echo-cancellation fault rather than room echo.",
        type: "single",
        followUp: true,
        showIf: (a) => hasAny(a, "q2_problems", ["echo", "reverb"]) && online(a),
        options: yn(),
      },
      {
        id: "f_clap",
        label: "Clap once in the empty room. What do you hear?",
        help: "A quick home-made test – a long ring means a reflective room.",
        type: "single",
        followUp: true,
        showIf: (a) => hasAny(a, "q2_problems", ["echo", "reverb", "distorted_speech"]),
        options: [opt("lingers", "A ring or tail that lingers"), opt("short", "A short, dry clap"), opt("untested", "I haven't tried")],
      },
      {
        id: "f_quiet_ok",
        label: "Is the audio clear when the room is quiet and one person talks?",
        type: "single",
        followUp: true,
        showIf: (a) => hasAny(a, "q2_problems", ["background_noise", "poor_mic_pickup", "poor_noise_cancel"]),
        options: yn(),
      },
      {
        id: "f_noise_source",
        label: "What is the main source of noise?",
        type: "multi",
        followUp: true,
        showIf: (a) => hasAny(a, "q2_problems", ["background_noise", "poor_noise_cancel"]),
        options: [opt("hvac", "AC / ventilation"), opt("conversations", "Nearby conversations"), opt("street", "Street / traffic"), opt("equipment", "Fans / machines / projector"), opt("construction", "Construction"), opt("other", "Something else")],
      },
      {
        id: "f_mic_distance",
        label: "How far is the farthest speaker from the microphone?",
        type: "single",
        followUp: true,
        showIf: (a) => hasAny(a, "q2_problems", ["poor_mic_pickup", "overlapping_voices"]),
        options: [opt("lt1", "Under 1 m"), opt("1_3", "1 – 3 m"), opt("3_6", "3 – 6 m"), opt("gt6", "More than 6 m")],
      },
      {
        id: "f_speaker_where",
        label: "Is the volume low everywhere, or only far from the speakers?",
        type: "single",
        followUp: true,
        showIf: (a) => hasAny(a, "q2_problems", ["low_speaker_volume", "distorted_speech"]),
        options: [opt("everywhere", "Low everywhere, even close"), opt("far_seats", "Fine close, poor far away"), opt("specific_spots", "Only certain spots"), opt("depends_source", "Depends on who/what is playing")],
      },
      {
        id: "f_connection_type",
        label: "How is the audio device connected?",
        type: "single",
        followUp: true,
        showIf: (a) => hasAny(a, "q2_problems", ["bt_disconnect", "device_not_recognised", "intermittent_audio"]),
        options: [opt("bluetooth", "Bluetooth"), opt("usb", "USB"), opt("hdmi", "HDMI / display"), opt("wifi", "Wi-Fi / network"), opt("analogue", "Analogue cable"), opt("unsure", "Not sure")],
      },
      {
        id: "f_follows_device",
        label: "Does the same fault appear with this device in other rooms or on other computers?",
        type: "single",
        followUp: true,
        showIf: (a) => hasAny(a, "q2_problems", ["bt_disconnect", "device_not_recognised", "intermittent_audio"]),
        options: yn(),
      },
    ],
  },
  {
    id: "meetings",
    title: "Meetings & impact",
    description: "How the problem affects your work.",
    questions: [
      { id: "q5_mode", label: "When does the problem occur?", type: "single", required: true, options: [opt("online", "Online meetings"), opt("offline", "In-person meetings"), opt("both", "Both")] },
      { id: "q6_remote", label: "Does the issue affect remote participants?", type: "single", showIf: online, options: yn() },
      { id: "f_platform_specific", label: "Does it only happen on one meeting platform (Teams, Zoom, Meet…)?", type: "single", followUp: true, showIf: online, options: yn() },
      { id: "f_headset_fix", label: "Does wearing a headset fix it?", type: "single", followUp: true, showIf: online, options: [opt("yes", "Yes"), opt("no", "No"), opt("not_tried", "Haven't tried")] },
      { id: "q7_repeat", label: "Do people frequently ask others to repeat themselves?", type: "single", required: true, options: [opt("often", "Often"), opt("sometimes", "Sometimes"), opt("rarely", "Rarely"), opt("never", "Never")] },
      {
        id: "q8_lost",
        label: "Does the issue cost meeting time? How much per meeting?",
        type: "single",
        required: true,
        options: [opt("none", "None"), opt("under_5", "Under 5 minutes"), opt("5_15", "5 – 15 minutes"), opt("over_15", "More than 15 minutes")],
      },
    ],
  },
  {
    id: "equipment",
    title: "Equipment & history",
    description: "What you have and what you've already tried.",
    questions: [
      {
        id: "q9_equipment",
        label: "What equipment is currently used?",
        type: "multi",
        required: true,
        options: [
          opt("laptop_mic", "Laptop built-in microphone"),
          opt("laptop_speaker", "Laptop speakers"),
          opt("usb_speakerphone", "USB speakerphone"),
          opt("bluetooth_speakerphone", "Bluetooth speakerphone"),
          opt("bt_headset", "Bluetooth headset"),
          opt("wired_headset", "Wired headset"),
          opt("conf_bar", "Video / conference bar"),
          opt("ceiling_mic", "Ceiling or table microphone array"),
          opt("tv_speakers", "TV / display speakers"),
          opt("pa_system", "PA / public-address system"),
          opt("dsp_mixer", "Mixer or DSP"),
          opt("none", "None / not sure"),
        ],
      },
      {
        id: "q10_attempted",
        label: "What have you already tried?",
        type: "multi",
        options: [
          opt("volume_up", "Raised the volume"),
          opt("moved_closer", "Moved people closer to the mic"),
          opt("new_mic", "Bought a new microphone"),
          opt("new_speaker", "Bought new speakers"),
          opt("panels", "Added acoustic panels"),
          opt("curtains_rugs", "Curtains / rugs"),
          opt("headset", "Used headsets"),
          opt("software_settings", "Changed software settings"),
          opt("restart_update", "Restarted / updated drivers"),
          opt("it_support", "Asked IT support"),
          opt("nothing", "Nothing yet"),
        ],
      },
    ],
  },
  {
    id: "buying",
    title: "Budget & goals",
    description: "Helps us suggest something affordable and suitable – not simply the biggest option.",
    questions: [
      { id: "q11_decider", label: "Who decides whether new equipment can be purchased?", type: "single", options: [opt("me", "Me"), opt("manager", "My manager"), opt("it_team", "IT team"), opt("admin_facilities", "Admin / facilities"), opt("committee", "A committee / trustees"), opt("not_sure", "Not sure")] },
      { id: "q12_payer", label: "Who pays for the equipment?", type: "single", options: [opt("organisation", "The organisation"), opt("department", "My department"), opt("self", "I do"), opt("donation", "Donations / community funds"), opt("not_sure", "Not sure")] },
      { id: "q13_budget", label: "What is the approximate budget?", type: "single", required: true, options: BUDGETS.map(({ value, label }) => opt(value, label)) },
      { id: "q14_ideal", label: "What would an ideal solution look like?", type: "longtext", maxLen: 2000, placeholder: "e.g. Everyone heard clearly without anyone shouting…" },
      { id: "comments", label: "Anything else we should know?", type: "longtext", maxLen: 3000 },
    ],
  },
  {
    id: "consent",
    title: "Review & consent",
    description: "Confirm how we may use your information.",
    questions: [
      { id: "consent_store", label: "I agree SoundSense may store these answers to prepare my assessment and let a consultant review them.", type: "consent", required: true },
      { id: "consent_chat", label: "Optional: allow the SoundSense chatbot to read this assessment to give more relevant help. You can turn this off at any time.", type: "consent" },
    ],
  },
];

export const ALL_QUESTIONS: Question[] = STEPS.flatMap((s) => s.questions);
export const QUESTION_BY_ID: Record<string, Question> = Object.fromEntries(ALL_QUESTIONS.map((q) => [q.id, q]));

export const visibleQuestions = (step: Step, a: Answers) => step.questions.filter((q) => !q.showIf || q.showIf(a));
export const optionLabel = (qid: string, value: string) => QUESTION_BY_ID[qid]?.options?.find((o) => o.value === value)?.label ?? value;

export interface ValidationResult {
  errors: Record<string, string>;
  clean: Answers;
}

/** Validates answers against the definition. `final` enforces required questions. Unknown/hidden keys are dropped. */
export function validateAnswers(input: Answers, final: boolean): ValidationResult {
  const errors: Record<string, string> = {};
  const clean: Answers = {};
  for (const q of ALL_QUESTIONS) {
    if (q.showIf && !q.showIf(input)) continue;
    const v = input[q.id];
    const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0) || (q.type === "consent" && v !== true);
    if (empty) {
      if (final && q.required) errors[q.id] = q.type === "consent" ? "This consent is needed to continue." : "Please answer this question.";
      continue;
    }
    switch (q.type) {
      case "single": {
        if (typeof v !== "string" || !q.options!.some((o) => o.value === v)) errors[q.id] = "Choose one of the options.";
        else clean[q.id] = v;
        break;
      }
      case "multi": {
        if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !q.options!.some((o) => o.value === x))) errors[q.id] = "Choose from the listed options.";
        else clean[q.id] = Array.from(new Set(v));
        break;
      }
      case "number": {
        const n = Number(v);
        if (!Number.isFinite(n) || n < (q.min ?? 0) || n > (q.max ?? 1e9)) errors[q.id] = `Enter a number between ${q.min ?? 0} and ${q.max}.`;
        else clean[q.id] = Math.round(n);
        break;
      }
      case "email": {
        if (typeof v !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errors[q.id] = "Enter a valid e-mail address.";
        else clean[q.id] = v.trim().slice(0, q.maxLen ?? 200);
        break;
      }
      case "consent":
        clean[q.id] = true;
        break;
      default: {
        if (typeof v !== "string") errors[q.id] = "Enter text.";
        else if (v.length > (q.maxLen ?? 500)) errors[q.id] = `Keep this under ${q.maxLen ?? 500} characters.`;
        else clean[q.id] = v.trim();
      }
    }
  }
  return { errors, clean };
}

/** Index of the first step with a visible, unanswered required question – used for the review screen. */
export function firstIncompleteStep(a: Answers): number {
  const { errors } = validateAnswers(a, true);
  return STEPS.findIndex((s) => s.questions.some((q) => errors[q.id]));
}

export const budgetMax = (a: Answers): number | null => BUDGETS.find((b) => b.value === a.q13_budget)?.maxInr ?? null;
