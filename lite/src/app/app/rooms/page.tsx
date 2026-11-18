"use client";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { AlertCard, BasisBadge, HealthCard, H2, SeverityBadge, Sparkline } from "@/components/ws";
import { Badge, Confirm, Empty, Field, Modal, Notice, PageHeader, useToast } from "@/components/ui";
import { ENVIRONMENTS } from "@/lib/acoustics/questionnaire";
import { computeHealth, configFor, scoreBand } from "@/lib/acoustics/health";
import { detectIssues, LEVEL_LABEL, needsProfessional, planMitigation } from "@/lib/acoustics/mitigation";
import { useWorkspace } from "@/lib/workspace/useWorkspace";
import { useAssessments } from "@/lib/workspace/useAssessments";
import { healthInputFor } from "@/lib/workspace/derive";
import { acknowledge, escalationMessage, openAlerts, resolveAlert } from "@/lib/workspace/ops";
import { addRoom, audit, removeRoom, type Room } from "@/lib/workspace/store";
import { newId } from "@/lib/local/store";

function RoomForm({ initial, assessments, onSave, onClose }: { initial?: Room; assessments: any[]; onSave: (r: Partial<Room> & { name: string }) => void; onClose: () => void }) {
  const [f, setF] = useState<any>({ name: "", building: "", floor: "", department: "", roomType: "conference_room", lengthM: "", widthM: "", heightM: "", occupants: "", assessmentId: "", notes: "", ...(initial ?? {}) });
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const num = (v: any) => (v === "" || v === undefined || v === null ? undefined : Number(v));
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!f.name.trim()) return; onSave({ ...f, name: f.name, lengthM: num(f.lengthM), widthM: num(f.widthM), heightM: num(f.heightM), occupants: num(f.occupants), assessmentId: f.assessmentId || null }); }} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label="Room name" htmlFor="rn"><input id="rn" className="input" required maxLength={80} value={f.name} onChange={(e) => set("name", e.target.value)} /></Field></div>
      <Field label="Building" htmlFor="rb"><input id="rb" className="input" value={f.building} onChange={(e) => set("building", e.target.value)} /></Field>
      <Field label="Floor" htmlFor="rf"><input id="rf" className="input" value={f.floor} onChange={(e) => set("floor", e.target.value)} /></Field>
      <Field label="Department" htmlFor="rd"><input id="rd" className="input" value={f.department} onChange={(e) => set("department", e.target.value)} /></Field>
      <Field label="Room type" htmlFor="rt"><select id="rt" className="input" value={f.roomType} onChange={(e) => set("roomType", e.target.value)}>{ENVIRONMENTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
      <Field label="Length (m)" htmlFor="rl"><input id="rl" inputMode="decimal" className="input" value={f.lengthM ?? ""} onChange={(e) => set("lengthM", e.target.value)} /></Field>
      <Field label="Width (m)" htmlFor="rw"><input id="rw" inputMode="decimal" className="input" value={f.widthM ?? ""} onChange={(e) => set("widthM", e.target.value)} /></Field>
      <Field label="Typical occupants" htmlFor="ro"><input id="ro" inputMode="numeric" className="input" value={f.occupants ?? ""} onChange={(e) => set("occupants", e.target.value)} /></Field>
      <Field label="Linked assessment" htmlFor="ra" hint="Its answers, recordings and room calculation feed this room's health score."><select id="ra" className="input" value={f.assessmentId ?? ""} onChange={(e) => set("assessmentId", e.target.value)}><option value="">None</option>{assessments.map((a) => <option key={a.id} value={a.id}>{a.ref} – {a.title || "Untitled"}</option>)}</select></Field>
      <div className="sm:col-span-2"><Field label="Notes" htmlFor="rno"><textarea id="rno" className="input min-h-[80px] py-2" value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field></div>
      <div className="flex gap-2 sm:col-span-2"><button className="btn-primary" type="submit">Save room</button><button className="btn-secondary" type="button" onClick={onClose}>Cancel</button></div>
    </form>
  );
}

function useRoomHealth(roomId: string) {
  const [w] = useWorkspace(); const as = useAssessments();
  const room = w.rooms.find((r) => r.id === roomId);
  return useMemo(() => {
    if (!room) return null;
    const a = as?.find((x) => x.id === room.assessmentId) ?? null;
    const input = healthInputFor(w, room, a);
    const cfg = configFor(room.roomType, w.settings.weights);
    const health = computeHealth(input, cfg);
    return { room, input, health, plan: planMitigation(detectIssues(input, health), w.mitigationDone[room.id] ?? {}) };
  }, [w, as, room]);
}

function Detail({ id }: { id: string }) {
  const [w, update] = useWorkspace(); const toast = useToast(); const as = useAssessments();
  const rh = useRoomHealth(id);
  const [edit, setEdit] = useState(false); const [del, setDel] = useState(false); const [esc, setEsc] = useState<string | null>(null);
  if (!rh) return <Empty title="Room not found" action={<Link className="btn-primary btn-sm" href="/app/rooms">Back to rooms</Link>}>It may have been deleted or this browser has different data.</Empty>;
  const { room, health, plan } = rh;
  const snaps = w.snapshots.filter((s) => s.roomId === id).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const prevSnap = [...snaps].reverse().find((s) => s.overall !== null);
  const readings = w.readings.filter((r) => r.roomId === id && r.value !== null).slice(0, 60).reverse();
  const alerts = w.alerts.filter((a) => a.roomId === id).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const sched = w.schedules.find((s) => s.roomId === id);
  const msg = esc ? escalationMessage(w, esc) : null;
  const q = `?room=${id}`;
  return (
    <>
      <PageHeader title={room.name} sub={[room.building, room.floor && `floor ${room.floor}`, room.department, ENVIRONMENTS.find((o) => o.value === room.roomType)?.label].filter(Boolean).join(" · ") || "Room"}
        actions={<><button className="btn-secondary" onClick={() => setEdit(true)}>Edit</button><button className="btn-secondary !text-bad" onClick={() => setDel(true)} aria-label="Delete room"><Trash2 className="h-4 w-4" /></button></>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link className="btn-primary btn-sm" href={`/app/monitor${q}`}>Monitor live</Link>
        <Link className="btn-secondary btn-sm" href={`/app/readiness${q}`}>Test my room</Link>
        <Link className="btn-secondary btn-sm" href={`/app/map${q}`}>Room map</Link>
        <Link className="btn-secondary btn-sm" href={`/app/verify${q}`}>Before / after</Link>
        <Link className="btn-secondary btn-sm" href={`/app/passport${q}`}>Room passport</Link>
        <Link className="btn-secondary btn-sm" href={`/app/assistant${q}`}>Ask the assistant</Link>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-5">
          <HealthCard h={health} prev={prevSnap?.overall ?? null} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary btn-sm" disabled={health.status !== "ok"} onClick={() => { update((x) => { x.snapshots.unshift({ id: newId(), roomId: id, at: new Date().toISOString(), overall: health.overall, categories: Object.fromEntries(health.categories.map((c) => [c.id, c.score])), input: rh.input }); audit(x, `Score snapshot saved for ${room.name}: ${health.overall}`); }); toast("Score snapshot saved."); }}>Save score snapshot</button>
            {!room.assessmentId && <Link className="btn-secondary btn-sm" href="/app/assessments/new">Start an assessment for this room</Link>}
          </div>
          {snaps.length > 1 && <section className="card p-4"><H2>Score history</H2><Sparkline values={snaps.map((s) => s.overall ?? 0)} label="Health score history" min={0} max={100} /><p className="text-xs text-muted">{snaps.length} snapshots, latest {snaps[snaps.length - 1].overall ?? "n/a"} on {new Date(snaps[snaps.length - 1].at).toLocaleDateString()}.</p></section>}
          <section className="card p-4 sm:p-5" aria-label="Mitigation plan">
            <div className="flex flex-wrap items-center justify-between gap-2"><H2>Mitigation plan</H2><Link className="text-sm font-semibold text-brand" href={`/app/mitigation${q}`}>Open in Mitigation Centre</Link></div>
            {!plan.length ? <p className="text-sm text-muted">{health.status === "ok" ? "Nothing to fix from the evidence we have." : "Add evidence (an assessment or a live recording) to get a plan."}</p> : (
              <ul className="space-y-2">{plan.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-start gap-3 rounded-lg border border-line p-3 text-sm">
                  <input type="checkbox" className="mt-1 h-5 w-5 accent-[rgb(var(--brand))]" checked={a.done} aria-label={`Mark done: ${a.action}`} onChange={(e) => update((x) => { const m = (x.mitigationDone[id] ??= {}); if (e.target.checked) { m[a.id] = new Date().toISOString(); audit(x, `Mitigation done in ${room.name}: ${a.action.slice(0, 60)}`); } else delete m[a.id]; })} />
                  <div><p className={a.done ? "text-muted line-through" : "font-semibold"}>{a.action}</p><p className="mt-0.5 flex flex-wrap gap-1.5"><Badge tone={a.level === 1 ? "good" : a.level === 2 ? "warn" : "brand"}>{LEVEL_LABEL[a.level]}</Badge><Badge>{a.priority}</Badge><span className="text-muted">{a.reason}</span></p></div>
                </li>))}</ul>)}
            {needsProfessional(plan) && <div className="mt-3"><Notice tone="warn" title="Professional help recommended">The evidence points to a problem that simple fixes are unlikely to solve. See the Level 3 steps and ask for local quotes.</Notice></div>}
          </section>
        </div>
        <div className="space-y-4">
          <section className="card p-4"><H2>Recent readings</H2>
            {readings.length ? <><Sparkline values={readings.map((r) => r.value!)} label="Recent noise readings" />
              <p className="text-sm">Latest: <strong>{readings[readings.length - 1].value} dB</strong> <BasisBadge b={readings[readings.length - 1].basis === "calibrated" ? "calibrated" : "estimated"} /> <span className="text-muted">{new Date(readings[readings.length - 1].at).toLocaleString()}</span></p></> : <p className="text-sm text-muted">No readings yet. <Link className="font-semibold text-brand" href={`/app/monitor${q}`}>Monitor this room</Link>.</p>}</section>
          <section className="card p-4"><H2>Reassessment reminder</H2>
            {sched ? <p className="text-sm">Next due <strong>{new Date(sched.nextDue).toLocaleDateString()}</strong> (every {sched.everyDays} days). <button className="font-semibold text-brand" onClick={() => update((x) => { x.schedules = x.schedules.filter((s) => s.roomId !== id); })}>Remove</button></p> : (
              <div className="flex flex-wrap gap-2">{[30, 90, 180].map((d) => <button key={d} className="btn-secondary btn-sm" onClick={() => update((x) => { x.schedules.push({ id: newId(), roomId: id, everyDays: d, nextDue: new Date(Date.now() + d * 86_400_000).toISOString(), note: "" }); audit(x, `Reassessment reminder set every ${d} days for ${room.name}`); })}>Every {d} days</button>)}</div>)}
            <p className="mt-2 text-xs text-muted">Reminders show inside SoundSense when you open it. Nothing is emailed.</p></section>
          <H2>Alerts ({alerts.length})</H2>
          {alerts.length === 0 ? <p className="text-sm text-muted">No alerts for this room.</p> : alerts.slice(0, 5).map((a) => <AlertCard key={a.id} a={a} onAck={() => update((x) => acknowledge(x, a.id))} onResolve={() => update((x) => resolveAlert(x, a.id))} onEscalate={() => setEsc(a.id)} />)}
        </div>
      </div>
      <Modal open={edit} onClose={() => setEdit(false)} title="Edit room" wide><RoomForm initial={room} assessments={as ?? []} onClose={() => setEdit(false)} onSave={(r) => { update((x) => { const t = x.rooms.find((y) => y.id === id); if (t) Object.assign(t, r); }); setEdit(false); toast("Room updated."); }} /></Modal>
      <Confirm open={del} danger title="Delete this room?" confirmLabel="Delete room" onClose={() => setDel(false)} onConfirm={() => { update((x) => removeRoom(x, id)); location.assign(location.pathname); }}>Its readings, alerts, score history, map and reminders are removed from this browser. Linked assessments are kept.</Confirm>
      <Modal open={!!msg} onClose={() => setEsc(null)} title="Escalation message" wide>
        {msg && <div className="space-y-3 text-sm"><p className="text-muted">SoundSense does not send anything. Copy this or open your own mail app.</p>
          <p className="font-semibold">{msg.subject}</p><pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-lg bg-raised p-3 text-xs">{msg.body}</pre>
          <div className="flex flex-wrap gap-2"><button className="btn-primary btn-sm" onClick={() => { navigator.clipboard?.writeText(`${msg.subject}\n\n${msg.body}`).then(() => toast("Copied."), () => toast("Could not copy; select the text instead.", "bad")); }}>Copy</button>
            {w.settings.contacts.map((c) => <a key={c.id} className="btn-secondary btn-sm" href={`mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(msg.subject)}&body=${encodeURIComponent(msg.body)}`}>Open mail to {c.name}</a>)}
            {!w.settings.contacts.length && <Link className="btn-secondary btn-sm" href="/app/settings">Add a contact in settings</Link>}</div></div>}
      </Modal>
    </>
  );
}

function List() {
  const [w, update] = useWorkspace(); const as = useAssessments(); const toast = useToast();
  const [adding, setAdding] = useState(false);
  const cards = w.rooms.map((r) => { const a = as?.find((x) => x.id === r.assessmentId) ?? null; const h = computeHealth(healthInputFor(w, r, a), configFor(r.roomType, w.settings.weights)); return { r, h, open: openAlerts(w, r.id) }; });
  return (
    <>
      <PageHeader title="Rooms" sub="Add the rooms you look after to keep a health score, readings, alerts and a plan for each." actions={<button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add room</button>} />
      {!w.rooms.length ? <Empty title="No rooms yet" action={<button className="btn-primary btn-sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add your first room</button>}>A room can be linked to an assessment you already did, so its answers and recordings count towards the score.</Empty> : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map(({ r, h, open }) => {
          const top = open.sort((a, b) => ["green", "yellow", "orange", "red"].indexOf(b.severity) - ["green", "yellow", "orange", "red"].indexOf(a.severity))[0];
          return (<li key={r.id}><Link href={`/app/rooms?id=${r.id}`} className="card block p-4 hover:bg-raised/60">
            <p className="font-display text-base font-semibold">{r.name}</p><p className="text-xs text-muted">{[r.building, r.floor && `floor ${r.floor}`, r.department].filter(Boolean).join(" · ") || "No location set"}</p>
            <p className="mt-3 font-display text-3xl font-semibold tabular-nums">{h.overall ?? "–"}<span className="ml-1 text-sm font-normal text-muted">{scoreBand(h.overall)}</span></p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">{top ? <><SeverityBadge s={top.severity} /> {open.length} open alert{open.length > 1 ? "s" : ""}</> : <span className="text-muted">No open alerts</span>}</p></Link></li>);
        })}</ul>)}
      <Modal open={adding} onClose={() => setAdding(false)} title="Add a room" wide><RoomForm assessments={as ?? []} onClose={() => setAdding(false)} onSave={(r) => { let id = ""; update((x) => { id = addRoom(x, r).id; }); setAdding(false); toast("Room added."); location.assign(`${location.pathname}?id=${id}`); }} /></Modal>
    </>
  );
}

function Inner() { const id = useSearchParams().get("id"); return id ? <Detail id={id} /> : <List />; }
export default function Page() { return <Suspense><Inner /></Suspense>; }
