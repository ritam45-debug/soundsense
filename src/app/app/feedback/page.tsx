"use client";
import { useState } from "react";
import { Empty, Field, Notice, PageHeader, Stars, useToast } from "@/components/ui";
import { call, useApi, useMe } from "@/lib/client";

export default function Page() {
  const role = useMe().data!.user.role; const toast = useToast();
  const { data } = useApi<any>(role === "customer" ? "/api/assessments?limit=50" : null);
  const [aid, setAid] = useState(""); const [s, setS] = useState({ overall: 0, usefulness: 0, consultation: 0, improvement: 0, valueForMoney: 0 });
  const [improveText, setImprove] = useState(""); const [comments, setComments] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [err, setErr] = useState("");
  if (role !== "customer") return <><PageHeader title="Feedback" /><Empty title="Customers leave feedback here">Admins can read all responses under Feedback in the admin menu.</Empty></>;
  const items = (data?.items ?? []).filter((a: any) => a.status !== "draft");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!s.overall || !s.usefulness || !s.valueForMoney) return setErr("Please give the three starred ratings (overall, usefulness, value).");
    setBusy(true);
    try { await call("/api/feedback", { body: { assessmentId: aid || null, overall: s.overall, usefulness: s.usefulness, valueForMoney: s.valueForMoney, ...(s.consultation && { consultation: s.consultation }), ...(s.improvement && { improvement: s.improvement }), improveText: improveText || undefined, comments: comments || undefined } }); setDone(true); toast("Thank you – feedback received."); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  if (done) return <><PageHeader title="Thank you" /><Notice tone="good">Your feedback helps us make SoundSense more useful. We read every response.</Notice></>;
  return (
    <>
      <PageHeader title="Feedback" sub="Two minutes. Tell us honestly – including what didn't work." />
      <form onSubmit={submit} className="card max-w-2xl space-y-5 p-5" noValidate>
        <Field label="Which assessment is this about?" htmlFor="fa"><select id="fa" className="input" value={aid} onChange={(e) => setAid(e.target.value)}><option value="">General feedback</option>{items.map((a: any) => <option key={a.id} value={a.id}>{a.ref} – {a.title || "Untitled"}</option>)}</select></Field>
        {([["overall", "Overall experience *"], ["usefulness", "How useful were the diagnosis and recommendations? *"], ["valueForMoney", "How good is the value of the suggested solutions? *"], ["consultation", "Consultation experience (if you had one)"], ["improvement", "Improvement in sound after changes (if you made any)"]] as const).map(([k, l]) => (
          <div key={k}><p className="label">{l}</p><Stars label={l} value={s[k]} onChange={(n) => setS({ ...s, [k]: n })} /></div>))}
        <Field label="What could we improve?" htmlFor="fi"><textarea id="fi" className="input min-h-[80px] py-2" value={improveText} onChange={(e) => setImprove(e.target.value)} /></Field>
        <Field label="Anything else?" htmlFor="fc"><textarea id="fc" className="input min-h-[80px] py-2" value={comments} onChange={(e) => setComments(e.target.value)} /></Field>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn-primary" disabled={busy}>{busy ? "Sending…" : "Send feedback"}</button>
      </form>
    </>
  );
}
