/**
 * SoundSense Lite keeps everything in this browser (localStorage). Nothing is sent to any server.
 * If the browser blocks storage (some private modes), it falls back to memory for the current tab.
 */
import type { Answers } from "../acoustics/questionnaire";

export interface LocalAssessment {
  id: string;
  ref: string;
  title: string | null;
  status: "draft" | "submitted" | "in_review" | "completed";
  step: number;
  answers: Answers;
  environment_type: string | null;
  summary: any | null;
  share_with_chat: boolean;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  room: null | { length_m: number; width_m: number; height_m: number; occupants: number; floor_material: string; wall_material: string; ceiling_material: string; glass_share: string; soft_furnishings: string; panels: string; computed: any };
  measurements: any[];
  diagnostic: null | { id: string; createdAt: string; diagnosis: any; plan: any; room: any };
  recommendations: any[];
  reports: { id: string; version: number; status: "preliminary" | "final"; consultant_remarks: string | null; created_at: string; payload: any }[];
}
export interface LocalDb { v: 1; seq: number; assessments: LocalAssessment[] }

export const STORAGE_KEY = "soundsense-lite-v1";
const empty = (): LocalDb => ({ v: 1, seq: 0, assessments: [] });

const memory = new Map<string, string>();
const store = {
  get(k: string): string | null {
    try { if (typeof localStorage !== "undefined") return localStorage.getItem(k); } catch {}
    return memory.get(k) ?? null;
  },
  set(k: string, v: string) {
    try { if (typeof localStorage !== "undefined") { localStorage.setItem(k, v); return; } } catch {}
    memory.set(k, v);
  },
  del(k: string) {
    try { if (typeof localStorage !== "undefined") localStorage.removeItem(k); } catch {}
    memory.delete(k);
  },
};

export function loadDb(): LocalDb {
  try {
    const raw = store.get(STORAGE_KEY);
    if (!raw) return empty();
    const d = JSON.parse(raw);
    if (d && d.v === 1 && Array.isArray(d.assessments)) return d as LocalDb;
  } catch {}
  return empty();
}
export function saveDb(db: LocalDb) {
  try { store.set(STORAGE_KEY, JSON.stringify(db)); }
  catch { throw new Error("This browser would not let SoundSense save your data (storage may be full or blocked). Export what you need, or free some space."); }
}
export function clearDb() { store.del(STORAGE_KEY); }

export const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/** Validate an imported backup before it replaces anything. */
export function parseBackup(text: string): LocalDb {
  let d: any;
  try { d = JSON.parse(text); } catch { throw new Error("That file is not a SoundSense backup (it is not valid JSON)."); }
  if (!d || d.app !== "soundsense-lite" || !d.data || d.data.v !== 1 || !Array.isArray(d.data.assessments)) throw new Error("That file is not a SoundSense Lite backup.");
  for (const a of d.data.assessments) if (!a || typeof a.id !== "string" || typeof a.ref !== "string" || typeof a.answers !== "object") throw new Error("The backup file is damaged or from a different version.");
  return d.data as LocalDb;
}
export const makeBackup = (db: LocalDb) => JSON.stringify({ app: "soundsense-lite", exportedAt: new Date().toISOString(), data: db }, null, 2);
