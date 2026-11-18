"use client";
import Link from "next/link";
import { useState } from "react";
import { FlaskConical, Plus, Search } from "lucide-react";
import { Badge, Empty, ErrorBox, PageHeader, Spinner, statusLabel, statusTone } from "@/components/ui";
import { assessmentHref, fmtDate, useApi } from "@/lib/client";
import { CATEGORY_SHORT } from "@/lib/acoustics/types";

export default function Page() {
  const [q, setQ] = useState(""); const [status, setStatus] = useState("");
  const { data, error, isLoading, mutate } = useApi<any>(`/api/assessments?limit=100${status ? `&status=${status}` : ""}`);
  const items: any[] = (data?.items ?? []).filter((a: any) => !q || `${a.ref} ${a.title ?? ""} ${a.organisation ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader title="Assessments" sub="Every assessment you have started in this browser, with its diagnosis and report."
        actions={<><Link href="/app/assessments/new?sample=1" className="btn-secondary"><FlaskConical className="h-4 w-4" /> Try a sample</Link><Link href="/app/assessments/new" className="btn-primary"><Plus className="h-4 w-4" /> New assessment</Link></>} />
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <label className="min-w-[200px] flex-1 text-xs font-semibold">Search
          <span className="relative mt-1 block"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted" /><input className="input !pl-9" placeholder="Reference or title" value={q} onChange={(e) => setQ(e.target.value)} /></span></label>
        <label className="text-xs font-semibold">Status<select className="input mt-1" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="draft">Draft</option><option value="submitted">Submitted</option></select></label>
      </div>
      {isLoading && <Spinner />}
      {error && <ErrorBox error={error} retry={() => mutate()} />}
      {data && !items.length && <Empty title="No assessments found" action={<Link href="/app/assessments/new" className="btn-primary btn-sm">Start an assessment</Link>}>{q || status ? "Try clearing the search." : "Nothing here yet."}</Empty>}
      {items.length > 0 && (
        <ul className="space-y-3">{items.map((a: any) => (
          <li key={a.id}><Link href={assessmentHref(a.id)} className="card block p-4 hover:bg-raised/40">
            <div className="flex items-start justify-between gap-2"><p className="font-semibold">{a.title || a.ref}</p><Badge tone={statusTone(a.status)}>{statusLabel(a.status)}</Badge></div>
            <p className="mt-0.5 text-xs text-muted">{a.ref}{a.organisation ? ` · ${a.organisation}` : ""} · {fmtDate(a.updated_at)}</p>
            {a.primary_category && <p className="mt-2 text-sm">{CATEGORY_SHORT[a.primary_category as keyof typeof CATEGORY_SHORT] ?? a.primary_category} · {a.confidence_level} confidence{a.expert_inspection ? " · inspection advised" : ""}</p>}</Link></li>))}</ul>
      )}
    </>
  );
}
