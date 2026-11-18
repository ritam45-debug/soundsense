"use client";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { H2, RoomSelect } from "@/components/ws";
import { Badge, Empty, Field, Notice, PageHeader, Tabs } from "@/components/ui";
import { computeHealth, configFor } from "@/lib/acoustics/health";
import { ACTIONS, COST_LABEL, detectIssues, LEVEL_LABEL, needsProfessional, planMitigation } from "@/lib/acoustics/mitigation";
import { healthInputFor } from "@/lib/workspace/derive";
import { useWorkspace } from "@/lib/workspace/useWorkspace";
import { useAssessments } from "@/lib/workspace/useAssessments";
import { audit } from "@/lib/workspace/store";

function Inner() {
  const sp = useSearchParams(); const [w, update] = useWorkspace(); const as = useAssessments();
  const [roomId, setRoomId] = useState(sp.get("room") ?? w.rooms[0]?.id ?? "");
  const [tab, setTab] = useState<"plan" | "all">("plan");
  const room = w.rooms.find((r) => r.id === roomId) ?? null;
  const plan = useMemo(() => {
    if (!room) return [];
    const a = as?.find((x) => x.id === room.assessmentId) ?? null;
    const input = healthInputFor(w, room, a);
    return planMitigation(detectIssues(input, computeHealth(input, configFor(room.roomType, w.settings.weights))), w.mitigationDone[room.id] ?? {});
  }, [w, as, room]);
  const done = plan.filter((p) => p.done).length;
  return (
    <>
      <PageHeader title="Mitigation Centre" sub="Fixes in three levels: free changes first, affordable additions next, professional help when the problem needs it. Costs are never guessed: items are either free or need a local quote." />
      <Tabs tabs={[{ id: "plan", label: "Plan for a room" }, { id: "all", label: "All actions" }]} value={tab} onChange={setTab} />
      {tab === "plan" ? (
        <div className="mt-4 space-y-4">
          <div className="max-w-sm"><Field label="Room" htmlFor="room"><RoomSelect w={w} value={roomId} onChange={setRoomId} allowNone={false} /></Field></div>
          {!w.rooms.length && <Empty title="Add a room first" action={<Link className="btn-primary btn-sm" href="/app/rooms">Add a room</Link>}>A plan is built from a room&apos;s evidence: its assessment, recordings and live readings.</Empty>}
          {room && !plan.length && <Notice tone="good" title="Nothing to fix from the evidence we have">If sound still feels wrong, add evidence: <Link className="font-semibold text-brand" href={`/app/monitor?room=${room.id}`}>monitor the room</Link> or link an assessment.</Notice>}
          {room && plan.length > 0 && (
            <>
              <p className="text-sm text-muted">{done} of {plan.length} done in {room.name}.</p>
              {needsProfessional(plan) && <Notice tone="warn" title="Professional help recommended">Some problems here are unlikely to be fixed by simple changes. Ask for local quotes for the Level 3 items.</Notice>}
              <ul className="space-y-3">{plan.map((a) => (
                <li key={a.id} className="card p-4">
                  <div className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1 h-5 w-5 accent-[rgb(var(--brand))]" checked={a.done} aria-label={`Mark done: ${a.action}`} onChange={(e) => update((x) => { const m = (x.mitigationDone[room.id] ??= {}); if (e.target.checked) { m[a.id] = new Date().toISOString(); audit(x, `Mitigation done in ${room.name}: ${a.action.slice(0, 60)}`); } else delete m[a.id]; })} />
                    <div className="min-w-0">
                      <p className="flex flex-wrap gap-1.5"><Badge tone={a.level === 1 ? "good" : a.level === 2 ? "warn" : "brand"}>{LEVEL_LABEL[a.level]}</Badge><Badge>{a.priority}</Badge><Badge>{COST_LABEL[a.cost]}</Badge><Badge>{a.difficulty}</Badge></p>
                      <p className={`mt-2 font-semibold ${a.done ? "text-muted line-through" : ""}`}>{a.action}</p>
                      <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[110px_1fr]">
                        <dt className="text-muted">Problem</dt><dd>{a.problem}</dd><dt className="text-muted">Why now</dt><dd>{a.reason}</dd>
                        <dt className="text-muted">Benefit</dt><dd>{a.benefit}</dd><dt className="text-muted">Limits</dt><dd>{a.limitations}</dd>
                        {a.done && <><dt className="text-muted">Done</dt><dd>{new Date(a.doneAt!).toLocaleDateString()}. Re-check with a new recording.</dd></>}
                      </dl>
                      {a.level >= 2 && !a.done && <Link href={`/app/marketplace?room=${room.id}&issue=${a.issue}`} className="mt-2 inline-block text-sm font-semibold text-brand">Find help for this</Link>}
                    </div></div></li>))}</ul>
              <p className="text-sm text-muted">After a change, <Link className="font-semibold text-brand" href={`/app/verify?room=${room.id}`}>run a before/after check</Link> to see whether it helped.</p>
            </>)}
        </div>
      ) : (
        <div className="mt-4 space-y-3">{[1, 2, 3].map((l) => (
          <section key={l} className="card p-4"><H2>{LEVEL_LABEL[l as 1 | 2 | 3]}</H2><ul className="space-y-2 text-sm">{ACTIONS.filter((a) => a.level === l).map((a) => <li key={a.id}><span className="font-semibold">{a.action}</span> <span className="text-muted">({a.problem}; {COST_LABEL[a.cost].toLowerCase()})</span></li>)}</ul></section>))}</div>)}
    </>
  );
}
export default function Page() { return <Suspense><Inner /></Suspense>; }
