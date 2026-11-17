export type CategoryId = "room" | "microphone" | "speaker" | "noise" | "conference" | "connectivity" | "hybrid";
export type DiagnosisCategory = CategoryId | "multiple";
export type Tier = "budget" | "recommended" | "premium";
export type Basis = "reported" | "calculated" | "measured";

export const CATEGORY_IDS: CategoryId[] = ["room", "microphone", "speaker", "noise", "conference", "connectivity", "hybrid"];

export const CATEGORY_LABEL: Record<DiagnosisCategory, string> = {
  room: "Room acoustics problem",
  microphone: "Microphone problem",
  speaker: "Speaker problem",
  noise: "Background noise problem",
  conference: "Conference-system problem",
  connectivity: "Connectivity problem",
  hybrid: "Hybrid meeting configuration problem",
  multiple: "Multiple interacting problems",
};

export const CATEGORY_SHORT: Record<DiagnosisCategory, string> = {
  room: "Room acoustics",
  microphone: "Microphone",
  speaker: "Speaker",
  noise: "Background noise",
  conference: "Conference system",
  connectivity: "Connectivity",
  hybrid: "Hybrid setup",
  multiple: "Multiple interacting",
};

export const TIER_LABEL: Record<Tier, string> = {
  budget: "Budget-friendly",
  recommended: "Recommended",
  premium: "Premium",
};

export const BASIS_LABEL: Record<Basis, string> = {
  reported: "Reported by customer",
  calculated: "Calculated estimate",
  measured: "Measured (relative)",
};

export const PRICE_DISCLAIMER =
  "Indicative estimates in INR set by the SoundSense team – not vendor quotes. Confirm with a supplier before purchase.";

export const formatInr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export const formatRange = (min: number, max: number) => (max === 0 ? "No cost" : min === 0 ? `Up to ${formatInr(max)}` : `${formatInr(min)} – ${formatInr(max)}`);
