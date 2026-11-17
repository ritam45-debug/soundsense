"use client";
import Link from "next/link";
import { useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Field, Notice } from "@/components/ui";
import { call } from "@/lib/client";

export default function Page() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<null | { message: string; devLink?: string }>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try { setDone(await call("/api/auth/password", { body: { email } })); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <AuthShell title="Reset your password" sub="Enter your e-mail and we'll send a link that works for 60 minutes." foot={<Link href="/login" className="font-semibold text-brand underline">Back to sign in</Link>}>
      {done ? (
        <div className="space-y-4">
          <Notice tone="good">{done.message}</Notice>
          {done.devLink && <Notice tone="warn" title="Development mode">No mail server is configured: <a className="break-all font-semibold underline" href={done.devLink}>{done.devLink}</a></Notice>}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="E-mail" htmlFor="email"><input id="email" type="email" className="input" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
        </form>
      )}
    </AuthShell>
  );
}
