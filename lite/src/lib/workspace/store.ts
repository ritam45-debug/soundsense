/**
 * Workspace data for SoundSense 2.0 (rooms, readings, alerts, notifications, health history, mitigation progress,
 * schedules, goals, map layouts, settings). It lives in this browser only (localStorage) under its OWN key, so the
 * Lite assessment data and its backups keep working exactly as before.
 */
import { DEFAULT_SCREENING, type AlertRec, type ScreeningConfig } from "../acoustics/screening";
import type { CatId, HealthInput } from "../acoustics/health";
import { newId } from "../local/store";

export const WS_KEY = "soundsense-lite-ws-v1";

export interface Room { id: string; name: string; building: string; floor: string; department: string; roomType: string; lengthM?: number; widthM?: number; heightM?: number; occupants?: number; assessmentId?: string | null; notes: string; createdAt: string }
export type ReadingBasis = "calibrated" | "estimate" | "relative" | "reported" | "unavailable";
export interface Reading { id: string; roomId: string | null; at: string; source: "live" | "readiness" | "recording"; basis: ReadingBasis; value: number | null; low?: number; high?: number; noiseClass?: string; label: string }
export interface Notif { id: string; at: string; roomId: string | null; alertId: string; type: string; title: string; body: string; read: boolean }
export interface Snapshot { id: string; roomId: string; at: string; overall: number | null; categories: Partial<Record<CatId, number | null>>; input: HealthInput; note?: string }
export interface Schedule { id: string; roomId: string; everyDays: number; nextDue: string; note: string }
export interface Goal { id: string; roomId: string | null; title: string; kind: "score" | "noise" | "actions"; target: number; createdAt: string; achievedAt?: string }
export interface MapItem { id: string; kind: string; x: number; y: number; label?: string }
export interface Contact { id: string; name: string; role: string; email: string }
export interface Settings {
  screening: ScreeningConfig;
  weights: Partial<Record<CatId, number>>;
  notify: { inApp: boolean; browser: boolean };
  contacts: Contact[];
  captionLang: string;
}
export interface AuditEntry { id: string; at: string; text: string }
export interface Workspace {
  v: 1;
  rooms: Room[]; readings: Reading[]; alerts: AlertRec[]; notifications: Notif[]; snapshots: Snapshot[];
  mitigationDone: Record<string, Record<string, string>>;
  schedules: Schedule[]; goals: Goal[]; maps: Record<string, MapItem[]>; audit: AuditEntry[]; settings: Settings;
  consults: { id: string; at: string; roomId: string | null; supplierId: string | null; message: string }[];
  /** Latest Meeting Readiness result per room id ("" = no room). */
  readiness: Record<string, ReadinessRecord>;
}
export interface ReadinessRecord { at: string; verdict: "ready" | "warnings" | "attention"; micFound: boolean; speakerFound: boolean; signal: boolean; clipping: boolean; feedback: boolean; noiseDb: number | null; noiseBasis: ReadingBasis; online: boolean | null; echoReported: boolean; findings: string[] }

export const defaultSettings = (): Settings => ({ screening: { ...DEFAULT_SCREENING, bands: [...DEFAULT_SCREENING.bands] as ScreeningConfig["bands"], urgent: { ...DEFAULT_SCREENING.urgent } }, weights: {}, notify: { inApp: true, browser: false }, contacts: [], captionLang: "en-US" });
export const emptyWs = (): Workspace => ({ v: 1, rooms: [], readings: [], alerts: [], notifications: [], snapshots: [], mitigationDone: {}, schedules: [], goals: [], maps: {}, audit: [], settings: defaultSettings(), consults: [], readiness: {} });

/** Fill in anything an older or partial save lacks, so new fields never crash old data. */
export function normalise(raw: any): Workspace {
  const base = emptyWs();
  if (!raw || typeof raw !== "object" || raw.v !== 1) return base;
  const s = raw.settings ?? {};
  return {
    ...base, ...raw,
    rooms: Array.isArray(raw.rooms) ? raw.rooms : [], readings: Array.isArray(raw.readings) ? raw.readings : [], alerts: Array.isArray(raw.alerts) ? raw.alerts : [],
    notifications: Array.isArray(raw.notifications) ? raw.notifications : [], snapshots: Array.isArray(raw.snapshots) ? raw.snapshots : [],
    schedules: Array.isArray(raw.schedules) ? raw.schedules : [], goals: Array.isArray(raw.goals) ? raw.goals : [], audit: Array.isArray(raw.audit) ? raw.audit : [], consults: Array.isArray(raw.consults) ? raw.consults : [],
    readiness: raw.readiness && typeof raw.readiness === "object" ? raw.readiness : {},
    mitigationDone: raw.mitigationDone && typeof raw.mitigationDone === "object" ? raw.mitigationDone : {}, maps: raw.maps && typeof raw.maps === "object" ? raw.maps : {},
    settings: { ...base.settings, ...s, screening: { ...base.settings.screening, ...(s.screening ?? {}), urgent: { ...base.settings.screening.urgent, ...(s.screening?.urgent ?? {}) } }, notify: { ...base.settings.notify, ...(s.notify ?? {}) }, contacts: Array.isArray(s.contacts) ? s.contacts : [], weights: s.weights ?? {} },
  };
}

const mem = new Map<string, string>();
const rd = (): string | null => { try { if (typeof localStorage !== "undefined") return localStorage.getItem(WS_KEY); } catch {} return mem.get(WS_KEY) ?? null; };
const wr = (v: string) => { try { if (typeof localStorage !== "undefined") { localStorage.setItem(WS_KEY, v); return; } } catch {} mem.set(WS_KEY, v); };

let cache: Workspace | null = null;
const listeners = new Set<() => void>();
export function loadWs(): Workspace {
  if (cache) return cache;
  try { const r = rd(); cache = r ? normalise(JSON.parse(r)) : emptyWs(); } catch { cache = emptyWs(); }
  return cache;
}
const CAP = { readings: 1500, notifications: 300, audit: 400, snapshots: 600 };
export function commitWs(next: Workspace) {
  next.readings = next.readings.slice(0, CAP.readings); next.notifications = next.notifications.slice(0, CAP.notifications); next.audit = next.audit.slice(0, CAP.audit); next.snapshots = next.snapshots.slice(0, CAP.snapshots);
  cache = next;
  try { wr(JSON.stringify(next)); } catch { /* storage full: keep in memory for this tab */ }
  listeners.forEach((l) => l());
}
export function updateWs(fn: (w: Workspace) => Workspace) { commitWs(fn(structuredClone(loadWs()))); }
export function subscribeWs(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
export function clearWs() { cache = emptyWs(); try { localStorage.removeItem(WS_KEY); } catch {} mem.delete(WS_KEY); listeners.forEach((l) => l()); }
export function resetWsCache() { cache = null; }

export const audit = (w: Workspace, text: string) => { w.audit.unshift({ id: newId(), at: new Date().toISOString(), text }); };

export function addRoom(w: Workspace, r: Partial<Room> & { name: string }): Room {
  const room: Room = { id: newId(), name: r.name.trim() || "Untitled room", building: r.building ?? "", floor: r.floor ?? "", department: r.department ?? "", roomType: r.roomType ?? "conference_room", lengthM: r.lengthM, widthM: r.widthM, heightM: r.heightM, occupants: r.occupants, assessmentId: r.assessmentId ?? null, notes: r.notes ?? "", createdAt: new Date().toISOString() };
  w.rooms.unshift(room); audit(w, `Room added: ${room.name}`); return room;
}
export function removeRoom(w: Workspace, id: string) {
  const r = w.rooms.find((x) => x.id === id); if (!r) return;
  w.rooms = w.rooms.filter((x) => x.id !== id);
  w.readings = w.readings.filter((x) => x.roomId !== id); w.alerts = w.alerts.filter((x) => x.roomId !== id); w.notifications = w.notifications.filter((x) => x.roomId !== id);
  w.snapshots = w.snapshots.filter((x) => x.roomId !== id); w.schedules = w.schedules.filter((x) => x.roomId !== id); w.goals = w.goals.filter((x) => x.roomId !== id);
  delete w.mitigationDone[id]; delete w.maps[id]; delete w.readiness[id]; audit(w, `Room removed: ${r.name}`);
}

/** Backup/restore for the workspace, attached to the existing Lite backup file as an optional `workspace` field. */
export const parseWorkspaceBackup = (d: any): Workspace | null => (d && d.workspace && d.workspace.v === 1 ? normalise(d.workspace) : null);
