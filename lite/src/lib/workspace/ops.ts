import { applyObservation, type AlertEvent, type Candidate } from "../acoustics/screening";
import { newId } from "../local/store";
import { audit, type Notif, type Reading, type Workspace } from "./store";

/** Feed a candidate (or null = condition gone) into the workspace alert list, record history and notifications. Pure on `w` except it mutates it. */
export function observe(w: Workspace, roomId: string | null, key: string, cand: Candidate | null, nowMs = Date.now()): AlertEvent[] {
  const { alerts, events } = applyObservation(w.alerts, roomId, key, cand, nowMs, w.settings.screening, newId);
  w.alerts = alerts;
  const roomName = roomId ? w.rooms.find((r) => r.id === roomId)?.name ?? "Room" : "Unassigned room";
  for (const e of events) {
    const a = alerts.find((x) => x.id === e.alertId); if (!a) continue;
    audit(w, `Alert ${e.type}: ${a.title} (${roomName}, ${a.severity})`);
    if (e.notify && w.settings.notify.inApp) {
      const n: Notif = { id: newId(), at: new Date(nowMs).toISOString(), roomId, alertId: a.id, type: e.type, title: `${roomName}: ${a.title}`, body: `${a.reading}. ${a.action}`, read: false };
      w.notifications.unshift(n);
    }
  }
  return events;
}

export function acknowledge(w: Workspace, alertId: string) {
  const a = w.alerts.find((x) => x.id === alertId); if (!a || a.status !== "open") return;
  a.status = "acknowledged"; a.acknowledgedAt = new Date().toISOString(); a.updatedAt = a.acknowledgedAt; audit(w, `Alert acknowledged: ${a.title}`);
}
export function resolveAlert(w: Workspace, alertId: string) {
  const a = w.alerts.find((x) => x.id === alertId); if (!a || a.status === "resolved") return;
  a.status = "resolved"; a.resolvedAt = new Date().toISOString(); a.resolvedBy = "user"; a.updatedAt = a.resolvedAt; audit(w, `Alert resolved by user: ${a.title}`);
}
export function addReading(w: Workspace, r: Omit<Reading, "id" | "at"> & { at?: string }) { w.readings.unshift({ id: newId(), at: r.at ?? new Date().toISOString(), ...r }); }
export const unreadCount = (w: Workspace) => w.notifications.filter((n) => !n.read).length;
export const openAlerts = (w: Workspace, roomId?: string | null) => w.alerts.filter((a) => a.status !== "resolved" && (roomId === undefined || a.roomId === roomId));

/** A copyable escalation message. Nothing is sent anywhere; the person copies it or opens their own mail app. */
export function escalationMessage(w: Workspace, alertId: string): { subject: string; body: string } | null {
  const a = w.alerts.find((x) => x.id === alertId); if (!a) return null;
  const room = a.roomId ? w.rooms.find((r) => r.id === a.roomId) : null;
  const where = room ? `${room.name}${room.building ? `, ${room.building}` : ""}${room.floor ? `, floor ${room.floor}` : ""}` : "a monitored room";
  return {
    subject: `Acoustic alert (${a.severity}): ${a.title} – ${where}`,
    body: [`Alert: ${a.title}`, `Room: ${where}`, `Reading: ${a.reading}`, `Evidence basis: ${a.basis}`, `Likely source: ${a.source}`, `First seen: ${a.createdAt}`, `Times seen: ${a.count}`, "", `Why it matters: ${a.explanation}`, `Suggested action: ${a.action}`, `How to re-check: ${a.reassess}`, "", "Note: screening estimate from a phone/laptop microphone unless marked calibrated. Not a hearing-safety measurement.", "Sent from SoundSense Lite (message written by the person using the app)."].join("\n"),
  };
}

/** In-app reminders for scheduled reassessments that have come due. */
export const dueSchedules = (w: Workspace, now = Date.now()) => w.schedules.filter((s) => Date.parse(s.nextDue) <= now);
export function completeSchedule(w: Workspace, id: string, now = Date.now()) {
  const s = w.schedules.find((x) => x.id === id); if (!s) return;
  s.nextDue = new Date(now + s.everyDays * 86_400_000).toISOString(); audit(w, `Reassessment done; next due ${s.nextDue.slice(0, 10)}`);
}
