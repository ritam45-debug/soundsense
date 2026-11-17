"use client";
import { useEffect, useState } from "react";
import { Badge, ErrorBox, Field, Notice, PageHeader, Spinner, useToast } from "@/components/ui";
import { call, useApi, useMe } from "@/lib/client";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export default function Page() {
  const me = useMe().data!.user; const toast = useToast();
  const { data, error, mutate } = useApi<any>(me.role === "admin" ? "/api/admin/settings" : null);
  const [a, setA] = useState<any>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  useEffect(() => { if (data) setA(data.availability); }, [data]);
  if (me.role !== "admin") return <ErrorBox error="Administrators only." />;
  if (error) return <ErrorBox error={error} />;
  if (!data || !a) return <Spinner />;
  const set = (k: string, v: any) => setA({ ...a, [k]: v });
  async function save() {
    setBusy(true); setErr("");
    try { await call("/api/admin/settings", { method: "PUT", body: { availability: { ...a, slotMinutes: Number(a.slotMinutes), capacity: Number(a.capacity), leadHours: Number(a.leadHours), horizonDays: Number(a.horizonDays), breakStart: a.breakStart || null, breakEnd: a.breakEnd || null } } }); toast("Availability saved."); mutate(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const sys = data.system;
  return (
    <>
      <PageHeader title="Settings" sub="Consultation availability and a read-only view of how this deployment is configured." />
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card space-y-4 p-5">
          <h2 className="font-display text-base font-semibold">Consultation availability</h2>
          <fieldset><legend className="label">Working days</legend><div className="flex flex-wrap gap-2">{DAYS.map((d, i) => { const on = a.days.includes(i); return <label key={d} className={`flex min-h-[44px] min-w-[52px] cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-semibold ${on ? "border-brand bg-brand-soft" : "border-line"}`}><input type="checkbox" className="sr-only" checked={on} onChange={() => set("days", on ? a.days.filter((x: number) => x !== i) : [...a.days, i].sort())} />{d}</label>; })}</div></fieldset>
          <div className="grid grid-cols-2 gap-3"><Field label="Opens" htmlFor="s1"><input id="s1" type="time" className="input" value={a.start} onChange={(e) => set("start", e.target.value)} /></Field><Field label="Closes" htmlFor="s2"><input id="s2" type="time" className="input" value={a.end} onChange={(e) => set("end", e.target.value)} /></Field>
            <Field label="Break from" htmlFor="s3"><input id="s3" type="time" className="input" value={a.breakStart ?? ""} onChange={(e) => set("breakStart", e.target.value)} /></Field><Field label="Break to" htmlFor="s4"><input id="s4" type="time" className="input" value={a.breakEnd ?? ""} onChange={(e) => set("breakEnd", e.target.value)} /></Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Slot length (minutes)" htmlFor="s5"><input id="s5" type="number" className="input" value={a.slotMinutes} onChange={(e) => set("slotMinutes", e.target.value)} /></Field><Field label="Consultations per slot" htmlFor="s6" hint="How many can run at the same time."><input id="s6" type="number" className="input" value={a.capacity} onChange={(e) => set("capacity", e.target.value)} /></Field>
            <Field label="Minimum notice (hours)" htmlFor="s7"><input id="s7" type="number" className="input" value={a.leadHours} onChange={(e) => set("leadHours", e.target.value)} /></Field><Field label="Book up to (days ahead)" htmlFor="s8"><input id="s8" type="number" className="input" value={a.horizonDays} onChange={(e) => set("horizonDays", e.target.value)} /></Field></div>
          <p className="text-xs text-muted">Times are in {a.timezoneLabel} (UTC{a.utcOffsetMinutes >= 0 ? "+" : "−"}{Math.floor(Math.abs(a.utcOffsetMinutes) / 60)}:{String(Math.abs(a.utcOffsetMinutes) % 60).padStart(2, "0")}). Close individual days from the Calendar tab on the Consultations page.</p>
          {err && <p className="err" role="alert">{err}</p>}<button className="btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save availability"}</button>
        </section>
        <section className="card space-y-3 p-5 text-sm">
          <h2 className="font-display text-base font-semibold">Deployment</h2>
          <p className="flex items-center justify-between">AI chatbot (server-side LLM) {sys.aiConfigured ? <Badge tone="good">Configured</Badge> : <Badge tone="warn">Not configured – offline guidance mode</Badge>}</p>
          <p className="flex items-center justify-between">E-mail delivery (SMTP) {sys.smtpConfigured ? <Badge tone="good">Configured</Badge> : <Badge tone="warn">Not configured – links shown on screen in dev only</Badge>}</p>
          <p className="flex items-center justify-between">E-mail verification required {sys.emailVerificationRequired ? <Badge tone="good">Yes</Badge> : <Badge>No</Badge>}</p>
          <p className="flex items-center justify-between">Database <Badge>{sys.databaseKind}</Badge></p>
          <Notice tone="info">API keys, SMTP and database credentials are set as environment variables on the server (see <code>.env.example</code>). They are never stored in the database or sent to the browser.</Notice>
        </section>
      </div>
    </>
  );
}
