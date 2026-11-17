"use client";
import { useParams } from "next/navigation";
import { AssessmentView } from "@/components/AssessmentView";
import { Wizard } from "@/components/Wizard";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { useApi, useMe } from "@/lib/client";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const me = useMe().data!.user;
  const { data, error, mutate } = useApi<any>(`/api/assessments/${id}`);
  if (error) return <ErrorBox error={error.status === 404 ? "We couldn't find that assessment – it may belong to someone else or have been removed." : error} />;
  if (!data) return <Spinner />;
  const a = data.assessment;
  if (a.status === "draft" && me.role === "customer" && a.customer_id === me.id)
    return (<><PageHeader title="Acoustic assessment" sub={`${a.ref} · Your answers are saved as you go – you can leave and come back.`} /><Wizard assessment={a} room={data.room} onDone={() => mutate()} /></>);
  return <AssessmentView full={data} role={me.role} uid={me.id} refresh={() => mutate()} />;
}
