"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge, Empty, ErrorBox, Field, Modal, Notice, PageHeader, Spinner, useToast } from "@/components/ui";
import { call, useApi, useMe } from "@/lib/client";
import { CATEGORY_IDS, CATEGORY_SHORT, TIER_LABEL, formatRange } from "@/lib/acoustics/types";

const BLANK = { sku: "", name: "", solution_group: "equipment", problem_category: "room", tier: "recommended", description: "", price_min: 0, price_max: 0, price_basis: "indicative_estimate", advantages: "", limitations: "", maintenance: "", expected_improvement: "", complexity: "medium", active: true };
const BASIS: Record<string, string> = { indicative_estimate: "Indicative estimate", vendor_quote: "Vendor quote", catalogue_price: "Catalogue price" };

export default function Page() {
  const me = useMe().data!.user; const toast = useToast();
  const { data, error, mutate } = useApi<any>("/api/admin/products");
  const [edit, setEdit] = useState<any>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [cat, setCat] = useState("");
  if (me.role === "customer") return <ErrorBox error="Staff only." />;
  const admin = me.role === "admin";
  const open = (p?: any) => { setErr(""); setEdit(p ? { ...p, advantages: (p.advantages ?? []).join("\n"), limitations: (p.limitations ?? []).join("\n"), maintenance: p.maintenance ?? "", expected_improvement: p.expected_improvement ?? "", _existing: true } : { ...BLANK }); };
  async function save() {
    setBusy(true); setErr("");
    const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
    try {
      await call("/api/admin/products", { body: { sku: edit.sku, name: edit.name, solution_group: edit.solution_group, problem_category: edit.problem_category, tier: edit.tier, description: edit.description, price_min: Number(edit.price_min), price_max: Number(edit.price_max), price_basis: edit.price_basis, advantages: lines(edit.advantages), limitations: lines(edit.limitations), suitability: edit.suitability ?? {}, maintenance: edit.maintenance || undefined, expected_improvement: edit.expected_improvement || undefined, complexity: edit.complexity, active: edit.active } });
      toast("Product saved. New assessments use it; existing reports keep their snapshot."); setEdit(null); mutate();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const rows = (data?.products ?? []).filter((p: any) => !cat || p.problem_category === cat);
  const f = (k: string) => (e: any) => setEdit({ ...edit, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <>
      <PageHeader title="Products & pricing" sub="The solution catalogue the recommendation engine draws from." actions={admin ? <button className="btn-primary" onClick={() => open()}><Plus className="h-4 w-4" /> Add product</button> : undefined} />
      <div className="mb-4"><Notice tone="warn" title="Check the prices before relying on them">Seeded prices are indicative estimates made by the SoundSense team – not vendor quotes. Update them and set the price basis to “Vendor quote” or “Catalogue price” once verified. Customers always see prices labelled as indicative.</Notice></div>
      <label className="mb-4 block max-w-xs text-xs font-semibold">Problem category<select className="input mt-1" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All</option>{CATEGORY_IDS.map((c) => <option key={c} value={c}>{CATEGORY_SHORT[c]}</option>)}</select></label>
      {error && <ErrorBox error={error} />}{!data && !error && <Spinner />}{data && !rows.length && <Empty title="No products" />}
      {rows.length > 0 && <div className="card overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Solution</th><th className="th">Category</th><th className="th">Tier</th><th className="th">Price (INR)</th><th className="th">Price basis</th><th className="th">Status</th>{admin && <th className="th" />}</tr></thead>
        <tbody>{rows.map((p: any) => <tr key={p.id} className="border-t border-line"><td className="td"><span className="font-semibold">{p.name}</span><br /><span className="text-xs text-muted">{p.sku}</span></td><td className="td">{CATEGORY_SHORT[p.problem_category as keyof typeof CATEGORY_SHORT]}</td><td className="td">{TIER_LABEL[p.tier as keyof typeof TIER_LABEL]}</td><td className="td whitespace-nowrap tabular-nums">{formatRange(p.price_min, p.price_max)}</td><td className="td"><Badge tone={p.price_basis === "indicative_estimate" ? "warn" : "good"}>{BASIS[p.price_basis]}</Badge></td><td className="td">{p.active ? <Badge tone="good">Active</Badge> : <Badge>Inactive</Badge>}</td>{admin && <td className="td"><button className="btn-secondary btn-sm" onClick={() => open(p)}>Edit</button></td>}</tr>)}</tbody></table></div>}
      <Modal wide open={!!edit} onClose={() => setEdit(null)} title={edit?._existing ? "Edit product" : "Add product"}>
        {edit && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="SKU" htmlFor="pk"><input id="pk" className="input" value={edit.sku} disabled={edit._existing} onChange={f("sku")} /></Field><Field label="Name" htmlFor="pn"><input id="pn" className="input" value={edit.name} onChange={f("name")} /></Field>
          <Field label="Problem category" htmlFor="pc"><select id="pc" className="input" value={edit.problem_category} onChange={f("problem_category")}>{CATEGORY_IDS.map((c) => <option key={c} value={c}>{CATEGORY_SHORT[c]}</option>)}</select></Field>
          <Field label="Tier" htmlFor="pt"><select id="pt" className="input" value={edit.tier} onChange={f("tier")}>{(["budget", "recommended", "premium"] as const).map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}</select></Field>
          <Field label="Price from (₹)" htmlFor="p1"><input id="p1" type="number" min={0} className="input" value={edit.price_min} onChange={f("price_min")} /></Field><Field label="Price to (₹)" htmlFor="p2"><input id="p2" type="number" min={0} className="input" value={edit.price_max} onChange={f("price_max")} /></Field>
          <Field label="Price basis" htmlFor="pb"><select id="pb" className="input" value={edit.price_basis} onChange={f("price_basis")}>{Object.entries(BASIS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Group" htmlFor="pg"><select id="pg" className="input" value={edit.solution_group} onChange={f("solution_group")}><option value="equipment">Equipment</option><option value="room">Room treatment</option><option value="software">Software / settings</option></select></Field>
          <div className="sm:col-span-2"><Field label="Description" htmlFor="pd"><textarea id="pd" className="input min-h-[70px] py-2" value={edit.description} onChange={f("description")} /></Field></div>
          <Field label="Advantages (one per line)" htmlFor="pa"><textarea id="pa" className="input min-h-[80px] py-2" value={edit.advantages} onChange={f("advantages")} /></Field><Field label="Limitations (one per line)" htmlFor="pl"><textarea id="pl" className="input min-h-[80px] py-2" value={edit.limitations} onChange={f("limitations")} /></Field>
          <Field label="Maintenance" htmlFor="pm"><input id="pm" className="input" value={edit.maintenance} onChange={f("maintenance")} /></Field><Field label="Expected improvement" htmlFor="pe"><input id="pe" className="input" value={edit.expected_improvement} onChange={f("expected_improvement")} /></Field>
          <Field label="Installation effort" htmlFor="px"><select id="px" className="input" value={edit.complexity} onChange={f("complexity")}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
          <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-[rgb(var(--brand))]" checked={edit.active} onChange={f("active")} /> Offer in recommendations</label>
          {err && <p className="err sm:col-span-2" role="alert">{err}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2"><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save product"}</button></div></div>}
      </Modal>
    </>
  );
}
