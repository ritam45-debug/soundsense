"use client";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Notice, Spinner } from "@/components/ui";
import { call } from "@/lib/client";

function Check() {
  const token = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("token");
  const [state, setState] = useState<"working" | "ok" | "fail">(token ? "working" : "fail");
  const [msg, setMsg] = useState(token ? "" : "This verification link is incomplete.");
  const ran = useRef(false);
  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // tokens are single-use: never submit twice (React strict mode)
    call("/api/auth/verify", { body: { token } }).then(() => setState("ok")).catch((e) => { setState("fail"); setMsg(e.message); });
  }, [token]);
  return (
    <AuthShell title="E-mail verification">
      {state === "working" && <Spinner label="Verifying…" />}
      {state === "ok" && <><Notice tone="good">Your e-mail is verified.</Notice><Link href="/login?verified=1" className="btn-primary mt-6 w-full">Continue to sign in</Link></>}
      {state === "fail" && <><Notice tone="warn" title="We couldn't verify that link">{msg} Links expire after 24 hours and work once. Sign in and choose “send the verification e-mail again”.</Notice><Link href="/login" className="btn-secondary mt-6 w-full">Go to sign in</Link></>}
    </AuthShell>
  );
}
export default function Page() { return <Suspense><Check /></Suspense>; }
