/**
 * A tiny in-browser stand-in for the SoundSense server. The UI calls the same URLs as the full platform
 * (call("/api/assessments/…")); here they are answered from localStorage with the SAME engines.
 */
import { analyseRoom, FLOOR_MATERIALS, WALL_MATERIALS, CEILING_MATERIALS, RoomInput } from "../acoustics/room";
import { validateAnswers } from "../acoustics/questionnaire";
import { summarise } from "../acoustics/summary";
import { CATEGORY_LABEL, DiagnosisCategory } from "../acoustics/types";
import { ClientError } from "./errors";
import { addReport, roomOf, runAnalysis } from "./engine";
import { fallbackReply, ChatContext } from "./chat";
import { SCENARIOS } from "./samples";
import { LocalAssessment, LocalDb, loadDb, newId, saveDb } from "./store";

export const LOCAL_USER = {
  id: "local", email: "", name: "You", phone: null, role: "customer" as const, email_verified_at: "2026-01-01T00:00:00Z",
  organisation: null, city: null, designation: null, location: null, marketing_opt_in: null, specialisation: null, bio: null,
};

const bad = (msg: string, fields: Record<string, string> = {}) => new ClientError(400, msg, fields, "invalid");
const notFound = () => new ClientError(404, "We couldn't find that assessment. It may have been deleted, or it was created in a different browser.");
const now = () => new Date().toISOString();

function find(db: LocalDb, id: string): LocalAssessment {
  const a = db.assessments.find((x) => x.id === id);
  if (!a) throw notFound();
  return a;
}
const row = (a: LocalAssessment) => ({
  id: a.id, ref: a.ref, title: a.title, status: a.status, step: a.step, answers: a.answers, environment_type: a.environment_type, summary: a.summary,
  share_with_chat: a.share_with_chat, created_at: a.created_at, updated_at: a.updated_at, submitted_at: a.submitted_at, customer_id: "local", consultant_id: null,
});
const roomRow = (a: LocalAssessment) => (a.room ? { ...a.room, analysis: a.room.computed } : null);

function full(a: LocalAssessment) {
  const d = a.diagnostic;
  return {
    assessment: row(a),
    room: roomRow(a),
    measurements: a.measurements,
    diagnostic: d ? { id: d.id, createdAt: d.createdAt, diagnosis: d.diagnosis, plan: d.plan, room: d.room } : null,
    recommendations: a.recommendations,
    reports: a.reports.map(({ payload, ...r }) => r),
    notes: [], documents: [], bookings: [],
    customer: { id: "local", name: a.answers.contact_name ?? "You", email: a.answers.contact_email ?? "", phone: a.answers.contact_phone ?? null },
    consultant: null,
  };
}

const isNum = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const oneOf = (list: { value: string }[], v: unknown) => typeof v === "string" && list.some((m) => m.value === v);

function parseRoom(b: any): RoomInput {
  const f: Record<string, string> = {};
  if (!isNum(b?.length_m, 0.5, 200)) f.length_m = "Enter a length between 0.5 and 200 m.";
  if (!isNum(b?.width_m, 0.5, 200)) f.width_m = "Enter a width between 0.5 and 200 m.";
  if (!isNum(b?.height_m, 1.5, 40)) f.height_m = "Enter a height between 1.5 and 40 m.";
  if (!isNum(b?.occupants, 0, 5000) || !Number.isInteger(b?.occupants)) f.occupants = "Enter a whole number of people (0–5000).";
  if (!oneOf(FLOOR_MATERIALS, b?.floor_material)) f.floor_material = "Choose a floor material.";
  if (!oneOf(WALL_MATERIALS, b?.wall_material)) f.wall_material = "Choose a wall material.";
  if (!oneOf(CEILING_MATERIALS, b?.ceiling_material)) f.ceiling_material = "Choose a ceiling material.";
  if (!["none", "some", "large"].includes(b?.glass_share)) f.glass_share = "Choose how much glass there is.";
  if (!["none", "some", "lots"].includes(b?.soft_furnishings)) f.soft_furnishings = "Choose how many soft furnishings.";
  if (!["none", "some", "extensive"].includes(b?.panels)) f.panels = "Choose how many acoustic panels.";
  if (Object.keys(f).length) throw bad("Please check the room details.", f);
  const { length_m, width_m, height_m, occupants, floor_material, wall_material, ceiling_material, glass_share, soft_furnishings, panels } = b;
  return { length_m, width_m, height_m, occupants, floor_material, wall_material, ceiling_material, glass_share, soft_furnishings, panels };
}

function parseMeasurement(b: any) {
  if (!["ambient", "speech", "other"].includes(b?.kind)) throw bad("Unknown recording type.");
  if (!isNum(b?.durationS, 2, 3600)) throw bad("A recording needs to be at least 2 seconds long.");
  const s = b?.stats;
  if (!s || !["minDb", "maxDb", "leqDb", "l10Db", "l50Db", "l90Db"].every((k) => isNum(s[k], -120, 10)) || !isNum(s.n, 1, 100000)) throw bad("The recording statistics are not valid.");
  const c = b.calibration ?? { status: "uncalibrated" };
  if (c.status === "single_point" && !(isNum(c.offsetDb, -200, 200) && typeof c.referenceInstrument === "string" && c.referenceInstrument.trim())) throw bad("Calibration needs the reference reading and the instrument used.");
  if (!["uncalibrated", "single_point"].includes(c.status)) throw bad("Unknown calibration status.");
  return {
    id: newId(), kind: b.kind, label: typeof b.label === "string" ? b.label.slice(0, 120) : null,
    started_at: typeof b.startedAt === "string" && !Number.isNaN(Date.parse(b.startedAt)) ? b.startedAt : now(),
    duration_s: b.durationS, stats: s, samples: Array.isArray(b.samples) ? b.samples.slice(0, 400) : null, calibration: c,
    device_note: typeof b.deviceNote === "string" ? b.deviceNote.slice(0, 200) : null, notes: typeof b.notes === "string" ? b.notes.slice(0, 1000) : null,
  };
}

function create(db: LocalDb, body: any): LocalAssessment {
  db.seq += 1;
  const t = now();
  const a: LocalAssessment = {
    id: newId(), ref: `SS-${new Date().getFullYear()}-${db.seq}`, title: null, status: "draft", step: 0, answers: {}, environment_type: null, summary: null, share_with_chat: false,
    created_at: t, updated_at: t, submitted_at: null, room: null, measurements: [], diagnostic: null, recommendations: [], reports: [],
  };
  if (typeof body?.title === "string" && body.title.trim()) a.title = body.title.trim().slice(0, 150);
  if (body?.sample) {
    const sc = SCENARIOS[body.sample];
    if (!sc) throw bad("Unknown sample.");
    a.answers = { ...sc.answers };
    a.environment_type = sc.answers.environment ?? null;
    a.title = `Sample: ${sc.name}`;
    if (sc.room) a.room = { ...sc.room, computed: analyseRoom(sc.room, sc.answers.environment ?? "other") } as any;
    runAnalysis(a);
    addReport(a, "preliminary");
    a.status = "submitted"; a.submitted_at = t; a.step = 99;
  }
  db.assessments.unshift(a);
  return a;
}

export async function localCall<T = any>(method: string, url: string, body?: any): Promise<T> {
  const u = new URL(url, "http://local");
  const path = u.pathname.replace(/\/+$/, "");
  const m = (re: RegExp) => path.match(re);
  const db = loadDb();
  const write = <R,>(r: R): R => { saveDb(db); return r; };
  let g: RegExpMatchArray | null;

  if (path === "/api/me" && method === "GET") return { user: LOCAL_USER } as T;

  if (path === "/api/assessments") {
    if (method === "GET") {
      const status = u.searchParams.get("status"); const limit = Math.min(100, Number(u.searchParams.get("limit") ?? 25));
      const items = db.assessments.filter((a) => !status || a.status === status).slice(0, limit).map((a) => ({
        id: a.id, ref: a.ref, title: a.title, status: a.status, step: a.step, environment_type: a.environment_type, created_at: a.created_at, updated_at: a.updated_at,
        headline: a.summary?.headline ?? null, organisation: a.answers.organisation ?? null, customer_name: a.answers.contact_name ?? "You", consultant_name: null, consultant_id: null,
        primary_category: a.diagnostic?.diagnosis.primary ?? null, confidence_level: a.diagnostic?.diagnosis.confidenceLevel ?? null, expert_inspection: a.diagnostic?.diagnosis.expertInspection?.needed ?? null,
      }));
      return { total: db.assessments.length, items } as T;
    }
    if (method === "POST") { const a = create(db, body); return write({ assessment: row(a) }) as T; }
  }

  if ((g = m(/^\/api\/assessments\/([^/]+)$/))) {
    if (g[1] === "preview") throw notFound();
    const a = find(db, g[1]);
    if (method === "GET") return full(a) as T;
    if (method === "PATCH") {
      let errors: Record<string, string> = {};
      if (body?.answers) {
        const merged: Record<string, any> = { ...a.answers };
        for (const [k, v] of Object.entries(body.answers)) { if (v === null) delete merged[k]; else merged[k] = v; }
        const r = validateAnswers(merged, false);
        errors = r.errors; a.answers = r.clean; a.environment_type = r.clean.environment ?? null;
      }
      if (typeof body?.step === "number") a.step = body.step;
      if (typeof body?.title === "string") a.title = body.title.trim().slice(0, 150) || null;
      a.updated_at = now();
      return write({ assessment: row(a), errors }) as T;
    }
    if (method === "DELETE") { db.assessments = db.assessments.filter((x) => x.id !== a.id); return write({ ok: true }) as T; }
  }

  if ((g = m(/^\/api\/assessments\/([^/]+)\/submit$/)) && method === "POST") {
    const a = find(db, g[1]);
    const r = validateAnswers(a.answers, true);
    if (Object.keys(r.errors).length) throw bad("Some required questions still need an answer.", r.errors);
    a.answers = r.clean; a.environment_type = r.clean.environment ?? null;
    if (a.status === "draft") a.status = "submitted";
    a.submitted_at = a.submitted_at ?? now(); a.step = 99; a.updated_at = now();
    runAnalysis(a); addReport(a, "preliminary");
    return write({ reportId: a.reports[0].id, full: full(a) }) as T;
  }

  if ((g = m(/^\/api\/assessments\/([^/]+)\/room$/))) {
    if (g[1] === "preview" && method === "POST") {
      const { environment, ...rest } = body ?? {};
      return { analysis: analyseRoom(parseRoom(rest), typeof environment === "string" ? environment : "other") } as T;
    }
    const a = find(db, g[1]);
    if (method === "PUT" || method === "POST") {
      const input = parseRoom(method === "PUT" ? body : (({ environment, ...r }) => r)(body ?? {}));
      const env = (method === "POST" && typeof body?.environment === "string" ? body.environment : a.answers.environment) ?? "other";
      const analysis = analyseRoom(input, env);
      if (method === "POST") return { analysis } as T;
      a.room = { ...input, computed: analysis } as any; a.updated_at = now();
      return write({ analysis }) as T;
    }
  }

  if ((g = m(/^\/api\/assessments\/([^/]+)\/measurements$/)) && method === "POST") {
    const a = find(db, g[1]); const ms = parseMeasurement(body);
    a.measurements.push(ms); a.updated_at = now();
    return write({ measurement: ms }) as T;
  }
  if ((g = m(/^\/api\/assessments\/([^/]+)\/measurements\/([^/]+)$/)) && method === "DELETE") {
    const a = find(db, g[1]); a.measurements = a.measurements.filter((x) => x.id !== g![2]); a.updated_at = now();
    return write({ ok: true }) as T;
  }

  if ((g = m(/^\/api\/assessments\/([^/]+)\/analyse$/)) && method === "POST") {
    const a = find(db, g[1]); runAnalysis(a); a.updated_at = now();
    return write(full(a)) as T;
  }

  if ((g = m(/^\/api\/assessments\/([^/]+)\/report$/)) && method === "POST") {
    const a = find(db, g[1]);
    if (a.status === "draft") throw new ClientError(403, "Submit the assessment first.");
    runAnalysis(a); const r = addReport(a, "preliminary"); a.updated_at = now();
    return write({ report: { id: r.id, version: r.version, status: r.status } }) as T;
  }

  if (path === "/api/chat" && method === "POST") {
    const msg = String(body?.message ?? "").slice(0, 2000);
    if (!msg.trim()) throw bad("Type a question first.");
    let ctx: ChatContext | null = null;
    const a = body?.assessmentId ? db.assessments.find((x) => x.id === body.assessmentId) : null;
    if (a?.diagnostic) ctx = { ref: a.ref, diagnosis: CATEGORY_LABEL[a.diagnostic.diagnosis.primary as DiagnosisCategory], confidence: a.diagnostic.diagnosis.confidenceLevel, nextSteps: a.diagnostic.diagnosis.freeFirstSteps?.slice(0, 3) };
    const r = fallbackReply(msg, ctx);
    return { conversationId: null, reply: { content: r.text, source: r.source }, suggestEscalation: false } as T;
  }

  void summarise; void roomOf;
  throw new ClientError(404, "That feature is not part of SoundSense Lite.");
}
