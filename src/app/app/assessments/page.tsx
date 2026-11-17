"use client";
import Link from "next/link";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Badge, Empty, ErrorBox, PageHeader, Spinner, statusLabel, statusTone } from "@/components/ui";
import { fmtDate, useApi, useMe } from "@/lib/client";
import { CATEGORY_IDS, CATEGORY_SHORT } from "@/lib/acoustics/types";

const PAGE = 15;
export default function Page() {
  const role = useMe().data!.user.role;
  const [q, setQ] = useState(""); const [status, setStatus] = useState(""); const [category, setCategory] = useState(""); const [page, setPage] = useState(0);
  const qs = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE), ...(q && { q }), ...(status && { status }), ...(category && { category }) });
  const { data, error, isLoading, mutate } = useApi<any>(`/api/assessments?${qs}`);
  const reset = (fn: () => void) => { fn(); setPage(0); };
  return (
    <>
      <PageHeader title={role === "consultant" ? "My cases" : "Assessments"} sub={role === "customer" ? "Every assessment you have started, with its diagnosis and report." : role === "consultant" ? "Cases assigned to you." : "All assessments on the platform."}
        actions={role === "customer" ? <Link href="/app/assessments/new" className="btn-primary"><Plus className="h-4 w-4" /> New assessment</Link> : undefined} />
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <label className="min-w-[200px] flex-1 text-xs font-semibold">Search
          <span className="relative mt-1 block"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted" /><input className="input !pl-9" placeholder={role === "customer" ? "Reference or title" : "Reference, title, customer or organisation"} value={q} onChange={(e) => reset(() => setQ(e.target.value))} /></span></label>
        <label className="text-xs font-semibold">Status<select className="input mt-1" value={status} onChange={(e) => reset(() => setStatus(e.target.value))}><option value="">All</option>{["draft", "submitted", "in_review", "completed"].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label>
        <label className="text-xs font-semibold">Diagnosed category<select className="input mt-1" value={category} onChange={(e) => reset(() => setCategory(e.target.value))}><option value="">All</option>{[...CATEGORY_IDS, "multiple" as const].map((c) => <option key={c} value={c}>{CATEGORY_SHORT[c]}</option>)}</select></label>
      </div>
      {isLoading && <Spinner />}
      {error && <ErrorBox error={error} retry={() => mutate()} />}
      {data && !data.items.length && <Empty title="No assessments found" action={role === "customer" ? <Link href="/app/assessments/new" className="btn-primary btn-sm">Start an assessment</Link> : undefined}>{q || status || category ? "Try clearing the filters." : "Nothing here yet."}</Empty>}
      {data?.items.length > 0 && (
        <>
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full"><thead><tr><th className="th">Reference</th><th className="th">Title / organisation</th>{role !== "customer" && <th className="th">Customer</th>}<th className="th">Diagnosis</th><th className="th">Status</th>{role === "admin" && <th className="th">Consultant</th>}<th className="th">Updated</th></tr></thead>
              <tbody>{data.items.map((a: any) => (
                <tr key={a.id} className="border-t border-line hover:bg-raised/50">
                  <td className="td"><Link className="font-semibold text-brand" href={`/app/assessments/${a.id}`}>{a.ref}</Link></td>
                  <td className="td">{a.title || "—"}<br /><span className="text-xs text-muted">{a.organisation}</span></td>
                  {role !== "customer" && <td className="td">{a.customer_name}</td>}
                  <td className="td">{a.primary_category ? <>{CATEGORY_SHORT[a.primary_category as keyof typeof CATEGORY_SHORT]}<br /><span className="text-xs text-muted">{a.confidence_level} confidence{a.expert_inspection ? " · inspection advised" : ""}</span></> : <span className="text-muted">—</span>}</td>
                  <td className="td"><Badge tone={statusTone(a.status)}>{statusLabel(a.status)}</Badge></td>
                  {role === "admin" && <td className="td">{a.consultant_name ?? <span className="text-muted">Unassigned</span>}</td>}
                  <td className="td whitespace-nowrap">{fmtDate(a.updated_at)}</td></tr>))}</tbody></table>
          </div>
          <ul className="space-y-3 md:hidden">{data.items.map((a: any) => (
            <li key={a.id}><Link href={`/app/assessments/${a.id}`} className="card block p-4">
              <div className="flex items-start justify-between gap-2"><p className="font-semibold">{a.title || a.ref}</p><Badge tone={statusTone(a.status)}>{statusLabel(a.status)}</Badge></div>
              <p className="mt-0.5 text-xs text-muted">{a.ref}{role !== "customer" && ` · ${a.customer_name}`} · {fmtDate(a.updated_at)}</p>
              {a.primary_category && <p className="mt-2 text-sm">{CATEGORY_SHORT[a.primary_category as keyof typeof CATEGORY_SHORT]} · {a.confidence_level} confidence</p>}</Link></li>))}</ul>
          <div className="mt-4 flex items-center justify-between text-sm"><span className="text-muted">{page * PAGE + 1}–{Math.min(data.total, (page + 1) * PAGE)} of {data.total}</span>
            <div className="flex gap-2"><button className="btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button className="btn-secondary btn-sm" disabled={(page + 1) * PAGE >= data.total} onClick={() => setPage(page + 1)}>Next</button></div></div>
        </>
      )}
    </>
  );
}
