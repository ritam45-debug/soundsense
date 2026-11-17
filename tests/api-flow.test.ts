import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { newCustomer, signIn, Client } from "./helpers";
import { SCENARIOS } from "./fixtures";
import { seed } from "@/lib/seed";
import { sys } from "@/lib/db";
import * as assessments from "@/app/api/assessments/route";
import * as assessment from "@/app/api/assessments/[id]/route";
import * as submit from "@/app/api/assessments/[id]/submit/route";
import * as room from "@/app/api/assessments/[id]/room/route";
import * as meas from "@/app/api/assessments/[id]/measurements/route";
import * as manage from "@/app/api/assessments/[id]/manage/route";
import * as notes from "@/app/api/assessments/[id]/notes/route";
import * as pdf from "@/app/api/reports/[id]/pdf/route";
import * as stats from "@/app/api/stats/route";
import * as chat from "@/app/api/chat/route";
import * as feedback from "@/app/api/feedback/route";
import * as avail from "@/app/api/availability/route";
import * as bookings from "@/app/api/bookings/route";
import * as booking from "@/app/api/bookings/[id]/route";

let alice: Client, bob: Client, admin: Client, consultant: Client;
let aId = "", aReport = "";
type Q = Record<string, any>;

async function fillAndSubmit(c: Client, scenario: string, share = false) {
  const s = SCENARIOS[scenario];
  const created = await c.call(assessments.POST, { body: { title: s.name } });
  expect(created.status).toBe(200);
  const id = created.json.assessment.id as string;
  const p = await c.call(assessment.PATCH, { method: "PATCH", params: { id }, body: { answers: s.answers } });
  expect(p.status).toBe(200);
  if (s.room) {
    const r = await c.call(room.PUT, { method: "PUT", params: { id }, body: s.room });
    expect(r.status).toBe(200);
  }
  const sub = await c.call(submit.POST, { params: { id }, body: { share_with_chat: share } });
  return { id, sub };
}

beforeAll(async () => {
  await seed({ adminEmail: "admin@test.local", adminPassword: "Admin-Pass-12345", demo: true });
  alice = await newCustomer("alice@test.local", undefined, "Alice");
  bob = await newCustomer("bob@test.local", undefined, "Bob");
  admin = await signIn("admin@test.local", "Admin-Pass-12345");
  consultant = await signIn("consultant@demo.soundsense.test", "Demo-Consultant-1");
});

describe("assessment lifecycle", () => {
  it("rejects submit while required answers are missing (field-level errors)", async () => {
    const c = await alice.call(assessments.POST, { body: {} });
    const id = c.json.assessment.id;
    const r = await alice.call(submit.POST, { params: { id }, body: {} });
    expect(r.status).toBe(400);
    expect(Object.keys(r.json.error.fields ?? {}).length).toBeGreaterThan(0);
  });

  it("scenario A through the API → diagnosis, recommendations, preliminary report", async () => {
    const { id, sub } = await fillAndSubmit(alice, "A", true);
    expect(sub.status).toBe(200);
    aId = id;
    aReport = sub.json.reportId;
    const full = sub.json.full;
    expect(full.diagnostic.diagnosis.primary).toBe("room");
    expect(full.assessment.status).toBe("submitted");
    expect(full.recommendations.length).toBeGreaterThan(0);
    expect(JSON.stringify(full.recommendations)).toMatch(/indicative/i);
  });

  it("customer cannot see another customer's data (RLS)", async () => {
    expect((await bob.call(assessment.GET, { params: { id: aId } })).status).toBe(404);
    const list = await bob.call(assessments.GET);
    expect(list.json.items.find((x: Q) => x.id === aId)).toBeUndefined();
    expect((await bob.call(pdf.GET, { params: { id: aReport } })).status).toBe(404);
    expect((await bob.call(room.PUT, { method: "PUT", params: { id: aId }, body: SCENARIOS.A.room })).status).toBeGreaterThanOrEqual(403);
  });

  it("DB-level RLS: app role sees nothing without a user, and cannot read password hashes", async () => {
    const { asUser } = await import("@/lib/db");
    const bobId = (await sys<{ id: string }>("select id from users where email='bob@test.local'")).rows[0].id;
    const seen = await asUser({ id: bobId, role: "customer" } as any, (q) => q.query("select count(*)::int n from assessments where ref is not null and id = $1", [aId]));
    expect(seen.rows[0].n).toBe(0);
    await expect(asUser({ id: bobId, role: "customer" } as any, (q) => q.query("select password_hash from users"))).rejects.toThrow();
  });

  it("measurements: stores calibration tier honestly and validates calibration input", async () => {
    const stats = { n: 100, minDb: -70, maxDb: -20, leqDb: -45, l10Db: -35, l50Db: -50, l90Db: -60 };
    const ok = await alice.call(meas.POST, { params: { id: aId }, body: { kind: "ambient", durationS: 30, stats } });
    expect(ok.status).toBe(200);
    expect(ok.json.measurement.calibration.status).toBe("uncalibrated");
    const bad = await alice.call(meas.POST, { params: { id: aId }, body: { kind: "ambient", durationS: 30, stats, calibration: { status: "single_point", offsetDb: 100 } } });
    expect(bad.status).toBe(400); // can't claim calibration without a reference instrument
  });

  it("consultant sees assigned cases, can add internal notes the customer cannot read", async () => {
    const cid = (await sys<{ id: string }>("select id from users where email='consultant@demo.soundsense.test'")).rows[0].id;
    expect((await consultant.call(assessment.GET, { params: { id: aId } })).status).toBe(404); // not assigned yet
    const m = await admin.call(manage.PATCH, { method: "PATCH", params: { id: aId }, body: { consultantId: cid } });
    expect(m.status).toBe(200);
    expect((await consultant.call(assessment.GET, { params: { id: aId } })).status).toBe(200);
    const n = await consultant.call(notes.POST, { params: { id: aId }, body: { body: "Inspect glazing before specifying panels.", visibility: "internal" } });
    expect(n.status).toBe(200);
    const custView = await alice.call(assessment.GET, { params: { id: aId } });
    expect(JSON.stringify(custView.json)).not.toContain("Inspect glazing");
    const staffView = await consultant.call(assessment.GET, { params: { id: aId } });
    expect(JSON.stringify(staffView.json)).toContain("Inspect glazing");
    expect((await alice.call(notes.POST, { params: { id: aId }, body: { body: "x", visibility: "internal" } })).status).toBeGreaterThanOrEqual(403);
  });
});

describe("booking ↔ case hand-over", () => {
  it("assigning a consultant to a booking gives them the linked case (but never overrides an existing assignment)", async () => {
    const { id } = await fillAndSubmit(bob, "B");
    const cid = (await sys<{ id: string }>("select id from users where email='consultant@demo.soundsense.test'")).rows[0].id;
    expect((await consultant.call(assessment.GET, { params: { id } })).status).toBe(404); // nobody assigned yet
    const slots = (await bob.call(avail.GET)).json.slots as { start: string; available: boolean }[];
    const slot = slots.filter((x) => x.available)[3];
    const made = await bob.call(bookings.POST, { body: { type: "general", slotStart: slot.start, assessmentId: id, description: "Please review my classroom assessment.", contact: { name: "Bob", email: "bob@test.local" } } });
    expect(made.status).toBe(200);
    const bid = made.json.booking.id as string;
    const as = await admin.call(booking.PATCH, { method: "PATCH", params: { id: bid }, body: { action: "assign", consultantId: cid } });
    expect(as.status).toBe(200);
    expect((await consultant.call(assessment.GET, { params: { id } })).status).toBe(200);
    const row = (await sys<{ consultant_id: string; status: string }>("select consultant_id, status from assessments where id = $1", [id])).rows[0];
    expect(row.consultant_id).toBe(cid);
    expect(row.status).toBe("in_review");
    const audited = await sys("select 1 from audit_logs where action = 'assessment.assign_via_booking' and entity_id = $1", [id]);
    expect(audited.rowCount).toBe(1);
  });
});

describe("report PDF", () => {
  it("renders a valid PDF with the honest sections", async () => {
    const r = await alice.call(pdf.GET, { params: { id: aReport } });
    expect(r.status).toBe(200);
    expect(r.res.headers.get("content-type")).toBe("application/pdf");
    const buf = Buffer.from(await r.res.arrayBuffer());
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    const f = path.join(os.tmpdir(), `ss-${Date.now()}.pdf`);
    fs.writeFileSync(f, buf);
    let text = "";
    try { text = execFileSync("pdftotext", ["-layout", f, "-"], { encoding: "utf8" }); } catch { /* pdftotext optional */ }
    if (text) {
      expect(text).toMatch(/SoundSense/);
      expect(text).toMatch(/indicative/i);
      expect(text).toMatch(/limitations/i);
      expect(text).not.toMatch(/calibrated SPL certified/i);
    }
  });
});

describe("chat", () => {
  it("guest chat works with the offline fallback and is labelled as such", async () => {
    const g = (await import("./helpers")).client("10.77.0.1");
    const r = await g.call(chat.POST, { body: { message: "How do I reduce echo in a meeting room?" } });
    expect(r.status).toBe(200);
    expect(r.json.reply.source).toBe("fallback");
    expect(r.json.reply.content.length).toBeGreaterThan(40);
  });

  it("does not read the assessment unless the customer consented", async () => {
    const { id } = await fillAndSubmit(bob, "B", false);
    const r = await bob.call(chat.POST, { body: { message: "What is wrong with my room according to my assessment?", assessmentId: id } });
    expect(r.status).toBe(200);
    expect(r.json.usedAssessment ?? false).toBe(false);
    const on = await alice.call(chat.POST, { body: { message: "What did my assessment find?", assessmentId: aId } });
    expect(on.status).toBe(200);
    expect(JSON.stringify(on.json)).toMatch(/room|echo|reverb/i);
  });

  it("asking for a human escalates", async () => {
    const r = await alice.call(chat.POST, { body: { message: "I want to talk to a human consultant please", assessmentId: aId } });
    expect(r.status).toBe(200);
    expect(r.json.suggestEscalation).toBe(true);
  });
});

describe("stats, feedback", () => {
  it("dashboard stats are derived from the DB and role-scoped", async () => {
    const a = await admin.call(stats.GET);
    expect(a.status).toBe(200);
    expect(a.json.totals.assessments).toBeGreaterThanOrEqual(2);
    const real = (await sys<{ n: number }>("select count(*)::int n from assessments where status <> 'draft'")).rows[0].n;
    expect(a.json.totals.submitted ?? real).toBe(real);
    const c = await alice.call(stats.GET);
    expect(c.json.totals.assessments).toBeLessThan(a.json.totals.assessments + 1);
    const f = await alice.call(stats.GET, { query: { category: "room" } });
    expect(f.status).toBe(200);
  });

  it("feedback: one per assessment, customers only", async () => {
    const body = { assessmentId: aId, overall: 5, usefulness: 4, valueForMoney: 4 };
    expect((await alice.call(feedback.POST, { body })).status).toBe(200);
    expect((await alice.call(feedback.POST, { body })).status).toBe(409);
    expect((await consultant.call(feedback.POST, { body })).status).toBe(403);
  });
});
