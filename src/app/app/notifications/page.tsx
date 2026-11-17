"use client";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Empty, PageHeader, Spinner, useToast } from "@/components/ui";
import { call, fmtDate, useApi } from "@/lib/client";

export default function Page() {
  const { data, mutate } = useApi<any>("/api/notifications");
  const toast = useToast();
  const mark = async (id?: string) => { try { await call("/api/notifications", { body: id ? { id } : {} }); mutate(); } catch (e: any) { toast(e.message, "bad"); } };
  return (
    <>
      <PageHeader title="Notifications" actions={data?.unread ? <button className="btn-secondary" onClick={() => mark()}>Mark all as read</button> : undefined} />
      {!data && <Spinner />}
      {data && !data.items.length && <Empty title="You're all caught up"><Bell className="mx-auto mb-1 h-5 w-5" />Booking updates, new remarks and report notices appear here.</Empty>}
      {data?.items.length > 0 && <ul className="card divide-y divide-line">{data.items.map((n: any) => {
        const inner = <><div className="flex items-start gap-3">{!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}<div className="min-w-0"><p className={`text-sm ${n.read_at ? "" : "font-semibold"}`}>{n.title}</p>{n.body && <p className="text-sm text-muted">{n.body}</p>}<p className="mt-0.5 text-xs text-muted">{fmtDate(n.created_at, true)}</p></div></div></>;
        return <li key={n.id}>{n.link ? <Link href={n.link} onClick={() => !n.read_at && mark(n.id)} className="block p-4 hover:bg-raised/60">{inner}</Link> : <button className="block w-full p-4 text-left hover:bg-raised/60" onClick={() => !n.read_at && mark(n.id)}>{inner}</button>}</li>;
      })}</ul>}
    </>
  );
}
