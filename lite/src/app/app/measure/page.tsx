"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MicMeter } from "@/components/MicMeter";
import { RoomCalculator } from "@/components/RoomCalculator";
import { Notice, PageHeader, Spinner, Tabs } from "@/components/ui";
import { assessmentHref, useApi, useMe } from "@/lib/client";
import { ENVIRONMENTS } from "@/lib/acoustics/questionnaire";

function Inner() {
  const sp = useSearchParams(); const router = useRouter();
  const role = useMe().data.user.role;
  const aid = sp.get("assessment") ?? "";
  const [tab, setTab] = useState<"mic" | "room">("mic");
  const [env, setEnv] = useState("conference_room");
  const { data } = useApi<any>(role === "customer" ? "/api/assessments?limit=50" : null);
  const mine = (data?.items ?? []).filter((a: any) => a.status !== "completed");
  return (
    <>
      <PageHeader title="Measure & calculate" sub="Check how loud your room really is, and estimate how long sound lingers in it. Nothing is stored unless you save it to an assessment." />
      {role === "customer" && (
        <div className="card mb-5 flex flex-wrap items-end gap-3 p-3">
          <label className="min-w-[240px] flex-1 text-xs font-semibold">Save results to
            <select className="input mt-1" value={aid} onChange={(e) => router.replace(e.target.value ? `/app/measure?assessment=${e.target.value}` : "/app/measure")}>
              <option value="">Don&apos;t save (just try it)</option>
              {mine.map((a: any) => <option key={a.id} value={a.id}>{a.ref} – {a.title || "Untitled"} ({a.status})</option>)}
            </select></label>
          {!mine.length && <Link href="/app/assessments/new" className="btn-secondary btn-sm">Start an assessment first</Link>}
          {aid && <Link href={assessmentHref(aid)} className="btn-ghost btn-sm">Back to assessment</Link>}
        </div>
      )}
      <Tabs tabs={[{ id: "mic", label: "Sound check (microphone)" }, { id: "room", label: "Room calculator" }]} value={tab} onChange={setTab} />
      {tab === "mic" ? <MicMeter assessmentId={aid || undefined} /> : (
        <>
          <div className="mb-4 max-w-sm"><label className="label" htmlFor="env">Type of room</label>
            <select id="env" className="input" value={env} onChange={(e) => setEnv(e.target.value)}>{ENVIRONMENTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          <RoomCalculator environment={env} assessmentId={aid || undefined} />
        </>
      )}
      <div className="mt-6"><Notice tone="info">Your microphone audio never leaves your device. Only summary statistics (levels over time) are saved if you choose to save a recording.</Notice></div>
    </>
  );
}
export default function Page() { return <Suspense fallback={<Spinner />}><Inner /></Suspense>; }
