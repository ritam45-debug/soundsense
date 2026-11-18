"use client";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { BasisBadge, H2, RoomSelect } from "@/components/ws";
import { Empty, Field, Notice, PageHeader } from "@/components/ui";
import { ACTIONS } from "@/lib/acoustics/mitigation";
import { changesBetween, compareEvidence } from "@/lib/acoustics/compare";
import { computeHealth, configFor } from "@/lib/acoustics/health";
import { evidenceFor, healthInputFor } from "@/lib/workspace/derive";
import { useWorkspace } from "@/lib/workspace/useWorkspace";
import { useAssessments } from "@/lib/workspace/useAssessments";
import { downloadBytes, simplePdf } from "@/lib/workspace/simplePdf";

function Inner() {
  const sp = useSearchParams(); const [w] = useWorkspace(); const as = useAssessments();
  const [roomId, setRoomId] = useState(sp.get("room") ?? w.rooms[0]?.id ?? "");
  const room = w.rooms.find((r) => r.id === roomId) ?? null;
  const a = as?.find((x) => x.id === room?.assessmentId) ?? null;
  const ev = useMemo(() => (room ? evidenceFor(w, room, a) : []), [w, room, a]);
  const [bi, setBi] = useState(""); const [ai, setAi] = useState("");
  const before = ev[Number(bi)] ?? (bi === "" ? undefined : undefined); const after = ev[Number(ai)];
  const cmp = before && after ? compareEvidence(before, after) : null;
  const label = (id: string) => ACTIONS.find((x) => x.id === id)?.action ?? id;
  const changes = before && after && room ? changesBetween(w.mitigationDone[room.id], label, before.at, after.at) : [];
  const snaps = room ? w.snapshots.filter((s) => s.roomId === room.id).sort((x, y) => Date.parse(x.at) - Date.parse(y.at)) : [];
  const snapB = before ? [...snaps].reverse().find((s) => s.at <= before.at) : null; const snapA = after ? [...snaps].reverse().find((s) => s.at <= after.at) : null;
  const scoreNow = room ? computeHealth(healthInputFor(w, room, a), configFor(room.roomType, w.settings.weights)).overall : null;

  async function pdf() {
    if (!cmp || !before || !after || !room) return;
    const fmt = (e: typeof before) => `${new Date(e.at).toLocaleString()}: ${e.value} dB (${e.basis === "calibrated" ? "calibrated" : "uncalibrated estimate"}), ${e.label}`;
    const bytes = await simplePdf(`Improvement check: ${room.name}`, `Generated ${new Date().toLocaleString()} by SoundSense Lite`, [
      { heading: "Result", lines: [cmp.summary, ...(cmp.comparable ? [] : cmp.issues.map((i) => `- ${i}`))] },
      { heading: "Readings compared", lines: [`Before - ${fmt(before)}`, `After - ${fmt(after)}`] },
      { heading: "Changes recorded between the two readings", lines: changes.length ? changes.map((c) => `- ${new Date(c.at).toLocaleDateString()}: ${c.text}`) : ["None were recorded in SoundSense."] },
      ...(snapB && snapA && snapB.overall !== null && snapA.overall !== null ? [{ heading: "Acoustic health score", lines: [`Before: ${snapB.overall}. After: ${snapA.overall}. Change: ${snapA.overall - snapB.overall >= 0 ? "+" : ""}${snapA.overall - snapB.overall} points.`] }] : []),
      { heading: "Limits of this comparison", lines: cmp.caveats.map((c) => `- ${c}`).concat(["- Listing changes made in between does not show that they caused the difference."]) },
    ], "Screening comparison using a phone or laptop microphone. Not a certified measurement.");
    downloadBytes(bytes, `improvement-${room.name.replace(/\W+/g, "-").toLowerCase()}.pdf`);
  }
  const opts = ev.map((e, i) => <option key={i} value={i}>{new Date(e.at).toLocaleString()} – {e.value} dB – {e.label}</option>);
  return (
    <>
      <PageHeader title="Before and after" sub="Check whether a change helped. Readings are only compared when they can be compared fairly, and the result never claims what caused a difference." />
      <div className="max-w-3xl space-y-4">
        <div className="max-w-sm"><Field label="Room" htmlFor="room"><RoomSelect w={w} value={roomId} onChange={(v) => { setRoomId(v); setBi(""); setAi(""); }} allowNone={false} /></Field></div>
        {!w.rooms.length && <Empty title="Add a room first" action={<Link className="btn-primary btn-sm" href="/app/rooms">Add a room</Link>}>Link an assessment with recordings, or monitor the room live to create readings.</Empty>}
        {room && ev.length < 2 && <Notice tone="warn" title="Two readings needed">{room.name} has {ev.length} usable reading{ev.length === 1 ? "" : "s"}. Record room noise before the change, make the change, then record again with the same device and position. <Link className="font-semibold text-brand" href={`/app/monitor?room=${room.id}`}>Monitor the room</Link>.</Notice>}
        {room && ev.length >= 2 && (
          <>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Before" htmlFor="b"><select id="b" className="input" value={bi} onChange={(e) => setBi(e.target.value)}><option value="">Choose…</option>{opts}</select></Field><Field label="After" htmlFor="a"><select id="a" className="input" value={ai} onChange={(e) => setAi(e.target.value)}><option value="">Choose…</option>{opts}</select></Field></div>
            {cmp && before && after && (
              <section className="card space-y-3 p-5" aria-live="polite">
                <p className="font-display text-lg font-semibold">{cmp.summary}</p>
                <p className="flex flex-wrap gap-2 text-sm"><span>Before: <BasisBadge b={before.basis === "calibrated" ? "calibrated" : "estimated"} /></span><span>After: <BasisBadge b={after.basis === "calibrated" ? "calibrated" : "estimated"} /></span></p>
                {!cmp.comparable && <ul className="list-disc space-y-1 pl-5 text-sm">{cmp.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
                {cmp.comparable && <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{cmp.caveats.map((c) => <li key={c}>{c}</li>)}</ul>}
                <div><H2>Changes recorded in between</H2>{changes.length ? <ul className="list-disc pl-5 text-sm">{changes.map((c) => <li key={c.at + c.text}>{new Date(c.at).toLocaleDateString()}: {c.text}</li>)}</ul> : <p className="text-sm text-muted">No fixes were ticked off in the Mitigation Centre between these readings.</p>}<p className="mt-1 text-xs text-muted">Shown for context only. It does not show that they caused the difference.</p></div>
                {snapB?.overall != null && snapA?.overall != null && <p className="text-sm">Health score snapshots: {snapB.overall} then {snapA.overall} ({snapA.overall - snapB.overall >= 0 ? "+" : ""}{snapA.overall - snapB.overall}).</p>}
                {scoreNow !== null && <p className="text-sm text-muted">Current health score: {scoreNow}.</p>}
                <button className="btn-secondary" onClick={pdf}><Download className="h-4 w-4" /> Download improvement report (PDF)</button>
              </section>)}
          </>)}
      </div>
    </>
  );
}
export default function Page() { return <Suspense><Inner /></Suspense>; }
