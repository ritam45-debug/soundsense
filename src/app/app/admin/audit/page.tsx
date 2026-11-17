"use client";
import { useState } from "react";
import { Empty, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { fmtDate, useApi, useMe } from "@/lib/client";

export default function Page() {
  const me = useMe().data!.user; const [action, setAction] = useState("");
  const { data, error } = useApi<any>(me.role === "admin" ? `/api/admin/audit${action ? `?action=${encodeURIComponent(action)}` : ""}` : null);
  if (me.role !== "admin") return <ErrorBox error="Administrators only." />;
  return (
    <>
      <PageHeader title="Audit log" sub="Who did what, and when. Sign-ins, account changes, report issuing, price edits and more. Entries cannot be edited." />
      <label className="mb-4 block max-w-xs text-xs font-semibold">Filter by action prefix<input className="input mt-1" placeholder="e.g. auth. or booking." value={action} onChange={(e) => setAction(e.target.value)} /></label>
      {error && <ErrorBox error={error} />}{!data && !error && <Spinner />}{data && !data.logs.length && <Empty title="Nothing logged for that filter" />}
      {data?.logs.length > 0 && <div className="card overflow-x-auto"><table className="w-full"><thead><tr><th className="th">When</th><th className="th">Who</th><th className="th">Action</th><th className="th">Target</th><th className="th">Details</th></tr></thead>
        <tbody>{data.logs.map((l: any) => <tr key={l.id} className="border-t border-line"><td className="td whitespace-nowrap text-xs">{fmtDate(l.created_at, true)}</td><td className="td">{l.actor ?? "System"}<br /><span className="text-xs text-muted">{l.actor_role ?? ""} {l.ip ? `· ${l.ip}` : ""}</span></td><td className="td font-semibold">{l.action}</td><td className="td text-xs">{l.entity}<br /><span className="break-all text-muted">{l.entity_id}</span></td><td className="td max-w-[320px] text-xs text-muted"><span className="line-clamp-3 break-all">{l.meta && Object.keys(l.meta).length ? JSON.stringify(l.meta) : ""}</span></td></tr>)}</tbody></table></div>}
    </>
  );
}
