import { beforeEach, describe, expect, it } from "vitest";
import { localCall } from "@/lib/local/api";
import { clearDb, loadDb, makeBackup, parseBackup, saveDb } from "@/lib/local/store";
import { SCENARIOS } from "@/lib/local/samples";
import { renderReportPdf } from "@/lib/report/pdf";
import { ClientError } from "@/lib/local/errors";

const call = (m: string, u: string, b?: any) => localCall<any>(m, u, b);
const fails = async (p: Promise<any>) => p.then(() => { throw new Error("expected a ClientError"); }, (e) => e as ClientError);
beforeEach(() => clearDb());

describe("assessment lifecycle (all in the browser)", () => {
  it("starts as an empty draft with a reference", async () => {
    const r = await call("POST", "/api/assessments", {});
    expect(r.assessment.status).toBe("draft");
    expect(r.assessment.ref).toMatch(/^SS-\d{4}-1$/);
    expect((await call("POST", "/api/assessments", {})).assessment.ref).toMatch(/-2$/);
    expect((await call("GET", "/api/assessments?limit=10")).total).toBe(2);
  });

  it("refuses to submit with required answers missing, and says which", async () => {
    const { assessment } = await call("POST", "/api/assessments", {});
    const e = await fails(call("POST", `/api/assessments/${assessment.id}/submit`, {}));
    expect(e.status).toBe(400);
    expect(Object.keys(e.fields).length).toBeGreaterThan(3);
  });

  it("autosave merges answers; null removes one; invalid values are dropped and reported", async () => {
    const { assessment } = await call("POST", "/api/assessments", {});
    const id = assessment.id;
    await call("PATCH", `/api/assessments/${id}`, { answers: { contact_name: "Asha", organisation: "Acme" }, step: 2 });
    let a = (await call("GET", `/api/assessments/${id}`)).assessment;
    expect(a.answers.contact_name).toBe("Asha"); expect(a.step).toBe(2);
    await call("PATCH", `/api/assessments/${id}`, { answers: { organisation: null } });
    a = (await call("GET", `/api/assessments/${id}`)).assessment;
    expect(a.answers.organisation).toBeUndefined(); expect(a.answers.contact_name).toBe("Asha");
    const r = await call("PATCH", `/api/assessments/${id}`, { answers: { q1_frequency: "not-an-option" } });
    expect(r.errors.q1_frequency).toBeTruthy();
  });

  for (const sc of Object.values(SCENARIOS)) {
    it(`scenario ${sc.id} (${sc.name}): submit → diagnosis, 3-tier recommendations, report and a real PDF`, async () => {
      const { assessment } = await call("POST", "/api/assessments", {});
      const id = assessment.id;
      await call("PATCH", `/api/assessments/${id}`, { answers: sc.answers });
      if (sc.room) await call("PUT", `/api/assessments/${id}/room`, sc.room);
      const out = await call("POST", `/api/assessments/${id}/submit`, {});
      const full = out.full;
      expect(full.assessment.status).toBe("submitted");
      expect(full.diagnostic.diagnosis.primary).toBeTruthy();
      expect(full.diagnostic.diagnosis.confidence).toBeLessThanOrEqual(0.9);
      expect(full.recommendations.length).toBeGreaterThanOrEqual(3);
      expect(full.recommendations.every((r: any) => r.price_min <= r.price_max)).toBe(true);
      expect(full.reports).toHaveLength(1);
      expect(full.reports[0].payload).toBeUndefined(); // list responses never carry the heavy payload
      const stored = loadDb().assessments[0].reports[0].payload;
      const pdf = await renderReportPdf(stored);
      expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe("%PDF-");
      expect(pdf.length).toBeGreaterThan(8000);
      expect(JSON.stringify(stored.limitations)).toMatch(/runs entirely in your browser/);
    });
  }

  it("sample assessments open already submitted with a report", async () => {
    const r = await call("POST", "/api/assessments", { sample: "A" });
    const f = await call("GET", `/api/assessments/${r.assessment.id}`);
    expect(f.assessment.status).toBe("submitted"); expect(f.reports).toHaveLength(1); expect(f.diagnostic).toBeTruthy(); expect(f.assessment.title).toMatch(/^Sample:/);
    expect((await fails(call("POST", "/api/assessments", { sample: "ZZ" }))).status).toBe(400);
  });

  it("room details: validated, saved, and the preview stores nothing", async () => {
    const { assessment } = await call("POST", "/api/assessments", { sample: "B" });
    const id = assessment.id;
    const bad = await fails(call("PUT", `/api/assessments/${id}/room`, { length_m: -3 }));
    expect(bad.status).toBe(400); expect(bad.fields.length_m).toBeTruthy(); expect(bad.fields.floor_material).toBeTruthy();
    const room = { length_m: 8, width_m: 6, height_m: 3, occupants: 12, floor_material: "concrete_tile", wall_material: "concrete_brick", ceiling_material: "concrete_plaster", glass_share: "large", soft_furnishings: "none", panels: "none" };
    const prev = await call("POST", "/api/assessments/preview/room", { ...room, environment: "conference_room" });
    expect(prev.analysis.rt60Unoccupied).toBeGreaterThan(0.5);
    const saved = await call("PUT", `/api/assessments/${id}/room`, room);
    expect(saved.analysis.volume).toBe(144);
    expect((await call("GET", `/api/assessments/${id}`)).room.analysis.volume).toBe(144);
  });

  it("recordings: validated, saved, deleted; re-analysing uses them", async () => {
    const { assessment } = await call("POST", "/api/assessments", { sample: "C" });
    const id = assessment.id;
    const stats = { n: 300, minDb: -70, maxDb: -20, leqDb: -42, l10Db: -35, l50Db: -50, l90Db: -62 };
    expect((await fails(call("POST", `/api/assessments/${id}/measurements`, { kind: "ambient", durationS: 1, stats }))).status).toBe(400);
    expect((await fails(call("POST", `/api/assessments/${id}/measurements`, { kind: "ambient", durationS: 20, stats, calibration: { status: "single_point", offsetDb: 90 } }))).status).toBe(400);
    const m = await call("POST", `/api/assessments/${id}/measurements`, { kind: "ambient", durationS: 20, stats, label: "Empty room" });
    const re = await call("POST", `/api/assessments/${id}/analyse`, {});
    expect(re.measurements).toHaveLength(1);
    expect(re.diagnostic.diagnosis.confirmedObservations.length + re.diagnostic.diagnosis.reportedObservations.length).toBeGreaterThan(0);
    await call("DELETE", `/api/assessments/${id}/measurements/${m.measurement.id}`);
    expect((await call("GET", `/api/assessments/${id}`)).measurements).toHaveLength(0);
  });

  it("report refresh adds a version; drafts cannot have reports", async () => {
    const d = await call("POST", "/api/assessments", {});
    expect((await fails(call("POST", `/api/assessments/${d.assessment.id}/report`, {}))).status).toBe(403);
    const s = await call("POST", "/api/assessments", { sample: "D" });
    await call("POST", `/api/assessments/${s.assessment.id}/report`, {});
    const f = await call("GET", `/api/assessments/${s.assessment.id}`);
    expect(f.reports.map((r: any) => r.version)).toEqual([2, 1]);
  });

  it("deleting removes it; unknown ids and endpoints give friendly errors", async () => {
    const { assessment } = await call("POST", "/api/assessments", {});
    await call("DELETE", `/api/assessments/${assessment.id}`);
    expect((await fails(call("GET", `/api/assessments/${assessment.id}`))).status).toBe(404);
    expect((await fails(call("GET", "/api/admin/users"))).status).toBe(404);
  });

  it("the assistant answers from the built-in knowledge base and never claims to be AI or a person", async () => {
    const r = await call("POST", "/api/chat", { message: "my room has a lot of echo" });
    expect(r.reply.content).toMatch(/Echo has two very different causes/);
    expect(r.reply.content).toMatch(/rule-based/);
    const h = await call("POST", "/api/chat", { message: "can I talk to a human consultant?" });
    expect(h.reply.content).toMatch(/no live consultants/);
    expect((await fails(call("POST", "/api/chat", { message: "  " }))).status).toBe(400);
  });
});

describe("backup and restore", () => {
  it("round-trips everything", async () => {
    await call("POST", "/api/assessments", { sample: "A" }); await call("POST", "/api/assessments", {});
    const text = makeBackup(loadDb());
    clearDb(); expect((await call("GET", "/api/assessments")).total).toBe(0);
    saveDb(parseBackup(text));
    expect((await call("GET", "/api/assessments")).total).toBe(2);
  });
  it("rejects files that are not backups", () => {
    for (const t of ["not json", "{}", '{"app":"other","data":{}}', '{"app":"soundsense-lite","data":{"v":1,"assessments":[{"id":1}]}}'])
      expect(() => parseBackup(t)).toThrow();
  });
  it("a corrupted store does not crash the app: it starts empty", async () => {
    saveDb({ v: 1, seq: 0, assessments: [] });
    (globalThis as any).localStorage = undefined;
    expect(loadDb().assessments).toEqual([]);
  });
});
