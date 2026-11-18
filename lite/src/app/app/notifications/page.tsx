"use client";
import Link from "next/link";
import { useState } from "react";
import { AlertCard, SeverityBadge } from "@/components/ws";
import { Empty, PageHeader, Tabs, Notice, Modal, useToast } from "@/components/ui";
import { useWorkspace } from "@/lib/workspace/useWorkspace";
import { acknowledge, completeSchedule, dueSchedules, escalationMessage, resolveAlert } from "@/lib/workspace/ops";

export default function Page() {
  const [w, update] = useWorkspace(); const toast = useToast();
  const [tab, setTab] = useState<"notes" | "alerts" | "history">("notes");
  const [esc, setEsc] = useState<string | null>(null);
  const msg = esc ? escalationMessage(w, esc) : null;
  const due = dueSchedules(w);
  return (
    <>
      <PageHeader title="Notifications & alerts" sub="Everything stays inside SoundSense on this device. Nothing is emailed or sent anywhere; escalation messages are written for you to copy." actions={<button className="btn-secondary" disabled={!w.notifications.some((n) => !n.read)} onClick={() => update((x) => x.notifications.forEach((n) => (n.read = true)))}>Mark all read</button>} />
      {due.length > 0 && <div className="mb-4"><Notice tone="warn" title="Reassessment due">{due.map((s) => { const r = w.rooms.find((x) => x.id === s.roomId); return <p key={s.id}>{r?.name ?? "A room"} was due {new Date(s.nextDue).toLocaleDateString()}. <Link className="font-semibold text-brand" href={`/app/monitor?room=${s.roomId}`}>Record now</Link> · <button className="font-semibold text-brand" onClick={() => update((x) => completeSchedule(x, s.id))}>Mark done</button></p>; })}</Notice></div>}
      <Tabs tabs={[{ id: "notes", label: "Notifications", count: w.notifications.filter((n) => !n.read).length }, { id: "alerts", label: "Alerts", count: w.alerts.filter((a) => a.status !== "resolved").length }, { id: "history", label: "History" }]} value={tab} onChange={setTab} />
      <div className="mt-4 space-y-3">
        {tab === "notes" && (w.notifications.length === 0 ? <Empty title="No notifications">New alerts show here the first time they appear.</Empty> : w.notifications.slice(0, 80).map((n) => (
          <div key={n.id} className={`card flex items-start justify-between gap-3 p-3 ${n.read ? "" : "border-brand/50"}`}>
            <div><p className="font-semibold">{!n.read && <span className="mr-2 rounded-full bg-brand px-2 py-0.5 text-[11px] text-brand-ink">New</span>}{n.title}</p><p className="text-sm text-muted">{n.body}</p><p className="mt-1 text-xs text-muted">{new Date(n.at).toLocaleString()} · {n.type}</p></div>
            {!n.read && <button className="btn-ghost btn-sm" onClick={() => update((x) => { const t = x.notifications.find((y) => y.id === n.id); if (t) t.read = true; })}>Mark read</button>}
          </div>)))}
        {tab === "alerts" && (w.alerts.length === 0 ? <Empty title="No alerts yet">Alerts appear when monitoring finds a problem.</Empty> : [...w.alerts].sort((a, b) => Number(a.status === "resolved") - Number(b.status === "resolved") || Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).map((a) => <AlertCard key={a.id} a={a} room={w.rooms.find((r) => r.id === a.roomId)} onAck={() => update((x) => acknowledge(x, a.id))} onResolve={() => update((x) => resolveAlert(x, a.id))} onEscalate={() => setEsc(a.id)} />))}
        {tab === "history" && (w.audit.length === 0 ? <Empty title="No history yet">Alert changes and completed fixes are listed here.</Empty> : <ul className="card divide-y divide-line">{w.audit.slice(0, 200).map((e) => <li key={e.id} className="flex justify-between gap-3 p-3 text-sm"><span>{e.text}</span><span className="shrink-0 text-xs text-muted">{new Date(e.at).toLocaleString()}</span></li>)}</ul>)}
      </div>
      <Modal open={!!msg} onClose={() => setEsc(null)} title="Escalation message" wide>
        {msg && <div className="space-y-3 text-sm"><p className="text-muted">Nothing is sent. Copy it, or open your own mail app.</p><p className="font-semibold">{msg.subject}</p><pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-lg bg-raised p-3 text-xs">{msg.body}</pre>
          <div className="flex flex-wrap gap-2"><button className="btn-primary btn-sm" onClick={() => navigator.clipboard?.writeText(`${msg.subject}\n\n${msg.body}`).then(() => toast("Copied."), () => toast("Could not copy; select the text instead.", "bad"))}>Copy</button>
            {w.settings.contacts.map((c) => <a key={c.id} className="btn-secondary btn-sm" href={`mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(msg.subject)}&body=${encodeURIComponent(msg.body)}`}>Open mail to {c.name}</a>)}</div></div>}
      </Modal>
    </>
  );
}
