"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Award, Target } from "lucide-react";
import { RoomSelect, H2 } from "@/components/ws";
import { Badge, Field, Notice, PageHeader } from "@/components/ui";
import { badges, goalProgress } from "@/lib/workspace/goals";
import { useWorkspace } from "@/lib/workspace/useWorkspace";
import { useAssessments } from "@/lib/workspace/useAssessments";
import { audit } from "@/lib/workspace/store";
import { newId } from "@/lib/local/store";

export default function Page() {
  const [w, update] = useWorkspace(); const as = useAssessments();
  const [roomId, setRoomId] = useState(w.rooms[0]?.id ?? ""); const [target, setTarget] = useState("80");
  const bs = useMemo(() => badges(w, as ?? []), [w, as]);
  return (
    <>
      <PageHeader title="Improvement goals" sub="Set a target for a room and earn recognition for improvements that were actually measured." />
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-3"><H2>Badges</H2>
          <Notice tone="info">Badges come only from evidence: comparable recordings, saved score snapshots and a readiness check. Ticking off fixes earns nothing by itself, so there is nothing to gain from chasing the score.</Notice>
          <ul className="space-y-2">{bs.map((b) => <li key={b.id} className={`card flex gap-3 p-4 ${b.earned ? "border-good/50" : ""}`}><Award className={`mt-0.5 h-6 w-6 shrink-0 ${b.earned ? "text-good" : "text-muted"}`} aria-hidden /><div><p className="flex flex-wrap items-center gap-2 font-semibold">{b.name}<Badge tone={b.earned ? "good" : "neutral"}>{b.earned ? "Earned" : "Not yet"}</Badge></p><p className="text-sm text-muted">{b.how}</p>{b.earned && <p className="mt-1 text-sm">{b.rooms.join(", ")}</p>}</div></li>)}</ul></section>
        <section className="space-y-3"><H2>Goals</H2>
          {!w.rooms.length ? <p className="text-sm">Add a room first on the <Link className="font-semibold text-brand" href="/app/rooms">Rooms</Link> page.</p> : (
            <form className="card grid gap-3 p-4 sm:grid-cols-[1fr_120px_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); const t = Number(target); if (!roomId || !(t > 0 && t <= 100)) return; const room = w.rooms.find((r) => r.id === roomId)!; update((x) => { x.goals.unshift({ id: newId(), roomId, title: `${room.name}: reach a health score of ${t}`, kind: "score", target: t, createdAt: new Date().toISOString() }); audit(x, `Goal set for ${room.name}: score ${t}`); }); }}>
              <Field label="Room" htmlFor="gr"><RoomSelect w={w} value={roomId} onChange={setRoomId} allowNone={false} id="gr" /></Field><Field label="Target score" htmlFor="gt"><input id="gt" type="number" min={1} max={100} className="input" value={target} onChange={(e) => setTarget(e.target.value)} /></Field><button className="btn-primary"><Target className="h-4 w-4" /> Set goal</button></form>)}
          <ul className="space-y-2">{w.goals.map((g) => { const p = goalProgress(w, as ?? [], g); return <li key={g.id} className="card p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{g.title}</p><p className="text-sm text-muted">{p.current === null ? "No score yet" : `Now ${p.current}/100`} · {p.note}</p></div><button className="btn-ghost btn-sm" onClick={() => update((x) => { x.goals = x.goals.filter((y) => y.id !== g.id); })}>Remove</button></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={g.target} aria-valuenow={p.current ?? 0} aria-label={g.title}><div className={`h-full rounded-full ${p.done ? "bg-good" : "bg-brand"}`} style={{ width: `${Math.min(100, ((p.current ?? 0) / g.target) * 100)}%` }} /></div></li>; })}</ul>
          {!w.goals.length && <p className="text-sm text-muted">No goals yet.</p>}</section>
      </div>
    </>
  );
}
