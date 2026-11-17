import { getDb, sys, sysTx, Queryable } from "../db";
import { ApiError, bad, conflict, forbidden, notFound } from "../api";
import { audit, notify, notifyRole } from "../audit";
import { sendMail } from "../mail";
import { SessionUser } from "../db";

import { BOOKING_TYPES, bookingTypeLabel } from "./bookings-shared";
export { BOOKING_TYPES, bookingTypeLabel };

export interface AvailabilitySettings {
  days: number[]; // 0=Sun … 6=Sat, in the business time zone
  start: string; // "HH:MM"
  end: string;
  breakStart: string | null;
  breakEnd: string | null;
  slotMinutes: number;
  capacity: number; // consultations that can run in parallel
  utcOffsetMinutes: number; // business time zone offset (IST = 330)
  timezoneLabel: string;
  leadHours: number; // earliest bookable time from now
  horizonDays: number;
}

export const DEFAULT_AVAILABILITY: AvailabilitySettings = {
  days: [1, 2, 3, 4, 5],
  start: "10:00",
  end: "17:00",
  breakStart: "13:00",
  breakEnd: "14:00",
  slotMinutes: 60,
  capacity: 1,
  utcOffsetMinutes: 330,
  timezoneLabel: "IST (UTC+5:30)",
  leadHours: 12,
  horizonDays: 45,
};

export async function getAvailabilitySettings(q?: Queryable): Promise<AvailabilitySettings> {
  const run = q ?? (await getDb());
  const r = await run.query<{ value: Partial<AvailabilitySettings> }>("select value from system_settings where key = 'availability'");
  return { ...DEFAULT_AVAILABILITY, ...(r.rows[0]?.value ?? {}) };
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export interface Slot {
  start: string; // ISO UTC
  end: string;
  day: string; // YYYY-MM-DD in business TZ
  label: string; // HH:MM in business TZ
  available: boolean;
  reason?: "booked" | "blocked" | "past";
}

/** All slots in [fromDay, toDay] (business-TZ dates). Unavailable slots are returned with available=false so the UI can grey them out. */
export async function listSlots(fromDay: string, toDay: string, now = new Date(), q?: Queryable): Promise<Slot[]> {
  const from = new Date(`${fromDay}T00:00:00Z`);
  const to = new Date(`${toDay}T00:00:00Z`);
  if (isNaN(+from) || isNaN(+to) || to < from) throw bad("Invalid date range.");
  if ((+to - +from) / 864e5 > 62) throw bad("Choose a range of at most 62 days.");
  return slotsTx(q ?? (await getDb()), fromDay, toDay, now);
}

function bookingRef() {
  return `BK-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
}

export interface NewBooking {
  type: string;
  slotStart: string;
  description: string;
  assessmentId?: string | null;
  contact: { name: string; email: string; phone?: string };
}

export async function createBooking(user: SessionUser & { id: string }, input: NewBooking) {
  return sysTx(async (q) => {
    // Serialise bookings for the same slot so two customers can never take the last place.
    await q.query("select pg_advisory_xact_lock(hashtext($1))", [input.slotStart]);
    const check = await slotIsBookableTx(q, input.slotStart);
    if (!check.ok) throw conflict(check.why ?? "Slot unavailable.");
    if (input.assessmentId) {
      const own = await q.query("select 1 from assessments where id = $1 and customer_id = $2", [input.assessmentId, user.id]);
      if (!own.rowCount) throw forbidden("That assessment is not yours.");
    }
    let ref = bookingRef();
    for (let i = 0; i < 3; i++) {
      try {
        const r = await q.query(
          `insert into bookings(ref, customer_id, assessment_id, type, slot_start, slot_end, contact, description)
           values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) returning *`,
          [ref, user.id, input.assessmentId ?? null, input.type, input.slotStart, check.end, JSON.stringify(input.contact), input.description]
        );
        return r.rows[0];
      } catch (e: any) {
        if (e?.code === "23505" && String(e.message).includes("bookings_customer_slot_uq")) throw conflict("You already have a booking in this slot.");
        if (e?.code === "23505") ref = bookingRef();
        else throw e;
      }
    }
    throw new ApiError(500, "Could not create a booking reference.");
  }).then(async (b) => {
    await audit(user, "booking.create", "booking", b.id, { ref: b.ref, slot: b.slot_start });
    await notifyRole("admin", "New consultation request", `${bookingTypeLabel(b.type)} – ${b.ref}`, "/app/bookings");
    return b;
  });
}

// Slot logic takes a Queryable so it can run inside a booking transaction (a second connection would deadlock PGlite).
const getAvailabilitySettingsTx = (q: Queryable) => getAvailabilitySettings(q);

async function slotsTx(q: Queryable, fromDay: string, toDay: string, now = new Date()): Promise<Slot[]> {
  const s = await getAvailabilitySettingsTx(q);
  const from = new Date(`${fromDay}T00:00:00Z`);
  const to = new Date(`${toDay}T00:00:00Z`);
  const blocked = new Set((await q.query<{ d: string }>("select to_char(day,'YYYY-MM-DD') as d from availability_blocks where day between $1 and $2", [fromDay, toDay])).rows.map((r) => r.d));
  const rangeStart = new Date(+from - s.utcOffsetMinutes * 6e4);
  const rangeEnd = new Date(+to + 864e5 - s.utcOffsetMinutes * 6e4);
  const taken = (await q.query<{ t: Date; c: number }>(
    "select slot_start as t, count(*)::int as c from bookings where slot_start >= $1 and slot_start < $2 and status in ('requested','confirmed','reschedule_requested','cancel_requested') group by slot_start",
    [rangeStart, rangeEnd]
  )).rows;
  const takenMap = new Map(taken.map((t) => [new Date(t.t).toISOString(), t.c]));
  const earliest = +now + s.leadHours * 36e5;
  const out: Slot[] = [];
  for (let d = new Date(from); d <= to; d = new Date(+d + 864e5)) {
    const day = ymd(d);
    if (!s.days.includes(d.getUTCDay())) continue;
    for (let m = toMin(s.start); m + s.slotMinutes <= toMin(s.end); m += s.slotMinutes) {
      if (s.breakStart && s.breakEnd && m < toMin(s.breakEnd) && m + s.slotMinutes > toMin(s.breakStart)) continue;
      const startUtc = new Date(+d + m * 6e4 - s.utcOffsetMinutes * 6e4);
      const iso = startUtc.toISOString();
      let available = true;
      let reason: Slot["reason"];
      if (blocked.has(day)) (available = false), (reason = "blocked");
      else if (+startUtc < earliest) (available = false), (reason = "past");
      else if ((takenMap.get(iso) ?? 0) >= s.capacity) (available = false), (reason = "booked");
      out.push({ start: iso, end: new Date(+startUtc + s.slotMinutes * 6e4).toISOString(), day, label: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, available, reason });
    }
  }
  return out;
}

async function slotIsBookableTx(q: Queryable, startIso: string, ignoreBookingId?: string): Promise<{ ok: boolean; end?: Date; why?: string }> {
  const start = new Date(startIso);
  if (isNaN(+start)) return { ok: false, why: "Invalid time." };
  const s = await getAvailabilitySettingsTx(q);
  const day = ymd(new Date(+start + s.utcOffsetMinutes * 6e4));
  const slot = (await slotsTx(q, day, day)).find((x) => x.start === start.toISOString());
  if (!slot) return { ok: false, why: "That time is outside consultation hours." };
  if (!slot.available) {
    const own = ignoreBookingId && slot.reason === "booked" ? (await q.query("select 1 from bookings where id = $1 and slot_start = $2", [ignoreBookingId, start])).rowCount : 0;
    if (!own) return { ok: false, why: slot.reason === "booked" ? "That slot has just been taken." : slot.reason === "blocked" ? "That day is not available." : "That time is too soon to book." };
  }
  return { ok: true, end: new Date(slot.end) };
}

export type BookingAction =
  | "reschedule_request" | "cancel_request" | "cancel"
  | "confirm" | "decline" | "approve_reschedule" | "decline_reschedule" | "approve_cancel" | "decline_cancel" | "complete" | "assign";

const LIVE = ["requested", "confirmed", "reschedule_requested", "cancel_requested"];

export async function applyBookingAction(
  user: SessionUser,
  id: string,
  action: BookingAction,
  payload: { slotStart?: string; consultantId?: string | null; note?: string }
) {
  const result = await sysTx(async (q) => {
    const row = (await q.query<any>("select * from bookings where id = $1 for update", [id])).rows[0];
    if (!row) throw notFound("Booking not found.");
    const isOwner = row.customer_id === user.id;
    const isStaff = user.role === "admin" || (user.role === "consultant" && row.consultant_id === user.id);
    if (!isOwner && !isStaff) throw notFound("Booking not found."); // do not reveal existence
    const need = (cond: boolean, msg = "That action is not available for this booking.") => {
      if (!cond) throw conflict(msg);
    };
    const customerActions: BookingAction[] = ["reschedule_request", "cancel_request", "cancel"];
    if (customerActions.includes(action) && !isOwner) throw forbidden();
    if (!customerActions.includes(action) && !isStaff) throw forbidden();
    if (action === "assign" && user.role !== "admin") throw forbidden("Only administrators assign consultants.");

    let set: Record<string, unknown> = {};
    switch (action) {
      case "reschedule_request": {
        need(["requested", "confirmed"].includes(row.status));
        if (!payload.slotStart) throw bad("Choose a new time.");
        const ok = await slotIsBookableTx(q, payload.slotStart);
        if (!ok.ok) throw conflict(ok.why ?? "Slot unavailable.");
        set = { status: "reschedule_requested", requested_slot_start: payload.slotStart, status_note: payload.note ?? null };
        break;
      }
      case "cancel_request":
        need(["confirmed", "reschedule_requested"].includes(row.status));
        set = { status: "cancel_requested", status_note: payload.note ?? null };
        break;
      case "cancel":
        need(row.status === "requested" || (isStaff && LIVE.includes(row.status)));
        set = { status: "cancelled", status_note: payload.note ?? null };
        break;
      case "confirm":
        need(row.status === "requested");
        set = { status: "confirmed", status_note: payload.note ?? null, consultant_id: row.consultant_id ?? (user.role === "consultant" ? user.id : null) };
        break;
      case "decline":
        need(row.status === "requested");
        set = { status: "rejected", status_note: payload.note ?? null };
        break;
      case "approve_reschedule": {
        need(row.status === "reschedule_requested" && row.requested_slot_start);
        await q.query("select pg_advisory_xact_lock(hashtext($1))", [new Date(row.requested_slot_start).toISOString()]);
        const ok = await slotIsBookableTx(q, new Date(row.requested_slot_start).toISOString(), id);
        if (!ok.ok) throw conflict(ok.why ?? "That slot is no longer available – ask the customer for another time.");
        set = { status: "confirmed", slot_start: row.requested_slot_start, slot_end: ok.end, requested_slot_start: null, status_note: payload.note ?? null };
        break;
      }
      case "decline_reschedule":
        need(row.status === "reschedule_requested");
        set = { status: "confirmed", requested_slot_start: null, status_note: payload.note ?? "Reschedule declined – original time stands." };
        break;
      case "approve_cancel":
        need(row.status === "cancel_requested");
        set = { status: "cancelled", status_note: payload.note ?? null };
        break;
      case "decline_cancel":
        need(row.status === "cancel_requested");
        set = { status: "confirmed", status_note: payload.note ?? "Cancellation declined." };
        break;
      case "complete":
        need(row.status === "confirmed");
        set = { status: "completed", status_note: payload.note ?? null };
        break;
      case "assign": {
        if (payload.consultantId) {
          const c = await q.query("select 1 from users where id = $1 and role = 'consultant' and is_active", [payload.consultantId]);
          if (!c.rowCount) throw bad("Choose an active consultant.");
        }
        set = { consultant_id: payload.consultantId ?? null };
        break;
      }
    }
    const cols = Object.keys(set);
    const vals = cols.map((c) => set[c]);
    const r = await q.query<any>(
      `update bookings set ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")}, updated_at = now() where id = $1 returning *`,
      [id, ...vals]
    );
    return { before: row, after: r.rows[0] };
  });

  const { before, after } = result;
  await audit(user, `booking.${action}`, "booking", id, { from: before.status, to: after.status, note: payload.note });
  // A consultant attached to a booking must be able to open the linked case, otherwise the consultation
  // is blind. Only fills an empty slot – never overrides an assignment an admin made on the case itself.
  if ((action === "assign" || action === "confirm") && after.assessment_id && after.consultant_id) {
    const up = await sys(
      `update assessments set consultant_id = $2, status = case when status = 'submitted' then 'in_review' else status end, updated_at = now()
        where id = $1 and consultant_id is null returning id`,
      [after.assessment_id, after.consultant_id]
    );
    if (up.rowCount) await audit(user, "assessment.assign_via_booking", "assessment", after.assessment_id, { consultantId: after.consultant_id, booking: after.ref });
  }
  const label = bookingTypeLabel(after.type);
  const customerFacing: Partial<Record<BookingAction, string>> = {
    confirm: `Your consultation (${after.ref}) is confirmed.`,
    decline: `Your consultation request (${after.ref}) could not be accepted.`,
    approve_reschedule: `Your consultation (${after.ref}) was moved to the new time.`,
    decline_reschedule: `Your reschedule request (${after.ref}) was declined – the original time stands.`,
    approve_cancel: `Your consultation (${after.ref}) was cancelled.`,
    decline_cancel: `Your cancellation request (${after.ref}) was declined.`,
    cancel: `Your consultation (${after.ref}) was cancelled.`,
    complete: `Your consultation (${after.ref}) is marked complete. Please share feedback.`,
  };
  if (customerFacing[action] && after.customer_id !== user.id) {
    await notify(after.customer_id, customerFacing[action]!, `${label} – ${new Date(after.slot_start).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`, "/app/bookings");
    if (action === "confirm") {
      const u = await sys<{ email: string; name: string }>("select email, name from users where id = $1", [after.customer_id]);
      if (u.rows[0]) await sendMail({ to: u.rows[0].email, subject: `Consultation confirmed – ${after.ref}`, text: `Hi ${u.rows[0].name},\n\nYour ${label} is confirmed for ${new Date(after.slot_start).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full", timeStyle: "short" })} (IST).\nReference: ${after.ref}\n\nSoundSense` }).catch(() => {});
    }
  }
  if (["reschedule_request", "cancel_request"].includes(action)) {
    await notifyRole("admin", action === "cancel_request" ? "Cancellation requested" : "Reschedule requested", `${after.ref} – ${label}`, "/app/bookings");
    if (after.consultant_id) await notify(after.consultant_id, action === "cancel_request" ? "Cancellation requested" : "Reschedule requested", `${after.ref} – ${label}`, "/app/bookings");
  }
  if (action === "assign" && after.consultant_id) await notify(after.consultant_id, "Consultation assigned to you", `${after.ref} – ${label}`, "/app/bookings");
  return after;
}
