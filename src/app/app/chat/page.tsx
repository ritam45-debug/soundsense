"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { ChatPanel, Msg } from "@/components/ChatPanel";
import { Badge, Confirm, Notice, PageHeader, Spinner, useToast } from "@/components/ui";
import { call, fmtDate, useApi } from "@/lib/client";

function Inner() {
  const sp = useSearchParams(); const toast = useToast();
  const [cid, setCid] = useState<string | null>(sp.get("c")); const [aid, setAid] = useState(sp.get("assessment") ?? "");
  const [del, setDel] = useState<any>(null);
  const list = useApi<any>("/api/chat"); const as = useApi<any>("/api/assessments?limit=50");
  const thread = useApi<any>(cid ? `/api/chat/${cid}` : null, { refreshInterval: 15000 });
  const msgs: Msg[] = useMemo(() => thread.data?.messages?.map((m: any) => ({ role: m.role, content: m.content, source: m.source })) ?? [], [thread.data]);
  const conv = thread.data?.conversation; const sel = (as.data?.items ?? []).find((a: any) => a.id === aid);
  const full = useApi<any>(aid ? `/api/assessments/${aid}` : null);
  const shared = full.data?.assessment?.share_with_chat === true;
  useEffect(() => { if (conv?.assessment_id && !aid) setAid(conv.assessment_id); }, [conv, aid]);

  async function setShare(v: boolean) { try { await call(`/api/assessments/${aid}`, { method: "PATCH", body: { share_with_chat: v } }); full.mutate(); toast(v ? "The assistant can now read this assessment." : "The assistant can no longer read this assessment."); } catch (e: any) { toast(e.message, "bad"); } }
  return (
    <>
      <PageHeader title="Assistant" sub="Plain-language help with acoustics. The assistant can't see your assessment unless you allow it below." />
      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <button className="btn-primary w-full" onClick={() => setCid(null)}><Plus className="h-4 w-4" /> New chat</button>
          <section className="card p-3"><h2 className="mb-2 text-xs font-semibold text-muted">Your chats</h2>
            {!list.data ? <Spinner /> : !list.data.conversations.length ? <p className="p-2 text-sm text-muted">No chats yet.</p> : (
              <ul>{list.data.conversations.map((c: any) => (
                <li key={c.id} className="group flex items-center gap-1"><button className={`min-h-[44px] flex-1 truncate rounded-lg px-2 text-left text-sm ${cid === c.id ? "bg-brand-soft font-semibold text-brand" : "hover:bg-raised"}`} onClick={() => setCid(c.id)}>{c.title || "Conversation"}<span className="block text-[11px] font-normal text-muted">{fmtDate(c.updated_at)}{c.escalated ? " · with a consultant" : ""}</span></button>
                  <button aria-label="Delete chat" className="btn-ghost btn-sm" onClick={() => setDel(c)}><Trash2 className="h-4 w-4" /></button></li>))}</ul>)}</section>
          <section className="card p-3 text-sm"><h2 className="mb-2 text-xs font-semibold text-muted">Assessment access</h2>
            <select className="input" aria-label="Assessment to discuss" value={aid} onChange={(e) => setAid(e.target.value)}><option value="">None – general questions</option>{(as.data?.items ?? []).filter((a: any) => a.status !== "draft").map((a: any) => <option key={a.id} value={a.id}>{a.ref}</option>)}</select>
            {aid && <label className="mt-3 flex items-start gap-2"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-[rgb(var(--brand))]" checked={shared} onChange={(e) => setShare(e.target.checked)} /><span>Let the assistant read {sel?.ref ?? "this assessment"} for more relevant answers</span></label>}
            <p className="mt-2 text-xs text-muted">{aid ? (shared ? "Access is ON. Turn it off any time." : "Access is OFF – the assistant only knows what you type here.") : "Pick an assessment only if you want the assistant to use it."}</p></section>
        </aside>
        <section>
          {conv?.escalated && <div className="mb-3"><Notice tone="good">A SoundSense consultant is handling this chat. Replies appear here.</Notice></div>}
          {cid && !thread.data ? <Spinner /> : <ChatPanel key={cid ?? "new"} conversationId={cid} assessmentId={aid || undefined} initial={msgs} escalated={conv?.escalated} onConversation={(id) => { setCid(id); list.mutate(); }} onEscalated={() => { thread.mutate(); list.mutate(); }} />}
          <p className="mt-2 text-xs text-muted">The assistant can be wrong. It gives general guidance, not a diagnosis – your assessment results and consultants are the reliable source. <Badge>Prices it mentions are indicative</Badge></p>
        </section>
      </div>
      <Confirm open={!!del} title="Delete this chat?" danger confirmLabel="Delete" onClose={() => setDel(null)} onConfirm={async () => { try { await call(`/api/chat/${del.id}`, { method: "DELETE" }); if (cid === del.id) setCid(null); setDel(null); list.mutate(); } catch (e: any) { toast(e.message, "bad"); } }}>The conversation and its messages will be permanently removed.</Confirm>
    </>
  );
}
export default function Page() { return <Suspense fallback={<Spinner />}><Inner /></Suspense>; }
