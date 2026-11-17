"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Field, Notice } from "@/components/ui";
import { call } from "@/lib/client";

function Form() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) return setErr("The two passwords do not match.");
    setBusy(true); setErr("");
    try { await call("/api/auth/password", { method: "PUT", body: { token, password: pw } }); router.replace("/login?reset=1"); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  if (!token) return <AuthShell title="Link not valid"><Notice tone="warn">This reset link is incomplete. <Link href="/forgot-password" className="font-semibold underline">Request a new one</Link>.</Notice></AuthShell>;
  return (
    <AuthShell title="Choose a new password" sub="You will be signed out of all other devices.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="New password" htmlFor="pw" hint="At least 10 characters, with a letter and a number."><input id="pw" type="password" className="input" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></Field>
        <Field label="Repeat new password" htmlFor="pw2"><input id="pw2" type="password" className="input" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></Field>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Update password"}</button>
      </form>
    </AuthShell>
  );
}
export default function Page() { return <Suspense><Form /></Suspense>; }
