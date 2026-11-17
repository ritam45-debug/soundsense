"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Field, Modal, Notice, PageHeader, PasswordInput, Spinner, useToast } from "@/components/ui";
import { call, ClientError, useMe } from "@/lib/client";

export default function Page() {
  const { data, mutate } = useMe(); const toast = useToast(); const router = useRouter();
  const [delOpen, setDelOpen] = useState(false); const [delPw, setDelPw] = useState(""); const [delErr, setDelErr] = useState(""); const [delBusy, setDelBusy] = useState(false);
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
  async function deleteAccount() {
    setDelBusy(true); setDelErr("");
    try { await call("/api/me", { method: "DELETE", body: { password: delPw } }); router.replace("/login"); } catch (e: any) { setDelErr(e.message); } finally { setDelBusy(false); }
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
            <Field label="Current password" htmlFor="cp"><PasswordInput id="cp" autoComplete="current-password" value={pw.current} onChange={(v) => setPw({ ...pw, current: v })} required={false} /></Field>
            <Field label="New password" htmlFor="np"><PasswordInput id="np" autoComplete="new-password" value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} showRules required={false} /></Field>
            {pwErr && <p className="err" role="alert">{pwErr}</p>}
            <button className="btn-secondary" disabled={!pw.current || !pw.next}>Change password</button>
          </form>
          <Notice tone="info" title="Your data">You can ask us to export or delete your assessments and recordings at any time. Microphone audio is never uploaded – only level statistics you choose to save.</Notice>
          {u.role === "customer" && (
            <div className="card space-y-3 p-5">
              <h2 className="font-display text-base font-semibold">Delete my account</h2>
              <p className="text-sm text-muted">Permanently removes your account, assessments, saved measurements, bookings and chats. This cannot be undone.</p>
              <button type="button" className="btn-secondary !border-bad/50 !text-bad" onClick={() => { setDelPw(""); setDelErr(""); setDelOpen(true); }}>Delete my account…</button>
            </div>
          )}
        </div>
      </div>
      <Modal open={delOpen} onClose={() => setDelOpen(false)} title="Delete your account?">
        <div className="space-y-3">
          <p className="text-sm">Everything linked to <b>{u.email}</b> will be erased immediately. Type your password to confirm.</p>
          <Field label="Password" htmlFor="dp"><PasswordInput id="dp" autoComplete="current-password" value={delPw} onChange={setDelPw} required={false} /></Field>
          {delErr && <p className="err" role="alert">{delErr}</p>}
          <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setDelOpen(false)}>Keep my account</button><button className="btn-primary !bg-bad" disabled={!delPw || delBusy} onClick={deleteAccount}>{delBusy ? "Deleting…" : "Delete everything"}</button></div>
        </div>
      </Modal>
    </>
  );
}
