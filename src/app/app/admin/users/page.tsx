"use client";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Badge, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, Tabs, useToast } from "@/components/ui";
import { call, fmtDate, useApi, useMe } from "@/lib/client";

export default function Page() {
  const me = useMe().data!.user; const toast = useToast();
  const [role, setRole] = useState<"" | "customer" | "consultant" | "admin">(""); const [q, setQ] = useState(""); const [add, setAdd] = useState(false);
  const qs = new URLSearchParams({ ...(role && { role }), ...(q && { q }) });
  const { data, error, mutate } = useApi<any>(me.role === "admin" ? `/api/admin/users?${qs}` : null);
  const [f, setF] = useState({ name: "", email: "", role: "consultant", specialisation: "" }); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  if (me.role !== "admin") return <ErrorBox error="Administrators only." />;
  async function patch(id: string, body: any) { try { await call(`/api/admin/users/${id}`, { method: "PATCH", body }); toast("Saved."); mutate(); } catch (e: any) { toast(e.message, "bad"); } }
  async function create() {
    setBusy(true); setErr("");
    try { await call("/api/admin/users", { body: { ...f, specialisation: f.specialisation || undefined } }); toast("Account created. They receive an e-mail to set a password."); setAdd(false); setF({ name: "", email: "", role: "consultant", specialisation: "" }); mutate(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <>
      <PageHeader title="Customers & staff" sub="Manage accounts and roles. Deactivating someone signs them out immediately." actions={<button className="btn-primary" onClick={() => setAdd(true)}><Plus className="h-4 w-4" /> Add consultant or admin</button>} />
      <Tabs tabs={[{ id: "", label: "Everyone" }, { id: "customer", label: "Customers" }, { id: "consultant", label: "Consultants" }, { id: "admin", label: "Admins" }]} value={role} onChange={(v) => setRole(v as any)} />
      <label className="relative mb-4 block max-w-sm"><span className="sr-only">Search</span><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted" /><input className="input !pl-9" placeholder="Search name or e-mail" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {error && <ErrorBox error={error} />}{!data && !error && <Spinner />}
      {data && !data.users.length && <Empty title="No one matches" />}
      {data?.users.length > 0 && <div className="card overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Name</th><th className="th">Role</th><th className="th">Organisation</th><th className="th">Activity</th><th className="th">Joined</th><th className="th">Active</th></tr></thead>
        <tbody>{data.users.map((u: any) => (
          <tr key={u.id} className="border-t border-line"><td className="td"><span className="font-semibold">{u.name}</span><br /><span className="text-xs text-muted">{u.email}{!u.email_verified_at && " · unverified"}</span></td>
            <td className="td"><select aria-label={`Role for ${u.name}`} className="input !min-h-[36px] !w-auto text-[13px]" value={u.role} disabled={u.id === me.id} onChange={(e) => patch(u.id, { role: e.target.value })}><option value="customer">Customer</option><option value="consultant">Consultant</option><option value="admin">Admin</option></select></td>
            <td className="td">{u.organisation ?? "—"}</td><td className="td text-xs">{u.role === "customer" ? `${u.assessments} assessment${u.assessments === 1 ? "" : "s"}` : u.role === "consultant" ? `${u.open_cases} open case${u.open_cases === 1 ? "" : "s"}${u.specialisation ? ` · ${u.specialisation}` : ""}` : "—"}</td>
            <td className="td whitespace-nowrap">{fmtDate(u.created_at)}</td>
            <td className="td"><label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5 accent-[rgb(var(--brand))]" checked={u.is_active} disabled={u.id === me.id} onChange={(e) => patch(u.id, { isActive: e.target.checked })} aria-label={`${u.name} active`} />{u.is_active ? <Badge tone="good">Active</Badge> : <Badge tone="bad">Disabled</Badge>}</label></td></tr>))}</tbody></table></div>}
      <Modal open={add} onClose={() => setAdd(false)} title="Add a team member">
        <div className="space-y-3"><Field label="Full name" htmlFor="an"><input id="an" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field><Field label="E-mail" htmlFor="ae"><input id="ae" type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Role" htmlFor="ar"><select id="ar" className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="consultant">Consultant</option><option value="admin">Admin</option></select></Field>
          {f.role === "consultant" && <Field label="Specialisation" htmlFor="as"><input id="as" className="input" value={f.specialisation} onChange={(e) => setF({ ...f, specialisation: e.target.value })} /></Field>}
          {err && <p className="err" role="alert">{err}</p>}<p className="text-xs text-muted">They get an e-mail with a link to choose their own password. You never see it.</p>
          <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setAdd(false)}>Cancel</button><button className="btn-primary" disabled={busy || !f.name || !f.email} onClick={create}>{busy ? "Creating…" : "Create account"}</button></div></div>
      </Modal>
    </>
  );
}
