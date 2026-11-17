"use client";
import { useEffect, useState } from "react";
import { Field, Notice, PageHeader, Spinner, useToast } from "@/components/ui";
import { call, ClientError, useMe } from "@/lib/client";

export default function Page() {
  const { data, mutate } = useMe(); const toast = useToast();
  const [f, setF] = useState<any>(null); const [fields, setFields] = useState<Record<string, string>>({});
  const [pw, setPw] = useState({ current: "", next: "" }); const [pwErr, setPwErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) { const u = data.user; setF({ name: u.name ?? "", phone: u.phone ?? "", organisation: u.organisation ?? "", city: u.city ?? "", designation: u.designation ?? "", location: u.location ?? "", specialisation: u.specialisation ?? "", bio: u.bio ?? "", marketing_opt_in: !!u.marketing_opt_in }); } }, [data]);
  if (!data || !f) return <Spinner />;
  const u = data.user; const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setFields({});
    const body: any = { name: f.name, phone: f.phone, organisation: f.organisation, city: f.city, designation: f.designation, location: f.location, marketing_opt_in: f.marketing_opt_in };
    if (u.role === "consultant") { body.specialisation = f.specialisation; body.bio = f.bio; }
    try { await call("/api/me", { method: "PATCH", body }); toast("Profile saved."); mutate(); } catch (e: any) { if (e instanceof ClientError) setFields(e.fields); toast(e.message, "bad"); } finally { setBusy(false); }
  }
  async function changePw(e: React.FormEvent) {
    e.preventDefault(); setPwErr("");
    try { await call("/api/me", { method: "PUT", body: { current: pw.current, next: pw.next } }); toast("Password changed. Other devices were signed out."); setPw({ current: "", next: "" }); } catch (e: any) { setPwErr(e.message); }
  }
  return (
    <>
      <PageHeader title="Your profile" sub={`${u.email} · ${u.role}`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <form onSubmit={save} className="card space-y-4 p-5" noValidate>
          <h2 className="font-display text-base font-semibold">Details</h2>
          <Field label="Full name" htmlFor="n" error={fields.name}><input id="n" className="input" value={f.name} onChange={set("name")} /></Field>
          <Field label="Phone" htmlFor="p" error={fields.phone}><input id="p" type="tel" className="input" value={f.phone} onChange={set("phone")} /></Field>
          {u.role === "customer" && <>
            <Field label="Organisation" htmlFor="o"><input id="o" className="input" value={f.organisation} onChange={set("organisation")} /></Field>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Your role" htmlFor="d"><input id="d" className="input" value={f.designation} onChange={set("designation")} /></Field><Field label="Location" htmlFor="l"><input id="l" className="input" value={f.location} onChange={set("location")} /></Field></div>
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-[rgb(var(--brand))]" checked={f.marketing_opt_in} onChange={set("marketing_opt_in")} />E-mail me occasional acoustics tips (optional)</label></>}
          {u.role === "consultant" && <><Field label="Specialisation" htmlFor="s"><input id="s" className="input" value={f.specialisation} onChange={set("specialisation")} /></Field><Field label="Short bio" htmlFor="b"><textarea id="b" className="input min-h-[80px] py-2" value={f.bio} onChange={set("bio")} /></Field></>}
          <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </form>
        <div className="space-y-5">
          <form onSubmit={changePw} className="card space-y-4 p-5">
            <h2 className="font-display text-base font-semibold">Change password</h2>
            <Field label="Current password" htmlFor="cp"><input id="cp" type="password" autoComplete="current-password" className="input" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <Field label="New password" htmlFor="np" hint="At least 10 characters, with a letter and a number."><input id="np" type="password" autoComplete="new-password" className="input" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
            {pwErr && <p className="err" role="alert">{pwErr}</p>}
            <button className="btn-secondary" disabled={!pw.current || !pw.next}>Change password</button>
          </form>
          <Notice tone="info" title="Your data">You can ask us to export or delete your assessments and recordings at any time. Microphone audio is never uploaded – only level statistics you choose to save.</Notice>
        </div>
      </div>
    </>
  );
}
