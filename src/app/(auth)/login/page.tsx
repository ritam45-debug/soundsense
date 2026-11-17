"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Field, Notice } from "@/components/ui";
import { call, ClientError } from "@/lib/client";

function Form() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsVerify, setNeedsVerify] = useState(false);
  const [info, setInfo] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(""); setNeedsVerify(false);
    try {
      await call("/api/auth/login", { body: { email, password } });
      const next = sp.get("next");
      router.replace(next && next.startsWith("/app") ? next : "/app");
    } catch (e: any) {
      setErr(e.message);
      if (e instanceof ClientError && e.status === 403) setNeedsVerify(true);
    } finally { setBusy(false); }
  }
  async function resend() {
    try {
      const r = await call<{ message: string; devLink?: string }>("/api/auth/verify", { method: "PUT", body: { email } });
      setInfo(r.message + (r.devLink ? ` (Development mode – no mail server configured: ${r.devLink})` : ""));
    } catch (e: any) { setErr(e.message); }
  }
  return (
    <AuthShell title="Welcome back" sub="Sign in to continue your assessment." foot={<>New to SoundSense? <Link href="/register" className="font-semibold text-brand underline">Create an account</Link></>}>
      {sp.get("verified") && <div className="mb-4"><Notice tone="good">E-mail verified. You can sign in now.</Notice></div>}
      {sp.get("reset") && <div className="mb-4"><Notice tone="good">Password updated. Sign in with your new password.</Notice></div>}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="E-mail" htmlFor="email"><input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password" htmlFor="pw"><input id="pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {err && <p className="err" role="alert">{err}</p>}
        {needsVerify && <button type="button" className="text-sm font-semibold text-brand underline" onClick={resend}>Send the verification e-mail again</button>}
        {info && <p className="text-sm text-muted break-words">{info}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="text-center text-sm"><Link href="/forgot-password" className="font-semibold text-brand underline">Forgot your password?</Link></p>
      </form>
    </AuthShell>
  );
}
export default function Page() { return <Suspense><Form /></Suspense>; }
