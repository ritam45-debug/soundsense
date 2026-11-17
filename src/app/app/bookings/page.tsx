"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { CalendarDays, Clock } from "lucide-react";
import { SlotPicker } from "@/components/SlotPicker";
import { Badge, Confirm, Empty, ErrorBox, Field, Modal, Notice, PageHeader, Spinner, Tabs, statusLabel, statusTone, useToast } from "@/components/ui";
import { call, fmtDate, useApi, useMe } from "@/lib/client";
import { BOOKING_TYPES, bookingTypeLabel } from "@/lib/services/bookings-shared";

type Action = "reschedule_request" | "cancel_request" | "cancel" | "confirm" | "decline" | "approve_reschedule" | "decline_reschedule" | "approve_cancel" | "decline_cancel" | "complete" | "assign";

function Inner() {
  const me = useMe().data!.user; const role = me.role; const toast = useToast();
  const sp = useSearchParams();
  const [tab, setTab] = useState<"list" | "new" | "calendar">(sp.get("assessment") ? "new" : "list");
  const [filter, setFilter] = useState("");
  const { data, error, mutate } = useApi<any>(`/api/bookings${filter ? `?status=${filter}` : ""}`);
  const [resched, setResched] = useState<any>(null); const [pickedSlot, setPickedSlot] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ b: any; action: Action; title: string; text: string; danger?: boolean } | null>(null);
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const { data: cons } = useApi<any>(role === "admin" ? "/api/consultants" : null);

  async function act(id: string, action: Action, extra: any = {}) {
    setBusy(true);
    try { await call(`/api/bookings/${id}`, { method: "PATCH", body: { action, ...extra } }); toast("Updated."); setConfirm(null); setResched(null); setPickedSlot(null); setNote(""); mutate(); } catch (e: any) { toast(e.message, "bad"); } finally { setBusy(false); }
  }
  const ask = (b: any, action: Action, title: string, text: string, danger = false) => { setNote(""); setConfirm({ b, action, title, text, danger }); };

  const tabs = [{ id: "list" as const, label: role === "customer" ? "My consultations" : "Requests & schedule" }, ...(role === "customer" ? [{ id: "new" as const, label: "Book a consultation" }] : []), ...(role === "admin" ? [{ id: "calendar" as const, label: "Calendar & availability" }] : [])];
  return (
    <>
      <PageHeader title="Consultations" sub={role === "customer" ? "Talk it through with an acoustic consultant. It's optional – your diagnosis and report are yours either way." : "Booking requests, confirmations and the schedule."} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "new" && <NewBooking me={me} assessmentId={sp.get("assessment") ?? undefined} done={() => { setTab("list"); mutate(); }} />}
      {tab === "calendar" && <AdminCalendar bookings={data?.bookings ?? []} />}
      {tab === "list" && (
        <>
          <div className="mb-4 flex items-center gap-2"><label className="text-xs font-semibold">Status
            <select className="input !min-h-[40px] ml-2 inline-block !w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">All</option>{["requested", "confirmed", "reschedule_requested", "cancel_requested", "completed", "cancelled", "rejected"].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label></div>
          {error && <ErrorBox error={error} retry={() => mutate()} />}
          {!data && !error && <Spinner />}
          {data && !data.bookings.length && <Empty title="No consultations yet" action={role === "customer" ? <button className="btn-primary btn-sm" onClick={() => setTab("new")}><CalendarDays className="h-4 w-4" /> Book one</button> : undefined}>{role === "customer" ? "Pick a time that suits you – only free slots are shown." : "New requests will appear here."}</Empty>}
          <ul className="space-y-3">{data?.bookings.map((b: any) => {
            const staffCan = role === "admin" || b.consultant_id === me.id;
            return (
              <li key={b.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="font-display font-semibold">{bookingTypeLabel(b.type)}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm"><Clock className="h-4 w-4 text-muted" />{fmtDate(b.slot_start, true)} IST</p>
                    <p className="text-xs text-muted">{b.ref}{role !== "customer" && ` · ${b.customer_name} (${b.customer_email})`}{b.assessment_ref && ` · ${b.assessment_ref}`}{b.consultant_name && ` · with ${b.consultant_name}`}</p></div>
                  <Badge tone={statusTone(b.status)}>{statusLabel(b.status)}</Badge>
                </div>
                {b.description && <p className="mt-2 text-sm text-muted">{b.description}</p>}
                {b.requested_slot_start && <p className="mt-2 rounded-lg bg-raised p-2 text-sm">Reschedule requested to <strong>{fmtDate(b.requested_slot_start, true)} IST</strong></p>}
                {b.status_note && <p className="mt-2 text-sm"><span className="font-semibold">Note: </span>{b.status_note}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {role === "customer" && b.status === "requested" && <><button className="btn-secondary btn-sm" onClick={() => setResched(b)}>Change time</button><button className="btn-secondary btn-sm" onClick={() => ask(b, "cancel", "Cancel this request?", "The slot will be released for others.", true)}>Cancel</button></>}
                  {role === "customer" && b.status === "confirmed" && <><button className="btn-secondary btn-sm" onClick={() => setResched(b)}>Request new time</button><button className="btn-secondary btn-sm" onClick={() => ask(b, "cancel_request", "Request cancellation?", "A team member will confirm the cancellation.", true)}>Request cancellation</button></>}
                  {role !== "customer" && staffCan && b.status === "requested" && <><button className="btn-primary btn-sm" onClick={() => act(b.id, "confirm")}>Confirm</button><button className="btn-secondary btn-sm" onClick={() => ask(b, "decline", "Decline this request?", "Add a short reason for the customer.", true)}>Decline</button></>}
                  {role !== "customer" && staffCan && b.status === "reschedule_requested" && <><button className="btn-primary btn-sm" onClick={() => act(b.id, "approve_reschedule")}>Approve new time</button><button className="btn-secondary btn-sm" onClick={() => act(b.id, "decline_reschedule")}>Keep original</button></>}
                  {role !== "customer" && staffCan && b.status === "cancel_requested" && <><button className="btn-primary btn-sm" onClick={() => act(b.id, "approve_cancel")}>Approve cancellation</button><button className="btn-secondary btn-sm" onClick={() => act(b.id, "decline_cancel")}>Keep booking</button></>}
                  {role !== "customer" && staffCan && b.status === "confirmed" && <><button className="btn-secondary btn-sm" onClick={() => act(b.id, "complete")}>Mark completed</button><button className="btn-ghost btn-sm" onClick={() => ask(b, "cancel", "Cancel this consultation?", "The customer will be notified.", true)}>Cancel</button></>}
                  {role === "admin" && !["cancelled", "rejected", "completed"].includes(b.status) && (
                    <select aria-label="Assign consultant" className="input !min-h-[36px] !w-auto text-[13px]" value={b.consultant_id ?? ""} onChange={(e) => act(b.id, "assign", { consultantId: e.target.value || null })}>
                      <option value="">Assign consultant…</option>{cons?.consultants?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>)}
                </div>
              </li>);
          })}</ul>
        </>
      )}

      <Confirm open={!!confirm} title={confirm?.title ?? ""} danger={confirm?.danger} busy={busy} confirmLabel="Yes, continue" onClose={() => setConfirm(null)} onConfirm={() => confirm && act(confirm.b.id, confirm.action, { note: note || undefined })}>
        <p>{confirm?.text}</p><div className="mt-3"><Field label="Note (optional)" htmlFor="cn"><input id="cn" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
      </Confirm>
      <Modal open={!!resched} onClose={() => { setResched(null); setPickedSlot(null); }} title="Choose a new time" wide>
        <SlotPicker value={pickedSlot} onChange={(s) => setPickedSlot(s)} />
        <div className="mt-4 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setResched(null)}>Close</button>
          <button className="btn-primary" disabled={!pickedSlot || busy} onClick={() => act(resched.id, resched.status === "requested" ? "reschedule_request" : "reschedule_request", { slotStart: pickedSlot })}>Request this time</button></div>
        {resched?.status === "requested" && <p className="mt-3 text-xs text-muted">Your original request stays in place until the team approves the new time.</p>}
      </Modal>
    </>
  );
}

function NewBooking({ me, assessmentId, done }: { me: any; assessmentId?: string; done: () => void }) {
  const toast = useToast();
  const [type, setType] = useState("general"); const [slot, setSlot] = useState<string | null>(null); const [slotLabel, setSlotLabel] = useState("");
  const [desc, setDesc] = useState(""); const [phone, setPhone] = useState(me.phone ?? ""); const [aid, setAid] = useState(assessmentId ?? "");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const { data: list } = useApi<any>("/api/assessments?limit=50");
  async function submit() {
    if (!slot) return setErr("Choose a date and time first.");
    setBusy(true); setErr("");
    try {
      await call("/api/bookings", { body: { type, slotStart: slot, description: desc, assessmentId: aid || null, contact: { name: me.name, email: me.email, ...(phone && { phone }) } } });
      toast("Request sent. You'll be notified when it is confirmed."); done();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="card p-4 sm:p-5"><h3 className="mb-3 font-display text-base font-semibold">1. Pick a time</h3><SlotPicker value={slot} onChange={(s, l) => { setSlot(s); setSlotLabel(l); }} /></section>
      <section className="card space-y-4 p-4 sm:p-5">
        <h3 className="font-display text-base font-semibold">2. Tell us what you need</h3>
        <Field label="Type of consultation" htmlFor="bt"><select id="bt" className="input" value={type} onChange={(e) => setType(e.target.value)}>{BOOKING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
        <Field label="Link an assessment (recommended)" htmlFor="ba" hint="The consultant can then see your diagnosis."><select id="ba" className="input" value={aid} onChange={(e) => setAid(e.target.value)}><option value="">None</option>{list?.items?.filter((a: any) => a.status !== "draft").map((a: any) => <option key={a.id} value={a.id}>{a.ref} – {a.title || "Untitled"}</option>)}</select></Field>
        <Field label="Describe the problem" htmlFor="bd" hint="At least a sentence or two."><textarea id="bd" className="input min-h-[96px] py-2" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        <Field label="Phone (optional)" htmlFor="bp"><input id="bp" type="tel" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <div className="rounded-lg bg-raised p-3 text-sm"><p className="font-semibold">{slot ? slotLabel : "No time chosen yet"}</p><p className="text-muted">Contact: {me.name} · {me.email}</p></div>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn-primary w-full" onClick={submit} disabled={busy}>{busy ? "Sending…" : "Request this consultation"}</button>
        <Notice tone="info">A team member confirms every request. Nothing is charged through this app.</Notice>
      </section>
    </div>
  );
}

function AdminCalendar({ bookings }: { bookings: any[] }) {
  const toast = useToast(); const [offset, setOffset] = useState(0);
  const base = useApi<any>("/api/availability");
  const from = base.data ? new Date(+new Date(`${base.data.from}T00:00:00Z`) + offset * 7 * 864e5).toISOString().slice(0, 10) : null;
  const { data, mutate } = useApi<any>(from ? `/api/availability?from=${from}&to=${new Date(+new Date(`${from}T00:00:00Z`) + 6 * 864e5).toISOString().slice(0, 10)}` : null);
  const blocks = useApi<any>("/api/admin/blocks");
  if (!data) return <Spinner />;
  const days: string[] = Array.from(new Set((data.slots as any[]).map((s) => s.day)));
  const blocked = new Set((blocks.data?.blocks ?? []).map((b: any) => b.day));
  const live = bookings.filter((b) => ["requested", "confirmed", "reschedule_requested", "cancel_requested"].includes(b.status));
  const owner = (start: string) => live.find((b) => +new Date(b.slot_start) === +new Date(start));
  async function toggle(day: string) {
    try { blocked.has(day) ? await call("/api/admin/blocks", { method: "DELETE", body: { day } }) : await call("/api/admin/blocks", { body: { day, reason: "Closed by admin" } }); toast(blocked.has(day) ? "Day reopened." : "Day closed – no bookings can be made."); blocks.mutate(); mutate(); } catch (e: any) { toast(e.message, "bad"); }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex gap-2"><button className="btn-secondary btn-sm" disabled={offset === 0} onClick={() => setOffset(offset - 1)}>← Earlier</button><button className="btn-secondary btn-sm" onClick={() => setOffset(offset + 1)}>Later →</button></div>
        <p className="text-xs text-muted">Edit working hours, slot length and lead time in Settings.</p></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{days.map((d) => {
        const sl = (data.slots as any[]).filter((s) => s.day === d); const isBlocked = blocked.has(d);
        return (
          <section key={d} className="card p-3"><div className="mb-2 flex items-center justify-between"><h4 className="font-display text-sm font-semibold">{new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" })}</h4>
            <button className="btn-ghost btn-sm" onClick={() => toggle(d)}>{isBlocked ? "Reopen day" : "Close day"}</button></div>
            {isBlocked && <p className="mb-2 text-xs font-semibold text-warn">Closed – customers cannot book this day.</p>}
            <ul className="space-y-1">{sl.map((s: any) => { const o = owner(s.start); return (
              <li key={s.start} className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] ${o ? "bg-brand-soft" : s.available ? "bg-raised/60" : "bg-raised/30 text-muted"}`}><span className="font-semibold tabular-nums">{s.label}</span>
                <span className="truncate">{o ? `${o.customer_name} · ${statusLabel(o.status)}` : s.available ? "Free" : s.reason === "blocked" ? "Closed" : s.reason === "past" ? "Too soon" : "Booked"}</span></li>); })}</ul></section>);
      })}</div>
    </div>
  );
}

export default function Page() { return <Suspense fallback={<Spinner />}><Inner /></Suspense>; }
