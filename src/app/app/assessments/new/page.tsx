"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ErrorBox, Spinner } from "@/components/ui";
import { call, useMe } from "@/lib/client";

export default function Page() {
  const router = useRouter(); const role = useMe().data!.user.role; const ran = useRef(false); const [err, setErr] = useState("");
  useEffect(() => {
    if (ran.current || role !== "customer") return; ran.current = true;
    call<{ assessment: { id: string } }>("/api/assessments", { body: {} }).then((r) => router.replace(`/app/assessments/${r.assessment.id}`)).catch((e) => setErr(e.message));
  }, [role, router]);
  if (role !== "customer") return <ErrorBox error="Only customers start assessments. Open a case from the case list instead." />;
  return err ? <ErrorBox error={err} /> : <Spinner label="Creating your assessment…" />;
}
