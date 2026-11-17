import { beforeAll, describe, expect, it } from "vitest";
import { newCustomer, signIn, Client } from "./helpers";
import { seed } from "@/lib/seed";
import { sys } from "@/lib/db";
import * as avail from "@/app/api/availability/route";
import * as bookings from "@/app/api/bookings/route";
import * as booking from "@/app/api/bookings/[id]/route";
import * as blocks from "@/app/api/admin/blocks/route";
import * as settings from "@/app/api/admin/settings/route";

let c1: Client, c2: Client, c3: Client, admin: Client;
const contact = (n: string) => ({ name: n, email: `${n.toLowerCase()}@test.local` });
const body = (slotStart: string, n = "Asha") => ({ type: "general", slotStart, description: "Echo in our boardroom during hybrid calls.", contact: contact(n) });

async function freeSlots(c: Client, from?: string) {
  const r = await c.call(avail.GET, { query: from ? { from, to: new Date(+new Date(from) + 13 * 864e5).toISOString().slice(0, 10) } : {} });
  expect(r.status).toBe(200);
  return (r.json.slots as { start: string; day: string; label: string; available: boolean; reason?: string }[]);
}

beforeAll(async () => {
  await seed({ adminEmail: "admin@test.local", adminPassword: "Admin-Pass-12345" });
  c1 = await newCustomer("c1@test.local", undefined, "C One");
  c2 = await newCustomer("c2@test.local", undefined, "C Two");
  c3 = await newCustomer("c3@test.local", undefined, "C Three");
  admin = await signIn("admin@test.local", "Admin-Pass-12345");
});

describe("availability", () => {
  it("returns slots only inside working hours, never during the break, and flags the unavailable ones", async () => {
    const slots = await freeSlots(c1);
    expect(slots.length).toBeGreaterThan(10);
    const labels = new Set(slots.map((s) => s.label));
    expect(labels.has("13:00")).toBe(false); // lunch break
    expect(labels.has("10:00")).toBe(true);
    expect(labels.has("17:00")).toBe(false); // ends at 17:00
    for (const s of slots) {
      const dow = new Date(`${s.day}T00:00:00Z`).getUTCDay();
      expect([0, 6]).not.toContain(dow); // Mon–Fri only
    }
    const lead = slots.filter((s) => +new Date(s.start) < Date.now() + 12 * 3600e3);
    expect(lead.every((s) => !s.available)).toBe(true); // 12 h lead time
  });
  it("requires sign-in", async () => {
    const { client } = await import("./helpers");
    expect((await client().call(avail.GET)).status).toBe(401);
  });
});

describe("booking workflow", () => {
  let slotA = "", slotB = "", ref1 = "", id1 = "";
  it("books an available slot and marks it unavailable for everyone else", async () => {
    const free = (await freeSlots(c1)).filter((s) => s.available);
    slotA = free[0].start;
    slotB = free[1].start;
    const r = await c1.call(bookings.POST, { body: body(slotA, "C1") });
    expect(r.status).toBe(200);
    expect(r.json.booking.status).toBe("requested");
    id1 = r.json.booking.id;
    ref1 = r.json.booking.ref;
    expect(ref1).toMatch(/^BK-\d{4}-\d{6}$/);
    const after = (await freeSlots(c2)).find((s) => s.start === slotA)!;
    expect(after.available).toBe(false);
    expect(after.reason).toBe("booked");
    expect((await c2.call(bookings.POST, { body: body(slotA, "C2") })).status).toBe(409);
  });

  it("two simultaneous requests for the same slot: exactly one wins", async () => {
    const free = (await freeSlots(c2)).filter((s) => s.available);
    const s = free[2].start;
    const [a, b] = await Promise.all([c2.call(bookings.POST, { body: body(s, "C2") }), c3.call(bookings.POST, { body: body(s, "C3") })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const n = (await sys<{ n: number }>("select count(*)::int n from bookings where slot_start = $1 and status in ('requested','confirmed','reschedule_requested','cancel_requested')", [s])).rows[0].n;
    expect(n).toBe(1);
  });

  it("rejects too-short descriptions, past times and times outside the schedule", async () => {
    expect((await c3.call(bookings.POST, { body: { ...body(slotB), description: "short" } })).status).toBe(400);
    expect((await c3.call(bookings.POST, { body: body(new Date(Date.now() - 864e5).toISOString()) })).status).toBe(409);
    const sat = new Date(slotA); sat.setUTCDate(sat.getUTCDate() + ((6 - sat.getUTCDay() + 7) % 7 || 7));
    expect((await c3.call(bookings.POST, { body: body(sat.toISOString()) })).status).toBe(409);
  });

  it("privacy: other customers cannot act on or see my booking; customers cannot confirm", async () => {
    expect((await c2.call(booking.PATCH, { method: "PATCH", params: { id: id1 }, body: { action: "cancel" } })).status).toBe(404);
    expect((await c1.call(booking.PATCH, { method: "PATCH", params: { id: id1 }, body: { action: "confirm" } })).status).toBe(403);
    const mine = await c2.call(bookings.GET);
    expect(mine.json.bookings.find((b: any) => b.id === id1)).toBeUndefined();
  });

  it("admin confirms; customer requests reschedule; admin approves → slot moves and the old one frees", async () => {
    expect((await admin.call(booking.PATCH, { method: "PATCH", params: { id: id1 }, body: { action: "confirm" } })).json.booking.status).toBe("confirmed");
    const rq = await c1.call(booking.PATCH, { method: "PATCH", params: { id: id1 }, body: { action: "reschedule_request", slotStart: slotB, note: "Clash" } });
    expect(rq.json.booking.status).toBe("reschedule_requested");
    const ap = await admin.call(booking.PATCH, { method: "PATCH", params: { id: id1 }, body: { action: "approve_reschedule" } });
    expect(ap.json.booking.status).toBe("confirmed");
    expect(new Date(ap.json.booking.slot_start).toISOString()).toBe(new Date(slotB).toISOString());
    const slots = await freeSlots(c2);
    expect(slots.find((s) => s.start === slotA)!.available).toBe(true);
    expect(slots.find((s) => s.start === slotB)!.available).toBe(false);
  });

  it("a confirmed booking needs staff approval to cancel; approval frees the slot", async () => {
    expect((await c1.call(booking.PATCH, { method: "PATCH", params: { id: id1 }, body: { action: "cancel" } })).status).toBe(409);
    expect((await c1.call(booking.PATCH, { method: "PATCH", params: { id: id1 }, body: { action: "cancel_request" } })).json.booking.status).toBe("cancel_requested");
    expect((await admin.call(booking.PATCH, { method: "PATCH", params: { id: id1 }, body: { action: "approve_cancel" } })).json.booking.status).toBe("cancelled");
    expect((await freeSlots(c2)).find((s) => s.start === slotB)!.available).toBe(true);
    // terminal state: nothing more can happen
    expect((await admin.call(booking.PATCH, { method: "PATCH", params: { id: id1 }, body: { action: "complete" } })).status).toBe(409);
  });

  it("assign: only admins, only active consultants", async () => {
    const free = (await freeSlots(c3)).filter((s) => s.available);
    const b = (await c3.call(bookings.POST, { body: body(free[0].start, "C3") })).json.booking;
    expect((await c3.call(booking.PATCH, { method: "PATCH", params: { id: b.id }, body: { action: "assign", consultantId: null } })).status).toBe(403);
    const bad = await admin.call(booking.PATCH, { method: "PATCH", params: { id: b.id }, body: { action: "assign", consultantId: "00000000-0000-4000-8000-000000000000" } });
    expect(bad.status).toBe(400);
  });
});

describe("admin calendar controls", () => {
  it("a blocked day shows every slot as unavailable (blocked) and can't be booked; unblocking restores it", async () => {
    const free = (await freeSlots(c1)).filter((s) => s.available);
    const day = free.at(-1)!.day;
    expect((await c1.call(blocks.POST, { body: { day } })).status).toBe(403);
    expect((await admin.call(blocks.POST, { body: { day, reason: "Site visit" } })).status).toBe(200);
    const slots = (await freeSlots(c1)).filter((s) => s.day === day);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => !s.available && s.reason === "blocked")).toBe(true);
    expect((await c1.call(bookings.POST, { body: body(slots[0].start, "C1") })).status).toBe(409);
    await admin.call(blocks.DELETE, { method: "DELETE", body: { day } });
    expect((await freeSlots(c1)).filter((s) => s.day === day).some((s) => s.available)).toBe(true);
  });

  it("changing the schedule in settings changes the slots offered", async () => {
    const cur = (await admin.call(settings.GET)).json.availability;
    const upd = await admin.call(settings.PUT, { method: "PUT", body: { availability: { ...cur, start: "11:00", end: "15:00", breakStart: null, breakEnd: null } } });
    expect(upd.status).toBe(200);
    const labels = new Set((await freeSlots(c1)).map((s) => s.label));
    expect(labels.has("10:00")).toBe(false);
    expect(labels.has("14:00")).toBe(true);
    expect((await admin.call(settings.PUT, { method: "PUT", body: { availability: { ...cur, start: "16:00", end: "09:00" } } })).status).toBe(400);
    await admin.call(settings.PUT, { method: "PUT", body: { availability: cur } });
  });
});

describe("DB layer regression", () => {
  it("rowCount reflects rows returned by SELECT", async () => {
    expect((await sys("select 1 where true")).rowCount).toBe(1);
    expect((await sys("select 1 where false")).rowCount).toBe(0);
  });
});
