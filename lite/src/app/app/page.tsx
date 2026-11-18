"use client";
import Link from "next/link";
import { ClipboardList, FlaskConical, Plus } from "lucide-react";
import { HBars } from "@/components/Charts";
import { Badge, Empty, PageHeader, Spinner, Stat, statusLabel, statusTone } from "@/components/ui";
import { assessmentHref, fmtDate, useApi } from "@/lib/client";
import { CATEGORY_SHORT } from "@/lib/acoustics/types";

export default function Dashboard() {
  const { data } = useApi<any>("/api/assessments?limit=100");
  if (!data) return <Spinner />;
  const items: any[] = data.items;
  const draft = items.find((a) => a.status === "draft");
  const done = items.filter((a) => a.primary_category);
  const counts = new Map<string, number>();
  for (const a of done) counts.set(a.primary_category, (counts.get(a.primary_category) ?? 0) + 1);
  const dist = [...counts.entries()].map(([k, value]) => ({ label: CATEGORY_SHORT[k as keyof typeof CATEGORY_SHORT] ?? k, value })).sort((a, b) => b.value - a.value);
  return (
    <>
      <PageHeader title="SoundSense Lite" sub="Describe your space, get a likely diagnosis with the evidence behind it, and download a PDF report. No account needed: everything stays on this device."
        actions={<><Link href="/app/assessments/new" className="btn-primary"><Plus className="h-4 w-4" /> {draft ? "Start another assessment" : "Start assessment"}</Link></>} />
      {draft && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand-soft p-4">
          <div><p className="font-semibold">You have an unfinished assessment</p><p className="text-sm text-muted">{draft.ref} · last edited {fmtDate(draft.updated_at)}</p></div>
          <Link href={assessmentHref(draft.id)} className="btn-primary btn-sm">Continue</Link>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Assessments" value={items.length} sub="Saved in this browser" />
        <Stat label="Diagnosed" value={done.length} sub="Submitted, with a diagnosis" />
        <Stat label="Most common cause" value={dist[0]?.label ?? "—"} sub={dist[0] ? `${dist[0].value} of ${done.length}` : "Nothing diagnosed yet"} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="card p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between"><h3 className="font-display text-[15px] font-semibold">Recent assessments</h3><Link className="text-sm font-semibold text-brand" href="/app/assessments">View all</Link></div>
          {!items.length ? (
            <Empty title="No assessments yet" action={<div className="flex flex-wrap justify-center gap-2"><Link href="/app/assessments/new" className="btn-primary btn-sm"><ClipboardList className="h-4 w-4" /> Start your own</Link><Link href="/app/assessments/new?sample=1" className="btn-secondary btn-sm"><FlaskConical className="h-4 w-4" /> Try a sample</Link></div>}>Answer the questionnaire for your own room, or open a ready-made sample to see what a result looks like.</Empty>
          ) : (
            <ul className="divide-y divide-line">{items.slice(0, 6).map((a) => (
              <li key={a.id}><Link href={assessmentHref(a.id)} className="flex items-center justify-between gap-3 py-3 hover:bg-raised/60">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{a.title || a.ref}</p><p className="truncate text-xs text-muted">{a.ref} · {fmtDate(a.updated_at)}</p></div>
                <Badge tone={statusTone(a.status)}>{statusLabel(a.status)}</Badge></Link></li>))}</ul>
          )}
        </section>
        <section className="card p-4 sm:p-5">
          <h3 className="mb-3 font-display text-[15px] font-semibold">Diagnosed problem categories</h3>
          {dist.length ? <HBars data={dist} /> : <p className="text-sm text-muted">Your diagnoses will be charted here.</p>}
        </section>
      </div>
    </>
  );
}
