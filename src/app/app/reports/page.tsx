"use client";
import Link from "next/link";
import { Download } from "lucide-react";
import { Badge, Empty, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { fmtDate, useApi, useMe } from "@/lib/client";

export default function Page() {
  const role = useMe().data!.user.role;
  const { data, error, mutate } = useApi<any>("/api/reports");
  return (
    <>
      <PageHeader title="Reports" sub="Every report is a saved snapshot: later edits to products or prices never change a report you already hold." />
      {error && <ErrorBox error={error} retry={() => mutate()} />}
      {!data && !error && <Spinner />}
      {data && !data.reports.length && <Empty title="No reports yet">A preliminary report is created as soon as you submit an assessment.</Empty>}
      {data?.reports.length > 0 && (
        <ul className="card divide-y divide-line">{data.reports.map((r: any) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0"><p className="font-semibold"><Link href={`/app/assessments/${r.assessment_id}`} className="hover:underline">{r.title || r.ref}</Link> <span className="font-normal text-muted">· v{r.version}</span></p>
              <p className="text-xs text-muted">{r.ref}{role !== "customer" && ` · ${r.customer_name}`} · {fmtDate(r.created_at, true)}</p></div>
            <div className="flex items-center gap-2"><Badge tone={r.status === "final" ? "good" : "neutral"}>{r.status === "final" ? "Final" : "Preliminary"}</Badge><a className="btn-secondary btn-sm" href={`/api/reports/${r.id}/pdf`}><Download className="h-4 w-4" /> PDF</a></div>
          </li>))}</ul>
      )}
    </>
  );
}
