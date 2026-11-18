/**
 * Room Passport: a compact summary of a room that can be shared as a link or QR code.
 * HONEST LIMITS (also shown in the app): this is a static site with no accounts or server. The data lives INSIDE the link,
 * in the URL fragment, which browsers do not send to servers. Anyone who has the link can read it (or, with a passcode,
 * anyone who has the link AND the passcode). A shared link cannot be revoked or tracked. Share only what you are happy to share.
 */
export const PASSPORT_FIELDS = ["location", "type", "score", "noise", "alerts", "actions", "readiness", "assessed", "next", "notes"] as const;
export type PassportField = (typeof PASSPORT_FIELDS)[number];
export const FIELD_LABEL: Record<PassportField, string> = { location: "Building and floor", type: "Room type", score: "Acoustic health score", noise: "Latest noise reading", alerts: "Open alerts", actions: "Fixes completed", readiness: "Last meeting-readiness result", assessed: "Last assessed", next: "Next reassessment due", notes: "Notes" };
export interface PassportSource { name: string; building: string; floor: string; roomType: string; score: number | null; scoreBand: string; scoreBasis: string; noise: { value: number; calibrated: boolean } | null; openAlerts: number; topSeverity: string | null; actionsDone: number; actionsTotal: number; readiness: string | null; assessedAt: string | null; nextDue: string | null; notes: string }
export interface PassportData { v: 1; n: string; at: string; f: Partial<Record<PassportField, string>> }

export function buildPassport(src: PassportSource, fields: PassportField[], now = new Date()): PassportData {
  const f: Partial<Record<PassportField, string>> = {};
  const on = (k: PassportField) => fields.includes(k);
  if (on("location") && (src.building || src.floor)) f.location = [src.building, src.floor && `floor ${src.floor}`].filter(Boolean).join(", ");
  if (on("type")) f.type = src.roomType;
  if (on("score")) f.score = src.score === null ? "Insufficient data" : `${src.score}/100 (${src.scoreBand}). ${src.scoreBasis}`;
  if (on("noise")) f.noise = src.noise ? `${Math.round(src.noise.value)} dB, ${src.noise.calibrated ? "calibrated (single-point)" : "uncalibrated estimate, about ±20 dB"}` : "No reading";
  if (on("alerts")) f.alerts = src.openAlerts ? `${src.openAlerts} open (highest: ${src.topSeverity})` : "None open";
  if (on("actions")) f.actions = `${src.actionsDone} of ${src.actionsTotal} planned fixes done`;
  if (on("readiness") && src.readiness) f.readiness = src.readiness;
  if (on("assessed") && src.assessedAt) f.assessed = src.assessedAt.slice(0, 10);
  if (on("next") && src.nextDue) f.next = src.nextDue.slice(0, 10);
  if (on("notes") && src.notes.trim()) f.notes = src.notes.trim().slice(0, 300);
  return { v: 1, n: src.name.slice(0, 80), at: now.toISOString(), f };
}

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const utf8 = (s: string) => new TextEncoder().encode(s);

async function key(pass: string, salt: Uint8Array, usage: KeyUsage[]) {
  const base = await crypto.subtle.importKey("raw", utf8(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: 150_000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, usage);
}
/** `p.` = plain, `e.` = encrypted (salt | iv | AES-GCM ciphertext). */
export async function encodePassport(d: PassportData, passcode?: string): Promise<string> {
  const json = utf8(JSON.stringify(d));
  if (!passcode) return `p.${b64u(json)}`;
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(passcode, salt, ["encrypt"]), json));
  const out = new Uint8Array(28 + ct.length); out.set(salt, 0); out.set(iv, 16); out.set(ct, 28);
  return `e.${b64u(out)}`;
}
export const needsPasscode = (token: string) => token.startsWith("e.");
export async function decodePassport(token: string, passcode?: string): Promise<PassportData> {
  try {
    let json: string;
    if (token.startsWith("p.")) json = new TextDecoder().decode(unb64u(token.slice(2)));
    else if (token.startsWith("e.")) {
      if (!passcode) throw new Error("passcode");
      const raw = unb64u(token.slice(2));
      json = new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(16, 28) }, await key(passcode, raw.slice(0, 16), ["decrypt"]), raw.slice(28)));
    } else throw new Error("format");
    const d = JSON.parse(json);
    if (d?.v !== 1 || typeof d.n !== "string" || typeof d.f !== "object") throw new Error("shape");
    return d as PassportData;
  } catch (e: any) {
    if (e?.message === "passcode") throw new Error("This passport is protected. Enter the passcode.");
    if (token.startsWith("e.")) throw new Error("Wrong passcode, or the link has been altered.");
    throw new Error("This passport link is damaged or not a SoundSense passport.");
  }
}
export const passportUrl = (origin: string, basePath: string, token: string) => `${origin}${basePath}/app/passport/#d=${token}`;
/** Most QR scanners cope with up to about 1.2 KB reliably; longer links make dense codes. */
export const QR_LIMIT = 1400;
