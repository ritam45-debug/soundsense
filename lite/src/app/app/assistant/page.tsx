"use client";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Send } from "lucide-react";
import { RoomSelect } from "@/components/ws";
import { Notice, PageHeader } from "@/components/ui";
import { computeHealth, configFor } from "@/lib/acoustics/health";
import { detectIssues, planMitigation } from "@/lib/acoustics/mitigation";
import { copilotReply, type CopilotReply } from "@/lib/workspace/copilot";
import { healthInputFor } from "@/lib/workspace/derive";
import { useWorkspace } from "@/lib/workspace/useWorkspace";
import { useAssessments } from "@/lib/workspace/useAssessments";
import Link from "next/link";

const CHIPS = ["What should I fix first?", "Why is there an echo?", "Why is my score low?", "Are we ready for the meeting?", "How much will it cost?"];
function Inner() {
  const sp = useSearchParams(); const [w] = useWorkspace(); const as = useAssessments();
  const [roomId, setRoomId] = useState(sp.get("room") ?? w.rooms[0]?.id ?? "");
  const [q, setQ] = useState(""); const [log, setLog] = useState<{ q: string; r: CopilotReply }[]>([]);
  const room = w.rooms.find((r) => r.id === roomId) ?? null;
  const ctx = useMemo(() => {
    if (!room) return null;
    const a = as?.find((x) => x.id === room.assessmentId) ?? null; const input = healthInputFor(w, room, a);
    const health = computeHealth(input, configFor(room.roomType, w.settings.weights)); const detected = detectIssues(input, health);
    return { room, health, detected, plan: planMitigation(detected, w.mitigationDone[room.id] ?? {}), alerts: w.alerts.filter((x) => x.roomId === room.id && x.status !== "resolved"), readiness: w.readiness[room.id] ?? null, hasDimensions: !!(room.lengthM && room.widthM && room.heightM) || !!a?.room };
  }, [w, as, room]);
  const ask = (text: string) => { if (!text.trim()) return; setLog((l) => [...l, { q: text, r: copilotReply(text, ctx ?? { room: null, health: null, detected: [], plan: [], alerts: [], readiness: null, hasDimensions: false }) }]); setQ(""); };
  return (
    <>
      <PageHeader title="Room assistant" sub="Short answers based on a room's own evidence: its health score, alerts and fixes." />
      <div className="max-w-2xl space-y-4">
        <Notice tone="info" title="Rule-based, not an AI model">This assistant follows fixed rules over your room&apos;s data. A language-model version needs a server to hold an API key safely, which this static, no-login edition does not have. For open questions, the <Link className="font-semibold text-brand" href="/app/chat">Assistant</Link> page answers from your assessments.</Notice>
        <div className="max-w-sm"><label className="label" htmlFor="room">Room</label><RoomSelect w={w} value={roomId} onChange={setRoomId} allowNone={false} /></div>
        <div className="flex flex-wrap gap-2">{CHIPS.map((c) => <button key={c} className="btn-secondary btn-sm" onClick={() => ask(c)}>{c}</button>)}</div>
        <ul className="space-y-4" aria-live="polite">{log.map((m, i) => (
          <li key={i} className="space-y-2"><p className="ml-auto w-fit max-w-[85%] rounded-xl bg-brand px-3 py-2 text-sm text-brand-ink">{m.q}</p>
            <div className="card space-y-2 p-4 text-sm"><p className="font-semibold">{m.r.answer}</p>
              {m.r.why && <p><span className="font-semibold">Why: </span>{m.r.why}</p>}
              {m.r.immediate.length > 0 && <div><p className="font-semibold">Do now</p><ul className="list-disc pl-5">{m.r.immediate.map((x) => <li key={x}>{x}</li>)}</ul></div>}
              {m.r.longer.length > 0 && <div><p className="font-semibold">Longer term</p><ul className="list-disc pl-5">{m.r.longer.map((x) => <li key={x}>{x}</li>)}</ul></div>}
              {m.r.professional && <p className="rounded-lg bg-warn/10 p-2">This looks bigger than simple fixes. Get a professional opinion and local quotes.</p>}
              {m.r.followUp && <p className="text-muted">To help further: {m.r.followUp}</p>}</div></li>))}</ul>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}><label className="sr-only" htmlFor="q">Your question</label><input id="q" className="input" placeholder="Ask about this room…" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn-primary" aria-label="Send"><Send className="h-4 w-4" /></button></form>
      </div>
    </>
  );
}
export default function Page() { return <Suspense><Inner /></Suspense>; }
