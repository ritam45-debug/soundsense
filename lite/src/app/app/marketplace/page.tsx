"use client";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, Field, Modal, Notice, PageHeader, useToast } from "@/components/ui";
import { RoomSelect, H2 } from "@/components/ws";
import { SEED_PRODUCTS } from "@/lib/acoustics/catalogue";
import { CATEGORY_IDS, CATEGORY_SHORT } from "@/lib/acoustics/types";
import { useWorkspace } from "@/lib/workspace/useWorkspace";
import { audit } from "@/lib/workspace/store";
import { newId } from "@/lib/local/store";

const ISSUE_CAT: Record<string, string> = { reverb: "room", noise: "noise", intelligibility: "microphone", feedback: "conference", clipping: "microphone", connection: "connectivity", coverage: "microphone", overlap: "hybrid" };
function Inner() {
  const sp = useSearchParams(); const [w, update] = useWorkspace(); const toast = useToast();
  const [cat, setCat] = useState(ISSUE_CAT[sp.get("issue") ?? ""] ?? ""); const [roomId, setRoomId] = useState(sp.get("room") ?? "");
  const [pick, setPick] = useState<string[]>([]); const [ask, setAsk] = useState<string | null>(null); const [msg, setMsg] = useState("");
  const [sup, setSup] = useState({ name: "", email: "", phone: "", notes: "", sponsored: false });
  const items = useMemo(() => SEED_PRODUCTS.filter((p) => !cat || p.category === cat), [cat]);
  const cmp = SEED_PRODUCTS.filter((p) => pick.includes(p.sku));
  const toggle = (s: string) => setPick((p) => (p.includes(s) ? p.filter((x) => x !== s) : p.length >= 3 ? p : [...p, s]));
  const prod = SEED_PRODUCTS.find((p) => p.sku === ask);
  const body = (p: typeof prod) => `Hello,\n\nI would like a quote for: ${p?.name}.\nRoom: ${w.rooms.find((r) => r.id === roomId)?.name ?? "(not specified)"}\n${msg ? `\nDetails: ${msg}\n` : ""}\nPlease tell me what you need to know about the room, the lead time and what is included.\n\nThank you`;
  return (
    <>
      <PageHeader title="Find help" sub="Types of solution, what each can and cannot do, and a quick way to ask for quotes. There are no listed suppliers, prices or reviews here: costs always need a local quote." />
      <div className="space-y-5">
        <Notice tone="info">These are solution types, not products for sale. SoundSense does not list vendors. You add the suppliers you want to contact below, and anything you mark as sponsored is labelled so.</Notice>
        <div className="flex flex-wrap items-end gap-3"><div className="min-w-[200px]"><Field label="Kind of problem" htmlFor="cat"><select id="cat" className="input" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All</option>{CATEGORY_IDS.map((c) => <option key={c} value={c}>{CATEGORY_SHORT[c]}</option>)}</select></Field></div><div className="min-w-[220px]"><Field label="For room" htmlFor="rm"><RoomSelect w={w} value={roomId} onChange={setRoomId} id="rm" /></Field></div></div>
        <ul className="grid gap-3 md:grid-cols-2">{items.map((p) => (
          <li key={p.sku} className="card p-4"><div className="flex flex-wrap items-center gap-2"><Badge tone="brand">{CATEGORY_SHORT[p.category]}</Badge><Badge>{p.complexity} to set up</Badge><Badge>Needs a local quote</Badge></div>
            <h3 className="mt-2 font-display text-base font-semibold">{p.name}</h3><p className="text-sm text-muted">{p.description}</p>
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2"><div><p className="font-semibold">Good for</p><ul className="list-disc pl-4">{p.advantages.slice(0, 3).map((a) => <li key={a}>{a}</li>)}</ul></div><div><p className="font-semibold">Limits</p><ul className="list-disc pl-4">{p.limitations.slice(0, 3).map((a) => <li key={a}>{a}</li>)}</ul></div></div>
            <div className="mt-3 flex flex-wrap gap-2"><label className="flex min-h-[36px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[rgb(var(--brand))]" checked={pick.includes(p.sku)} disabled={!pick.includes(p.sku) && pick.length >= 3} onChange={() => toggle(p.sku)} /> Compare</label><button className="btn-secondary btn-sm" onClick={() => { setAsk(p.sku); setMsg(""); }}>Request quotes</button></div></li>))}</ul>
        {cmp.length >= 2 && <section className="card overflow-x-auto p-4" aria-label="Comparison"><H2>Comparing {cmp.length} options</H2><table className="w-full min-w-[560px] text-sm"><thead><tr><th className="th">&nbsp;</th>{cmp.map((p) => <th key={p.sku} className="th">{p.name}</th>)}</tr></thead><tbody>
          {([["Fixes", (p: any) => CATEGORY_SHORT[p.category as keyof typeof CATEGORY_SHORT]], ["Set-up effort", (p: any) => p.complexity], ["Cost", () => "Needs a local quote"], ["Good for", (p: any) => p.advantages.slice(0, 2).join("; ")], ["Limits", (p: any) => p.limitations.slice(0, 2).join("; ")], ["Upkeep", (p: any) => p.maintenance], ["Expected benefit", (p: any) => p.improvement]] as [string, (p: any) => string][]).map(([l, f]) => <tr key={l} className="border-t border-line align-top"><td className="td font-semibold">{l}</td>{cmp.map((p) => <td key={p.sku} className="td">{f(p)}</td>)}</tr>)}</tbody></table></section>}
        <section className="card space-y-3 p-4"><H2>Your suppliers</H2><p className="text-sm text-muted">People you add yourself. Stored on this device only.</p>
          <ul className="divide-y divide-line text-sm">{w.suppliers.map((s) => <li key={s.id} className="flex items-center justify-between gap-3 py-2"><span>{s.name} {s.sponsored && <Badge tone="warn">Sponsored</Badge>} <span className="text-muted">{s.email}{s.phone && ` · ${s.phone}`}</span></span><button className="btn-ghost btn-sm" onClick={() => update((x) => { x.suppliers = x.suppliers.filter((y) => y.id !== s.id); })}>Remove</button></li>)}</ul>
          <form className="grid gap-2 sm:grid-cols-5" onSubmit={(e) => { e.preventDefault(); if (!sup.name.trim() || !/^\S+@\S+\.\S+$/.test(sup.email)) return toast("Enter a name and a valid email.", "bad"); update((x) => { x.suppliers.push({ id: newId(), name: sup.name.trim(), email: sup.email.trim(), phone: sup.phone, categories: [], sponsored: sup.sponsored, notes: sup.notes }); audit(x, `Supplier added: ${sup.name}`); }); setSup({ name: "", email: "", phone: "", notes: "", sponsored: false }); }}>
            <input aria-label="Supplier name" className="input" placeholder="Name" value={sup.name} onChange={(e) => setSup({ ...sup, name: e.target.value })} /><input aria-label="Supplier email" className="input" placeholder="Email" value={sup.email} onChange={(e) => setSup({ ...sup, email: e.target.value })} /><input aria-label="Supplier phone" className="input" placeholder="Phone (optional)" value={sup.phone} onChange={(e) => setSup({ ...sup, phone: e.target.value })} />
            <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[rgb(var(--brand))]" checked={sup.sponsored} onChange={(e) => setSup({ ...sup, sponsored: e.target.checked })} /> Paid or sponsored</label><button className="btn-secondary">Add</button></form></section>
        {w.consults.length > 0 && <section className="card p-4"><H2>Requests you prepared</H2><ul className="space-y-1 text-sm">{w.consults.slice(0, 8).map((c) => <li key={c.id}>{new Date(c.at).toLocaleDateString()}: {c.message.split("\n")[2] ?? ""}</li>)}</ul></section>}
      </div>
      <Modal open={!!prod} onClose={() => setAsk(null)} title={`Request quotes: ${prod?.name ?? ""}`} wide>
        {prod && <div className="space-y-3 text-sm"><p className="text-muted">Nothing is sent from SoundSense. This opens your own mail app so you choose what to send and to whom.</p>
          <Field label="Anything the supplier should know?" htmlFor="m"><textarea id="m" className="input min-h-[80px] py-2" maxLength={500} value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>
          <pre className="max-h-[180px] overflow-auto whitespace-pre-wrap rounded-lg bg-raised p-3 text-xs">{body(prod)}</pre>
          <div className="flex flex-wrap gap-2">{w.suppliers.map((s) => <a key={s.id} className="btn-secondary btn-sm" onClick={() => update((x) => { x.consults.unshift({ id: newId(), at: new Date().toISOString(), roomId: roomId || null, supplierId: s.id, message: body(prod) }); audit(x, `Quote request prepared for ${s.name}`); })} href={`mailto:${encodeURIComponent(s.email)}?subject=${encodeURIComponent(`Quote request: ${prod.name}`)}&body=${encodeURIComponent(body(prod))}`}>Email {s.name}</a>)}
            <button className="btn-primary btn-sm" onClick={() => { update((x) => { x.consults.unshift({ id: newId(), at: new Date().toISOString(), roomId: roomId || null, supplierId: null, message: body(prod) }); }); navigator.clipboard?.writeText(body(prod)).then(() => toast("Request copied and saved."), () => toast("Saved. Could not copy automatically.", "bad")); }}>Copy and save request</button></div>
          {!w.suppliers.length && <p className="text-muted">Add a supplier above to email them directly.</p>}</div>}
      </Modal>
    </>
  );
}
export default function Page() { return <Suspense><Inner /></Suspense>; }
