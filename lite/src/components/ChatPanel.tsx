"use client";
import { useEffect, useRef, useState } from "react";
import { Bot, Send, UserRound, LifeBuoy } from "lucide-react";
import { Badge, Notice, useToast } from "./ui";
import { call } from "@/lib/client";

export interface Msg { id?: string; role: "user" | "assistant" | "system"; content: string; source?: string | null }
const SRC: Record<string, { label: string; tone: "brand" | "warn" | "good" }> = {
  llm: { label: "AI assistant", tone: "brand" },
  fallback: { label: "Built-in guidance · rule-based, not AI", tone: "good" },
  human: { label: "SoundSense consultant", tone: "good" },
};
const STARTERS = ["Why does my meeting room echo?", "Do I need a new microphone?", "What does RT60 mean?", "How loud is too loud for a meeting room?"];

const NO_MESSAGES: Msg[] = []; // stable identity: a fresh [] default would re-run the sync effect every render and wipe the thread

/** Shared chat UI. guest = stateless (no sign-in); otherwise messages are stored under `conversationId`. */
export function ChatPanel({ guest, conversationId, assessmentId, initial = NO_MESSAGES, escalated, onConversation, onEscalated, staffReply, height = "h-[60vh]" }: {
  guest?: boolean; conversationId?: string | null; assessmentId?: string; initial?: Msg[]; escalated?: boolean;
  onConversation?: (id: string) => void; onEscalated?: () => void; staffReply?: (text: string) => Promise<void>; height?: string;
}) {
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const [suggest, setSuggest] = useState(false); const [signIn, setSignIn] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => setMsgs(initial), [initial]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);

  async function send(t = text) {
    t = t.trim(); if (!t || busy) return;
    setText(""); setMsgs((m) => [...m, { role: "user", content: t }]);
    if (staffReply) { setBusy(true); try { await staffReply(t); } catch (e: any) { toast(e.message, "bad"); } finally { setBusy(false); } return; }
    setBusy(true);
    try {
      const history = msgs.filter((m) => m.role !== "system").slice(-10).map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      const r = await call<any>("/api/chat", { body: { message: t, ...(guest ? { guestHistory: history } : { conversationId: conversationId ?? undefined, assessmentId }) } });
      if (r.conversationId && r.conversationId !== conversationId) onConversation?.(r.conversationId);
      if (r.reply) setMsgs((m) => [...m, { role: "assistant", content: r.reply.content, source: r.reply.source }]);
      setSuggest(!!r.suggestEscalation); setSignIn(!!r.signInForHuman);
    } catch (e: any) { toast(e.message, "bad"); setMsgs((m) => m.slice(0, -1)); setText(t); } finally { setBusy(false); }
  }
  async function escalate() {
    if (!conversationId) return;
    try { await call(`/api/chat/${conversationId}`, { body: { action: "escalate" } }); toast("Passed to the team – they'll reply here."); setSuggest(false); onEscalated?.(); } catch (e: any) { toast(e.message, "bad"); }
  }
  return (
    <div className="flex flex-col">
      <div className={`${height} min-h-[280px] space-y-3 overflow-y-auto rounded-xl border border-line bg-surface p-3 sm:p-4`} role="log" aria-live="polite" aria-label="Conversation">
        {!msgs.length && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <Bot className="h-8 w-8 text-brand" /><div><p className="font-display font-semibold">Ask about sound in your space</p><p className="mx-auto mt-1 max-w-sm text-sm text-muted">I can explain echo, noise, microphones and speakers in plain language, and help you decide what to check first. I won&apos;t push products.</p></div>
            <div className="flex flex-wrap justify-center gap-2">{STARTERS.map((s) => <button key={s} className="btn-secondary btn-sm" onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => m.role === "system" ? <p key={i} className="rounded-lg bg-raised p-2.5 text-center text-xs text-muted">{m.content}</p> : (
          <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">{m.source === "human" ? <UserRound className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</span>}
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "bg-brand text-brand-ink" : "bg-raised"}`}>
              {m.role === "assistant" && m.source && SRC[m.source] && <p className="mb-1"><Badge tone={SRC[m.source].tone}>{SRC[m.source].label}</Badge></p>}
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          </div>))}
        {busy && !staffReply && <p className="text-sm text-muted">Thinking…</p>}
        <div ref={end} />
      </div>
            {suggest && !guest && !escalated && conversationId && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand/30 bg-brand-soft p-3 text-sm"><span>Would you like a person to take over this chat?</span><button className="btn-primary btn-sm" onClick={escalate}><LifeBuoy className="h-4 w-4" /> Ask a consultant</button></div>}
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="mt-3 flex gap-2">
        <label className="sr-only" htmlFor="chat-in">Your message</label>
        <textarea id="chat-in" rows={1} className="input min-h-[44px] flex-1 resize-none py-2.5" placeholder={staffReply ? "Reply to the customer…" : "Type your question…"} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="btn-primary" disabled={busy || !text.trim()} aria-label="Send"><Send className="h-4 w-4" /></button>
      </form>
    </div>
  );
}
