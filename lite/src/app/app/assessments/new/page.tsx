"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FlaskConical, Plus } from "lucide-react";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { assessmentHref, call } from "@/lib/client";
import { SCENARIOS } from "@/lib/local/samples";

function Inner() {
  const router = useRouter(); const sp = useSearchParams(); const ran = useRef(false);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState("");
  const start = async (sample?: string) => {
    setBusy(sample ?? "blank");
    try { const r = await call<{ assessment: { id: string } }>("/api/assessments", { body: sample ? { sample } : {} }); router.replace(assessmentHref(r.assessment.id)); }
    catch (e: any) { setErr(e.message); setBusy(""); }
  };
  // A plain "New assessment" link goes straight to the questionnaire; "?sample=1" shows the sample picker.
  const wantsSample = sp.get("sample") === "1";
  useEffect(() => { if (ran.current || wantsSample) return; ran.current = true; start(); }, [wantsSample]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!wantsSample) return err ? <ErrorBox error={err} /> : <Spinner label="Creating your assessment…" />;
  return (
    <>
      <PageHeader title="Try a sample" sub="Each sample is a made-up room with answers already filled in, so you can see a full diagnosis, recommendations and PDF report straight away. Nothing is real data." />
      {err && <ErrorBox error={err} />}
      <ul className="grid gap-3 sm:grid-cols-2">{Object.values(SCENARIOS).map((s) => (
        <li key={s.id}><button className="card flex w-full items-start gap-3 p-4 text-left hover:bg-raised/40 disabled:opacity-60" disabled={!!busy} onClick={() => start(s.id)}>
          <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden /><span><span className="block font-semibold">{s.name}</span><span className="text-xs text-muted">{busy === s.id ? "Opening…" : "Open the finished example"}</span></span></button></li>))}</ul>
      <div className="mt-6"><button className="btn-secondary" disabled={!!busy} onClick={() => start()}><Plus className="h-4 w-4" /> Start my own instead</button></div>
    </>
  );
}
export default function Page() { return <Suspense fallback={<Spinner />}><Inner /></Suspense>; }
