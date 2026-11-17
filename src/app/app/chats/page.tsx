"use client";
import { useMemo, useState } from "react";
import { ChatPanel, Msg } from "@/components/ChatPanel";
import { Badge, Empty, PageHeader, Spinner, useToast } from "@/components/ui";
import { call, fmtDate, useApi, useMe } from "@/lib/client";

export default function Page() {
  const role = useMe().data!.user.role; const toast = useToast();
  const [cid, setCid] = useState<string | null>(null); const [only, setOnly] = useState(true);
  const list = useApi<any>("/api/chat", { refreshInterval: 30000 });
  const thread = useApi<any>(cid ? `/api/chat/${cid}` : null, { refreshInterval: 10000 });
  const items = (list.data?.conversations ?? []).filter((c: any) => !only || c.escalated);
  const msgs: Msg[] = useMemo(() => thread.data?.messages?.map((m: any) => ({ role: m.role, content: m.content, source: m.source })) ?? [], [thread.data]);
  const conv = thread.data?.conversation;
  if (role === "customer") return null;
  return (
    <>
      <PageHeader title="Customer chats" sub="Conversations customers escalated to a person. You see a chat's content only because it was handed to the team." />
      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="card p-3"><label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[rgb(var(--brand))]" checked={only} onChange={(e) => setOnly(e.target.checked)} /> Awaiting a consultant only</label>
          {!list.data ? <Spinner /> : !items.length ? <p className="p-2 text-sm text-muted">Nothing waiting.</p> : <ul>{items.map((c: any) => <li key={c.id}><button onClick={() => setCid(c.id)} className={`min-h-[56px] w-full rounded-lg px-2 py-1.5 text-left text-sm ${cid === c.id ? "bg-brand-soft" : "hover:bg-raised"}`}><span className="flex items-center justify-between gap-2"><span className="truncate font-semibold">{c.customer}</span>{c.escalated && <Badge tone="warn">Waiting</Badge>}</span><span className="block truncate text-xs text-muted">{c.title} · {fmtDate(c.updated_at, true)}</span></button></li>)}</ul>}</aside>
        <section>
          {!cid ? <Empty title="Select a chat" /> : !thread.data ? <Spinner /> : (
            <>
              <div className="mb-3 flex items-center justify-between"><p className="font-semibold">{conv?.title}</p>
                {conv?.escalated && <button className="btn-secondary btn-sm" onClick={async () => { try { await call(`/api/chat/${cid}`, { body: { action: "resolve" } }); toast("Marked resolved."); thread.mutate(); list.mutate(); } catch (e: any) { toast(e.message, "bad"); } }}>Mark resolved</button>}</div>
              <ChatPanel key={cid + msgs.length} initial={msgs} staffReply={conv?.escalated ? async (t) => { await call(`/api/chat/${cid}`, { body: { action: "reply", content: t } }); thread.mutate(); } : undefined} height="h-[55vh]" />
              {!conv?.escalated && <p className="mt-2 text-sm text-muted">This chat is not escalated, so you can read but not reply.</p>}
            </>)}
        </section>
      </div>
    </>
  );
}
