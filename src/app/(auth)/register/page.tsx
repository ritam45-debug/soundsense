"use client";
import Link from "next/link";
import { useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Field, Notice } from "@/components/ui";
import { call, ClientError } from "@/lib/client";

export default function Page() {
  const [f, setF] = useState({ name: "", email: "", password: "", organisation: "", phone: "", consent: false });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { message: string; devLink?: string; needsVerification: boolean }>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(""); setFields({});
    try {
      setDone(await call("/api/auth/register", { body: { ...f, organisation: f.organisation || undefined, phone: f.phone || undefined } }));
    } catch (e: any) {
      setErr(e.message);
      if (e instanceof ClientError) setFields(e.fields);
    } finally { setBusy(false); }
  }

  if (done)
    return (
      <AuthShell title={done.needsVerification ? "Check your inbox" : "You're in"}>
        <Notice tone="good">{done.message}</Notice>
        {done.devLink && (
          <div className="mt-4"><Notice tone="warn" title="Development mode">No mail server is configured, so here is your verification link: <a className="break-all font-semibold underline" href={done.devLink}>{done.devLink}</a></Notice></div>
        )}
        <Link href="/login" className="btn-primary mt-6 w-full">Go to sign in</Link>
      </AuthShell>
    );

  return (
    <AuthShell title="Create your account" sub="Free. Takes about a minute." foot={<>Already registered? <Link href="/login" className="font-semibold text-brand underline">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Full name" htmlFor="name" error={fields.name}><input id="name" className="input" autoComplete="name" value={f.name} onChange={set("name")} required /></Field>
        <Field label="E-mail" htmlFor="email" error={fields.email}><input id="email" type="email" className="input" autoComplete="email" value={f.email} onChange={set("email")} required /></Field>
        <Field label="Password" htmlFor="pw" error={fields.password} hint="At least 10 characters, with a letter and a number.">
          <input id="pw" type="password" className="input" autoComplete="new-password" value={f.password} onChange={set("password")} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Organisation (optional)" htmlFor="org"><input id="org" className="input" autoComplete="organization" value={f.organisation} onChange={set("organisation")} /></Field>
          <Field label="Phone (optional)" htmlFor="ph" error={fields.phone}><input id="ph" type="tel" className="input" autoComplete="tel" value={f.phone} onChange={set("phone")} /></Field>
        </div>
        <div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-[rgb(var(--brand))]" checked={f.consent} onChange={set("consent")} />
            <span>I agree that SoundSense may store my assessment answers and measurements to produce my diagnosis and reports. I can delete my data on request. Microphone audio is never uploaded – only level statistics.</span>
          </label>
          {fields.consent && <p className="err">{fields.consent}</p>}
        </div>
        {err && !Object.keys(fields).length && <p className="err" role="alert">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      </form>
    </AuthShell>
  );
}
