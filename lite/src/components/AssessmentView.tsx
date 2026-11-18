"use client";
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, CalendarPlus, Download, FileText, Mic, RefreshCw, Trash2, Upload } from "lucide-react";
import { Badge, Confirm, Empty, ErrorBox, Field, Modal, Notice, PageHeader, Tabs, statusLabel, statusTone, useToast } from "./ui";
import { HBars } from "./Charts";
import { RoomCalculator } from "./RoomCalculator";
import { assessmentHref, call, downloadReport, fmtDate, useApi } from "@/lib/client";
import { BASIS_LABEL, CATEGORY_SHORT, PRICE_DISCLAIMER, TIER_LABEL, formatInr, formatRange, CATEGORY_IDS } from "@/lib/acoustics/types";
import { relativeSnr, roughEstimate, ROUGH_UNCERTAINTY_DB } from "@/lib/acoustics/measurement";

type TabId = "diagnosis" | "recs" | "room" | "reports" | "notes" | "docs" | "history";

export function AssessmentView({ full, role, uid, refresh }: { full: any; role: "customer" | "consultant" | "admin"; uid: string; refresh: () => void }) {
  const a = full.assessment;
  const staff = role !== "customer";
  const d = full.diagnostic?.diagnosis;
  const toast = useToast();
  const [tab, setTab] = useState<TabId>("diagnosis");
  const [busy, setBusy] = useState("");
  const canEdit = role === "admin" || (role === "customer" && a.customer_id === uid && a.status !== "completed") || (role === "consultant" && a.consultant_id === uid);

  async function reanalyse() {
    setBusy("re");
    try { await call(`/api/assessments/${a.id}/analyse`, { body: {} }); toast("Diagnosis refreshed with your latest data."); refresh(); } catch (e: any) { toast(e.message, "bad"); } finally { setBusy(""); }
  }

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "diagnosis", label: "Diagnosis" },
    { id: "recs", label: "Recommendations", count: full.recommendations.length || undefined },
    { id: "room", label: "Room & sound", count: full.measurements.length || undefined },
    { id: "reports", label: "Reports", count: full.reports.length || undefined },
  ];

  return (
    <>
      <PageHeader
        title={a.title || a.ref}
        sub={<span className="flex flex-wrap items-center gap-2">{a.ref}<Badge tone={statusTone(a.status)}>{statusLabel(a.status)}</Badge>{a.summary?.severity && <Badge tone={a.summary.severity.label === "high" ? "bad" : a.summary.severity.label === "moderate" ? "warn" : "good"}>Impact: {a.summary.severity.label}</Badge>}{staff && <span>· {full.customer?.name} · {full.customer?.email}</span>}</span>}
        actions={<>
          {full.reports[0] && <button className="btn-primary" onClick={() => downloadReport(a.id, full.reports[0].id).catch((e) => toast(e.message, "bad"))}><Download className="h-4 w-4" /> Download PDF report</button>}
        </>}
      />
      {staff && <StaffBar full={full} role={role} refresh={refresh} />}
      {a.summary && <SummaryStrip s={a.summary} />}
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "diagnosis" && <DiagnosisTab d={d} diagnostic={full.diagnostic} />}
      {tab === "recs" && <RecsTab full={full} plan={full.diagnostic?.plan} staff={staff} refresh={refresh} />}
      {tab === "room" && <RoomTab full={full} canEdit={canEdit} reanalyse={reanalyse} busy={busy === "re"} refresh={refresh} />}
      {tab === "reports" && <ReportsTab full={full} role={role} refresh={refresh} />}
    </>
  );
}

function SummaryStrip({ s }: { s: any }) {
  return (
    <div className="card mb-5 p-4 text-sm">
      <p className="font-semibold">{s.headline}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">{s.problems?.map((p: string) => <Badge key={p}>{p}</Badge>)}</div>
      <p className="mt-2 text-muted">{s.environment}{s.occupants ? ` · about ${s.occupants} people` : ""} · {s.mode} · Budget: {s.buying?.budget}</p>
    </div>
  );
}

function StaffBar({ full, role, refresh }: { full: any; role: string; refresh: () => void }) {
  const a = full.assessment;
  const toast = useToast();
  const { data: cons } = useApi<any>(role === "admin" ? "/api/consultants" : null);
  const patch = async (body: any) => { try { await call(`/api/assessments/${a.id}/manage`, { method: "PATCH", body }); toast("Case updated."); refresh(); } catch (e: any) { toast(e.message, "bad"); } };
  return (
    <div className="card mb-5 flex flex-wrap items-end gap-3 p-3">
      <label className="text-xs font-semibold">Case status
        <select className="input !min-h-[40px] mt-1 min-w-[160px]" value={a.status} disabled={a.status === "draft"} onChange={(e) => patch({ status: e.target.value })}>
          {a.status === "draft" && <option value="draft">Draft</option>}
          <option value="submitted">Submitted</option><option value="in_review">In review</option><option value="completed">Completed</option>
        </select>
      </label>
      {role === "admin" ? (
        <label className="text-xs font-semibold">Consultant
          <select className="input !min-h-[40px] mt-1 min-w-[220px]" value={a.consultant_id ?? ""} disabled={a.status === "draft"} onChange={(e) => patch({ consultantId: e.target.value || null })}>
            <option value="">Unassigned</option>
            {cons?.consultants?.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.open_cases} open)</option>)}
          </select>
        </label>
      ) : <p className="text-sm text-muted">Customer: {full.customer?.name}{full.customer?.phone ? ` · ${full.customer.phone}` : ""}</p>}
    </div>
  );
}

// ── Diagnosis ───────────────────────────────────────────────────────────────────────
function DiagnosisTab({ d, diagnostic }: { d: any; diagnostic: any }) {
  if (!d) return <Empty title="No diagnosis yet">Submit the questionnaire to run the diagnostic engine.</Empty>;
  const conf = Math.round(d.confidence * 100);
  const scores = Object.entries(d.scores as Record<string, number>).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ label: CATEGORY_SHORT[k as keyof typeof CATEGORY_SHORT], value: v }));
  return (
    <div className="space-y-5">
      <section className="card p-5">
        <p className="text-sm text-muted">Most likely problem area</p>
        <h2 className="font-display text-2xl font-semibold">{d.primaryLabel}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={d.confidenceLevel === "high" ? "good" : d.confidenceLevel === "medium" ? "warn" : "bad"}>Confidence: {d.confidenceLevel} ({conf}%)</Badge>
          <Badge>Fix complexity: {d.complexity}</Badge>
          {(() => { const others = (d.contributing ?? []).filter((c: string) => c !== d.primary); return others.length > 0 && d.primary !== "multiple" ? <Badge>Also contributing: {others.map((c: string) => CATEGORY_SHORT[c as keyof typeof CATEGORY_SHORT]).join(", ")}</Badge> : null; })()}
        </div>
        <p className="mt-4 text-[15px] leading-relaxed">{d.solution}</p>
        <div className="mt-4"><Notice tone="info" title="How to read this">{d.caveat}</Notice></div>
        {d.expertInspection?.needed && (
          <div className="mt-4"><Notice tone="warn" title="We recommend an expert inspection before spending money">
            <ul className="list-disc pl-5">{d.expertInspection.reasons.map((r: string) => <li key={r}>{r}</li>)}</ul></Notice></div>
        )}
      </section>

      {d.freeFirstSteps?.length > 0 && (
        <section className="card p-5"><h3 className="font-display text-base font-semibold">Try these first – they cost nothing</h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">{d.freeFirstSteps.map((s: string) => <li key={s}>{s}</li>)}</ol></section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h3 className="font-display text-base font-semibold">Evidence behind this diagnosis</h3>
          {d.confirmedObservations.length > 0 && <><p className="mt-3 text-xs font-semibold text-muted">Calculated or measured</p>
            <ul className="mt-1 space-y-2 text-sm">{d.confirmedObservations.map((o: any, i: number) => <li key={i} className="flex gap-2"><Badge tone="good">{BASIS_LABEL[o.basis as keyof typeof BASIS_LABEL]}</Badge><span>{o.text}</span></li>)}</ul></>}
          <p className="mt-4 text-xs font-semibold text-muted">Reported by you</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{d.reportedObservations.length ? d.reportedObservations.map((o: any, i: number) => <li key={i}>{o.text}</li>) : <li className="list-none text-muted">Nothing specific reported.</li>}</ul>
          {d.contradictingEvidence.length > 0 && <><p className="mt-4 text-xs font-semibold text-muted">Evidence that points elsewhere</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{d.contradictingEvidence.map((o: any, i: number) => <li key={i}>{o.text}</li>)}</ul></>}
        </section>
        <section className="card p-5">
          <h3 className="font-display text-base font-semibold">Possibilities considered</h3>
          <p className="mb-3 text-xs text-muted">Evidence points per category – a transparent tally, not a probability.</p>
          <HBars data={scores} />
          <details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold">Confidence breakdown</summary>
            <ul className="mt-2 space-y-1 text-muted">
              <li>Strength of evidence: {Math.round(d.confidenceBreakdown.evidenceStrength * 100)}%</li><li>Separation from the next possibility: {Math.round(d.confidenceBreakdown.separation * 100)}%</li>
              <li>Questionnaire completeness: {Math.round(d.confidenceBreakdown.completeness * 100)}%</li><li>Corroboration by calculation or measurement: {Math.round(d.confidenceBreakdown.corroboration * 100)}%</li>
            </ul>
            {d.dataQuality.missing.length > 0 && <p className="mt-2">Would raise confidence: {d.dataQuality.missing.join("; ")}.</p>}
          </details>
        </section>
      </div>

      <section className="card p-5">
        <h3 className="font-display text-base font-semibold">Possible root causes</h3>
        <p className="mb-3 text-xs text-muted">These are hypotheses to check – not conclusions.</p>
        <ul className="divide-y divide-line">{d.rootCauses.map((c: any, i: number) => (
          <li key={i} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:gap-4">
            <div className="sm:w-1/2"><Badge tone={c.status === "likely" ? "warn" : "neutral"}>{c.status === "likely" ? "Likely" : "Possible"}</Badge> <span className="font-medium">{c.cause}</span></div>
            <p className="text-muted sm:w-1/2"><span className="font-semibold text-ink">How to check: </span>{c.check}</p>
          </li>))}</ul>
      </section>

      {d.recommendedTests.length > 0 && (
        <section className="card p-5"><h3 className="font-display text-base font-semibold">Recommended tests</h3>
          <div className="mt-2 overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="th">Test</th><th className="th">Why</th><th className="th">Who</th><th className="th">Effort</th></tr></thead>
            <tbody>{d.recommendedTests.map((t: any, i: number) => <tr key={i} className="border-t border-line"><td className="td font-medium">{t.test}</td><td className="td text-muted">{t.why}</td><td className="td">{t.who === "customer" ? "You" : "Consultant"}</td><td className="td">{t.effort}</td></tr>)}</tbody></table></div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {d.expectedBenefits.length > 0 && <section className="card p-5"><h3 className="font-display text-base font-semibold">What improvement to expect</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{d.expectedBenefits.map((s: string) => <li key={s}>{s}</li>)}</ul></section>}
        {d.notRecommended.length > 0 && <section className="card p-5"><h3 className="font-display text-base font-semibold">What we would not buy yet</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{d.notRecommended.map((s: string) => <li key={s}>{s}</li>)}</ul></section>}
      </div>

      <details className="card p-5 text-sm"><summary className="cursor-pointer font-display text-base font-semibold">Show the rules that fired (full transparency)</summary>
        <p className="mt-2 text-muted">Engine version {d.engineVersion}. Each row is one rule; “effects” are the evidence points it added.</p>
        <div className="mt-3 overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Rule</th><th className="th">Evidence</th><th className="th">Basis</th><th className="th">Points</th></tr></thead>
          <tbody>{d.explanation.map((r: any) => <tr key={r.id} className="border-t border-line"><td className="td font-medium">{r.label}</td><td className="td text-muted">{r.evidence}</td><td className="td">{BASIS_LABEL[r.basis as keyof typeof BASIS_LABEL]}</td>
            <td className="td whitespace-nowrap tabular-nums">{Object.entries(r.effects).map(([k, v]) => `${CATEGORY_SHORT[k as keyof typeof CATEGORY_SHORT]} ${(v as number) > 0 ? "+" : ""}${v}`).join(", ")}</td></tr>)}</tbody></table></div>
        <p className="mt-3 text-xs text-muted">Analysed {fmtDate(diagnostic?.createdAt, true)}.</p>
      </details>
    </div>
  );
}

// ── Recommendations ─────────────────────────────────────────────────────────────────
function RecsTab({ full, plan, staff, refresh }: { full: any; plan: any; staff: boolean; refresh: () => void }) {
  const [edit, setEdit] = useState<any>(null);
  const recs: any[] = full.recommendations;
  if (!recs.length) return <Empty title="No recommendations yet">When the diagnosis finds a problem that equipment or room treatment could help, options appear here – with free steps always first.</Empty>;
  const cats = CATEGORY_IDS.filter((c) => recs.some((r) => r.problem_category === c));
  const total = plan?.bestFitTotal;
  return (
    <div className="space-y-6">
      <Notice tone="warn" title="Prices are indicative">{PRICE_DISCLAIMER}</Notice>
      {plan?.freeFirstSteps?.length > 0 && <Notice tone="good" title="Start with the free steps on the Diagnosis tab">Most acoustic problems improve a lot without spending anything. Come back here if they are not enough.</Notice>}
      {total && total.max > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <div><p className="font-semibold">Estimated cost of the best-fit options for phase 1</p><p className="text-muted">{formatRange(total.min, total.max)} {plan.budgetMax ? `· your budget: up to ${formatInr(plan.budgetMax)}` : ""}</p></div>
          {plan.withinBudget !== null && <Badge tone={plan.withinBudget ? "good" : "warn"}>{plan.withinBudget ? "Within your budget" : "Above your stated budget"}</Badge>}
        </div>
      )}
      {cats.map((c) => (
        <section key={c}>
          {(() => { const pc = plan?.categories?.find((x: any) => x.category === c); const many = (plan?.categories?.length ?? 0) > 1; return (
            <h3 className="mb-3 flex flex-wrap items-center gap-2 font-display text-lg font-semibold">{CATEGORY_SHORT[c]}
              {many && pc?.rank === 1 && <Badge tone="good">Start here</Badge>}
              {many && pc && pc.rank > 1 && !pc.deferred && <Badge tone="neutral">Then re-test</Badge>}
              {pc?.deferred && <Badge tone="warn">Phase 2 – after the first fix</Badge>}
            </h3>); })()}
          <div className="grid gap-4 lg:grid-cols-3">
            {(["budget", "recommended", "premium"] as const).map((t) => {
              const r = recs.find((x) => x.problem_category === c && x.tier === t);
              if (!r) return <div key={t} className="card border-dashed p-4 text-sm text-muted">No {TIER_LABEL[t].toLowerCase()} option for this problem.</div>;
              const det = r.detail ?? {};
              return (
                <article key={t} className={`card flex flex-col p-4 ${r.is_best_fit ? "ring-2 ring-brand" : ""}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-1.5"><Badge tone={t === "recommended" ? "brand" : "neutral"}>{TIER_LABEL[t]}</Badge>{r.is_best_fit && <Badge tone="good">Best fit for you</Badge>}{r.consultant_modified && <Badge tone="warn">Adjusted by consultant</Badge>}</div>
                  <h4 className="font-display text-[15px] font-semibold leading-snug">{r.title}</h4>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{formatRange(r.price_min, r.price_max)}</p>
                  <p className="text-[11px] text-muted">Indicative estimate</p>
                  <p className="mt-2 text-sm leading-relaxed">{det.description}</p>
                  {det.whyBestFit?.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px]">{det.whyBestFit.map((w: string) => <li key={w}>{w}</li>)}</ul>}
                  <details className="mt-3 text-[13px]"><summary className="cursor-pointer font-semibold">Pros, limits & upkeep</summary>
                    <p className="mt-2 font-semibold text-good">Advantages</p><ul className="list-disc pl-5">{det.advantages?.map((s: string) => <li key={s}>{s}</li>)}</ul>
                    <p className="mt-2 font-semibold text-warn">Limitations</p><ul className="list-disc pl-5">{det.limitations?.map((s: string) => <li key={s}>{s}</li>)}</ul>
                    <p className="mt-2"><span className="font-semibold">Expected improvement:</span> {det.expectedImprovement}</p>
                    <p className="mt-1"><span className="font-semibold">Maintenance:</span> {det.maintenance}</p>
                    <p className="mt-1"><span className="font-semibold">Suitability:</span> {det.suitability}</p>
                    <p className="mt-1"><span className="font-semibold">Installation:</span> {det.complexity} effort</p>
                    {det.fitNotes?.length > 0 && <p className="mt-1 text-muted">{det.fitNotes.join(" · ")}</p>}
                  </details>
                  {det.consultantNote && <p className="mt-2 rounded-lg bg-raised p-2 text-[13px]"><span className="font-semibold">Consultant note: </span>{det.consultantNote}</p>}
                  {staff && <button className="btn-secondary btn-sm mt-3 self-start" onClick={() => setEdit(r)}>Modify</button>}
                </article>
              );
            })}
          </div>
        </section>
      ))}
      {plan?.roadmap?.length > 0 && (
        <section className="card p-5"><h3 className="font-display text-lg font-semibold">Suggested roadmap</h3>
          <ol className="mt-3 space-y-3">{plan.roadmap.map((p: any) => <li key={p.phase} className="text-sm"><p className="font-semibold">{p.phase} <span className="font-normal text-muted">· {p.timeframe}</span></p><ul className="list-disc pl-5">{p.actions.map((x: string) => <li key={x}>{x}</li>)}</ul></li>)}</ol></section>
      )}
      {edit && <EditRec rec={edit} assessmentId={full.assessment.id} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />}
    </div>
  );
}

function EditRec({ rec, assessmentId, onClose, onSaved }: { rec: any; assessmentId: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ title: rec.title, min: rec.price_min, max: rec.price_max, best: rec.is_best_fit, note: rec.detail?.consultantNote ?? "" });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await call(`/api/assessments/${assessmentId}/recommendations/${rec.id}`, { method: "PATCH", body: { title: f.title, priceMin: Number(f.min), priceMax: Number(f.max), isBestFit: f.best, consultantNote: f.note } }); toast("Recommendation updated. The change is in the history."); onSaved(); }
    catch (e: any) { toast(e.message, "bad"); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Modify recommendation">
      <div className="space-y-3">
        <Field label="Title" htmlFor="t"><input id="t" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price from (₹)" htmlFor="pmin"><input id="pmin" type="number" className="input" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value as any })} /></Field>
          <Field label="Price to (₹)" htmlFor="pmax"><input id="pmax" type="number" className="input" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value as any })} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[rgb(var(--brand))]" checked={f.best} onChange={(e) => setF({ ...f, best: e.target.checked })} /> Mark as best fit for this problem</label>
        <Field label="Note to customer (shown with the recommendation)" htmlFor="n"><textarea id="n" className="input min-h-[80px] py-2" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save change"}</button></div>
      </div>
    </Modal>
  );
}

// ── Room & sound ────────────────────────────────────────────────────────────────────
const CAL_LABEL: Record<string, string> = { uncalibrated: "Uncalibrated – relative level only", single_point: "Single-point calibration vs. a reference meter (not certified)" };
function RoomTab({ full, canEdit, reanalyse, busy, refresh }: { full: any; canEdit: boolean; reanalyse: () => void; busy: boolean; refresh: () => void }) {
  const a = full.assessment;
  const toast = useToast();
  const [del, setDel] = useState<any>(null);
  const ms: any[] = full.measurements;
  const amb = [...ms].reverse().find((m) => m.kind === "ambient");
  const sp = [...ms].reverse().find((m) => m.kind === "speech");
  const snr = amb && sp ? relativeSnr(sp.stats, amb.stats) : null;
  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h3 className="mb-1 font-display text-base font-semibold">Room acoustics estimate</h3>
        <p className="mb-4 text-sm text-muted">A calculation from size and materials – it is not a measurement of your room.</p>
        {canEdit ? <RoomCalculator environment={a.answers?.environment ?? "other"} initial={full.room} assessmentId={a.id} onSaved={refresh} /> :
          full.room?.analysis ? <p className="text-sm">Estimated RT60 {full.room.analysis.rt60Unoccupied?.toFixed(2)} s against a {full.room.analysis.target} s target ({full.room.analysis.risk} risk).</p> : <p className="text-sm text-muted">No room details were provided.</p>}
      </section>
      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-display text-base font-semibold">Microphone recordings</h3>
          {canEdit && <Link href={`/app/measure?assessment=${a.id}`} className="btn-secondary btn-sm"><Mic className="h-4 w-4" /> Record more</Link>}</div>
        <Notice tone="info" title="What these numbers mean">Levels are in dBFS (decibels relative to this device&apos;s digital maximum). Unless a calibration is shown, they are <strong>not</strong> sound-pressure levels and cannot be compared with a standard or another device. They are good for comparing rooms, spots and times with the same device.</Notice>
        {snr && <div className="mt-4 rounded-lg border border-line bg-raised p-3 text-sm"><span className="font-semibold">Relative speech-to-noise: {snr.snrDb} dB</span> <Badge tone={snr.rating === "good" ? "good" : snr.rating === "marginal" ? "warn" : "bad"}>{snr.rating}</Badge><p className="mt-1 text-muted">Speech level minus room-noise level, both recorded on the same device, so microphone sensitivity cancels out. Around 25 dB or more is good for clear speech; under 10 dB is poor.</p></div>}
        {!ms.length ? <div className="mt-4"><Empty title="No recordings yet">A 30-second recording of the empty room and one of someone speaking makes the diagnosis much more reliable.</Empty></div> : (
          <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="th">Recording</th><th className="th">Average (Leq)</th><th className="th">Background (L90)</th><th className="th">Peaks (L10)</th><th className="th">Calibration</th><th className="th" /></tr></thead>
            <tbody>{ms.map((m) => {
              const cal = m.calibration; const est = roughEstimate(m.stats.leqDb);
              return (<tr key={m.id} className="border-t border-line">
                <td className="td"><span className="font-medium">{m.label || (m.kind === "ambient" ? "Room noise" : m.kind === "speech" ? "Speech" : "Recording")}</span><br /><span className="text-xs text-muted">{fmtDate(m.started_at, true)} · {Math.round(m.duration_s)} s{m.notes ? ` · ${m.notes}` : ""}</span></td>
                <td className="td tabular-nums">{m.stats.leqDb.toFixed(1)} dBFS{cal.status === "single_point" ? <><br /><span className="text-xs">≈ {(m.stats.leqDb + cal.offsetDb).toFixed(0)} dB SPL*</span></> : <><br /><span className="text-xs text-muted">≈ {est.value} dB ±{ROUGH_UNCERTAINTY_DB} (rough guess: {est.label})</span></>}</td>
                <td className="td tabular-nums">{m.stats.l90Db.toFixed(1)}</td><td className="td tabular-nums">{m.stats.l10Db.toFixed(1)}</td>
                <td className="td text-xs">{CAL_LABEL[cal.status]}{cal.referenceInstrument ? <><br />Ref: {cal.referenceInstrument}</> : null}</td>
                <td className="td">{canEdit && <button className="btn-ghost btn-sm" aria-label="Delete recording" onClick={() => setDel(m)}><Trash2 className="h-4 w-4" /></button>}</td></tr>);
            })}</tbody></table>
            <p className="mt-2 text-xs text-muted">* Single-point calibration against the named reference meter at one level. Not a certified measurement.</p></div>
        )}
        {canEdit && a.status !== "draft" && <button className="btn-secondary mt-4" onClick={reanalyse} disabled={busy}><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Re-run diagnosis with this data</button>}
      </section>
      <Confirm open={!!del} title="Delete this recording?" danger confirmLabel="Delete" onClose={() => setDel(null)} onConfirm={async () => { try { await call(`/api/assessments/${a.id}/measurements/${del.id}`, { method: "DELETE" }); toast("Recording deleted."); setDel(null); refresh(); } catch (e: any) { toast(e.message, "bad"); } }}>
        This removes the recording from the assessment. Existing reports keep the snapshot they were created with.
      </Confirm>
    </div>
  );
}

// ── Reports ─────────────────────────────────────────────────────────────────────────
function ReportsTab({ full, role, refresh }: { full: any; role: string; refresh: () => void }) {
  const a = full.assessment; const toast = useToast();
  const [busy, setBusy] = useState(false); const [final, setFinal] = useState(false); const [remarks, setRemarks] = useState(""); const [complete, setComplete] = useState(true);
  async function gen(body: any) { setBusy(true); try { await call(`/api/assessments/${a.id}/report`, { body }); toast("Report generated."); setFinal(false); refresh(); } catch (e: any) { toast(e.message, "bad"); } finally { setBusy(false); } }
  return (
    <div className="space-y-4">
      {a.status !== "draft" && (
        <div className="flex flex-wrap gap-2">
          {role === "customer" ? <button className="btn-secondary" disabled={busy || a.status === "completed"} onClick={() => gen({ final: false })}><RefreshCw className="h-4 w-4" /> Refresh preliminary report</button>
            : <><button className="btn-secondary" disabled={busy} onClick={() => gen({ final: false })}>New preliminary version</button><button className="btn-primary" onClick={() => setFinal(true)}><FileText className="h-4 w-4" /> Issue final report</button></>}
        </div>
      )}
      {!full.reports.length ? <Empty title="No reports yet">A report is created automatically when you submit the assessment. It is built on this device and is never uploaded.</Empty> : (
        <ul className="card divide-y divide-line">{full.reports.map((r: any) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div><p className="font-semibold">Version {r.version} <Badge tone={r.status === "final" ? "good" : "neutral"}>{r.status === "final" ? "Final" : "Preliminary"}</Badge></p><p className="text-xs text-muted">{fmtDate(r.created_at, true)}{r.consultant_remarks ? ` · includes consultant remarks` : ""}</p></div>
            <button className="btn-secondary btn-sm" onClick={() => downloadReport(a.id, r.id).catch((e) => toast(e.message, "bad"))}><Download className="h-4 w-4" /> Download PDF</button></li>))}</ul>
      )}
      <Modal open={final} onClose={() => setFinal(false)} title="Issue final report">
        <div className="space-y-3"><Field label="Consultant remarks (printed in the report)" htmlFor="rm"><textarea id="rm" className="input min-h-[120px] py-2" value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[rgb(var(--brand))]" checked={complete} onChange={(e) => setComplete(e.target.checked)} /> Mark the case as completed</label>
          <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setFinal(false)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={() => gen({ final: true, remarks, markCompleted: complete })}>{busy ? "Creating…" : "Issue report"}</button></div></div>
      </Modal>
    </div>
  );
}

// ── Notes ───────────────────────────────────────────────────────────────────────────
function NotesTab({ full, staff, refresh }: { full: any; staff: boolean; refresh: () => void }) {
  const toast = useToast(); const [body, setBody] = useState(""); const [vis, setVis] = useState<"internal" | "customer">("internal"); const [busy, setBusy] = useState(false);
  async function add() { setBusy(true); try { await call(`/api/assessments/${full.assessment.id}/notes`, { body: { body, visibility: vis } }); setBody(""); toast("Note added."); refresh(); } catch (e: any) { toast(e.message, "bad"); } finally { setBusy(false); } }
  return (
    <div className="space-y-4">
      {staff && (
        <section className="card p-4"><Field label="Add a note" htmlFor="nb"><textarea id="nb" className="input min-h-[90px] py-2" value={body} onChange={(e) => setBody(e.target.value)} /></Field>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-4 text-sm" role="radiogroup" aria-label="Visibility">
              <label className="flex items-center gap-2"><input type="radio" checked={vis === "internal"} onChange={() => setVis("internal")} className="accent-[rgb(var(--brand))]" /> Internal (staff only)</label>
              <label className="flex items-center gap-2"><input type="radio" checked={vis === "customer"} onChange={() => setVis("customer")} className="accent-[rgb(var(--brand))]" /> Visible to customer</label></div>
            <button className="btn-primary" disabled={busy || !body.trim()} onClick={add}>Add note</button></div></section>
      )}
      {!full.notes.length ? <Empty title={staff ? "No notes yet" : "No remarks from a consultant yet"} /> : (
        <ul className="space-y-3">{[...full.notes].reverse().map((n: any) => (
          <li key={n.id} className="card p-4"><div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted"><span className="font-semibold text-ink">{n.author}</span>{fmtDate(n.created_at, true)}{staff && <Badge tone={n.visibility === "customer" ? "brand" : "neutral"}>{n.visibility === "customer" ? "Customer can see" : "Internal"}</Badge>}</div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{n.body}</p></li>))}</ul>
      )}
    </div>
  );
}

// ── Documents ───────────────────────────────────────────────────────────────────────
function DocsTab({ full, canUpload, refresh }: { full: any; canUpload: boolean; refresh: () => void }) {
  const toast = useToast(); const [busy, setBusy] = useState(false);
  async function upload(f: File) {
    if (f.size > 3 * 1024 * 1024) return toast("Files can be up to 3 MB.", "bad");
    setBusy(true);
    try {
      const buf = new Uint8Array(await f.arrayBuffer()); let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      await call(`/api/assessments/${full.assessment.id}/documents`, { body: { filename: f.name, mimeType: f.type || "application/octet-stream", dataBase64: btoa(bin) } });
      toast("Uploaded."); refresh();
    } catch (e: any) { toast(e.message, "bad"); } finally { setBusy(false); }
  }
  async function remove(id: string) { try { await call(`/api/assessments/${full.assessment.id}/documents/${id}`, { method: "DELETE" }); refresh(); } catch (e: any) { toast(e.message, "bad"); } }
  return (
    <div className="space-y-4">
      {canUpload && <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line p-6 text-sm font-semibold hover:bg-raised ${busy ? "opacity-60" : ""}`}>
        <Upload className="h-4 w-4" /> {busy ? "Uploading…" : "Upload a photo, PDF, text or audio file (max 3 MB)"}
        <input type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg,.txt,.mp3,.wav" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} /></label>}
      {!full.documents.length ? <Empty title="No documents">Photos of the room, floor plans or recordings can help the consultant.</Empty> : (
        <ul className="card divide-y divide-line">{full.documents.map((d: any) => (
          <li key={d.id} className="flex items-center justify-between gap-3 p-3 text-sm"><div className="min-w-0"><p className="truncate font-medium">{d.filename}</p><p className="text-xs text-muted">{(d.size_bytes / 1024).toFixed(0)} KB · {d.uploader} · {fmtDate(d.created_at)}</p></div>
            <div className="flex gap-1"><a className="btn-secondary btn-sm" href={`/api/assessments/${full.assessment.id}/documents/${d.id}`}><Download className="h-4 w-4" /></a>{canUpload && <button className="btn-ghost btn-sm" aria-label="Delete" onClick={() => remove(d.id)}><Trash2 className="h-4 w-4" /></button>}</div></li>))}</ul>
      )}
    </div>
  );
}

// ── History ─────────────────────────────────────────────────────────────────────────
function HistoryTab({ id }: { id: string }) {
  const { data, error } = useApi<any>(`/api/assessments/${id}/history`);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  if (!data.history.length) return <Empty title="No changes recorded yet" />;
  return (
    <ul className="card divide-y divide-line">{data.history.map((h: any) => (
      <li key={h.id} className="p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{h.action}</span><span className="text-xs text-muted">{h.actor ?? "System"} ({h.actor_role ?? "–"}) · {fmtDate(h.created_at, true)}</span></div>
        {h.meta && Object.keys(h.meta).length > 0 && <pre className="mt-1 overflow-x-auto rounded bg-raised p-2 text-xs">{JSON.stringify(h.meta, null, 2)}</pre>}</li>))}</ul>
  );
}
void AlertTriangle;
