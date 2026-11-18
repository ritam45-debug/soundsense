"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AssessmentView } from "@/components/AssessmentView";
import { Wizard } from "@/components/Wizard";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { useApi } from "@/lib/client";

function Inner() {
  const id = useSearchParams().get("id") ?? "";
  const { data, error, mutate } = useApi<any>(id ? `/api/assessments/${id}` : null);
  if (!id) return <ErrorBox error="No assessment was chosen. Open one from the Assessments list." />;
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Spinner />;
  const a = data.assessment;
  if (a.status === "draft")
    return (<><PageHeader title="Acoustic assessment" sub={`${a.ref} · Your answers are saved on this device as you go – you can leave and come back.`} /><Wizard assessment={a} room={data.room} onDone={() => mutate()} /></>);
  return <AssessmentView full={data} role="customer" uid="local" refresh={() => mutate()} />;
}
export default function Page() { return <Suspense fallback={<Spinner />}><Inner /></Suspense>; }
