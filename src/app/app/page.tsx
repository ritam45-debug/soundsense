"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, ClipboardList, MessageCircle, Mic, Plus } from "lucide-react";
import { ChartCard, HBars, Meter, TimeSeries } from "@/components/Charts";
import { Badge, Empty, ErrorBox, PageHeader, Spinner, Stat, statusLabel, statusTone } from "@/components/ui";
import { fmtDate, useApi, useMe } from "@/lib/client";
import { ENVIRONMENTS } from "@/lib/acoustics/questionnaire";
import { CATEGORY_IDS, CATEGORY_SHORT } from "@/lib/acoustics/types";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const PRESETS = [{ id: "30", label: "30 days" }, { id: "90", label: "90 days" }, { id: "365", label: "12 months" }, { id: "custom", label: "Custom" }];

export default function Dashboard() {
  const { data: me } = useMe();
  const role = me!.user.role;
  const [preset, setPreset] = useState("90");
  const [from, setFrom] = useState(iso(new Date(Date.now() - 89 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const [category, setCategory] = useState("");
  const [env, setEnv] = useState("");
  const pick = (p: string) => {
    setPreset(p);
    if (p !== "custom") { setFrom(iso(new Date(Date.now() - (Number(p) - 1) * 864e5))); setTo(iso(new Date())); }
  };
  const qs = useMemo(() => new URLSearchParams({ from, to, ...(category && { category }), ...(env && { environment: env }) }).toString(), [from, to, category, env]);
  const { data: s, error, isLoading, mutate } = useApi<any>(`/api/stats?${qs}`);
  const { data: list } = useApi<any>("/api/assessments?limit=5");
  const { data: bk } = useApi<any>("/api/bookings");
  const upcoming = (bk?.bookings ?? []).filter((b: any) => ["confirmed", "requested", "reschedule_requested"].includes(b.status) && new Date(b.slot_start) > new Date()).sort((a: any, b: any) => +new Date(a.slot_start) - +new Date(b.slot_start)).slice(0, 3);
  const draft = (list?.items ?? []).find((a: any) => a.status === "draft");
  const title = role === "customer" ? `Hello, ${me!.user.name.split(" ")[0]}` : role === "consultant" ? "Your caseload" : "Platform overview";
  const sub = role === "customer" ? "Your acoustic assessments, consultations and reports." : role === "consultant" ? "Cases assigned to you and the consultations booked with you." : "Live figures from the database – everything below is calculated from real records.";

  return (
    <>
      <PageHeader title={title} sub={sub} actions={role === "customer" ? <Link href="/app/assessments/new" className="btn-primary"><Plus className="h-4 w-4" /> {draft ? "Start another assessment" : "Start assessment"}</Link> : undefined} />

      {role === "customer" && draft && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand-soft p-4">
          <div><p className="font-semibold">You have an unfinished assessment</p><p className="text-sm text-muted">{draft.ref} · last edited {fmtDate(draft.updated_at)}</p></div>
          <Link href={`/app/assessments/${draft.id}`} className="btn-primary btn-sm">Continue</Link>
        </div>
      )}

      <div className="card mb-5 flex flex-wrap items-end gap-3 p-3 sm:p-4" role="search" aria-label="Dashboard filters">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Date range">
          {PRESETS.map((p) => <button key={p.id} onClick={() => pick(p.id)} aria-pressed={preset === p.id} className={`btn btn-sm ${preset === p.id ? "bg-brand text-brand-ink" : "border border-line bg-surface hover:bg-raised"}`}>{p.label}</button>)}
        </div>
        {preset === "custom" && (
          <>
            <label className="text-xs font-semibold">From<input type="date" className="input !min-h-[36px] mt-1" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="text-xs font-semibold">To<input type="date" className="input !min-h-[36px] mt-1" value={to} min={from} max={iso(new Date())} onChange={(e) => setTo(e.target.value)} /></label>
          </>
        )}
        <label className="text-xs font-semibold">Issue category
          <select className="input !min-h-[36px] mt-1 min-w-[170px]" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {[...CATEGORY_IDS, "multiple" as const].map((c) => <option key={c} value={c}>{CATEGORY_SHORT[c]}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">Environment
          <select className="input !min-h-[36px] mt-1 min-w-[170px]" value={env} onChange={(e) => setEnv(e.target.value)}>
            <option value="">All environments</option>
            {ENVIRONMENTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {(category || env) && <button className="btn-ghost btn-sm" onClick={() => { setCategory(""); setEnv(""); }}>Clear filters</button>}
      </div>

      {isLoading && <Spinner />}
      {error && <ErrorBox error={error} retry={() => mutate()} />}
      {s && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Assessments" value={s.totals.assessments} sub={`${s.totals.completed} completed · ${s.totals.inProgress} in review`} />
            <Stat label="Problems identified" value={s.totals.identifiedProblems} sub="Submitted assessments with a diagnosis" />
            <Stat label="Consultations" value={s.totals.activeConsultations} sub={`${s.totals.pendingConsultations} awaiting confirmation · ${s.totals.upcomingConsultations} upcoming`} />
            {role === "admin" ? <Stat label="Customers" value={s.totals.customers} sub="With at least one assessment" /> : <Stat label="Satisfaction" value={s.totals.satisfaction ? `${s.totals.satisfaction.toFixed(1)}/5` : "—"} sub={`${s.totals.feedbackCount} rating${s.totals.feedbackCount === 1 ? "" : "s"}`} />}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard title="Assessments over time" sub={`Per ${s.range.bucket}`} rows={s.assessmentsOverTime} cols={[{ key: "date", label: "Date" }, { key: "value", label: "Assessments" }]} empty={!s.assessmentsOverTime.length}>
              <TimeSeries data={s.assessmentsOverTime} name="Assessments" />
            </ChartCard>
            <ChartCard title="Diagnosed problem categories" sub="Primary category of each submitted assessment" rows={s.issueDistribution} cols={[{ key: "label", label: "Category" }, { key: "value", label: "Assessments" }]} empty={!s.issueDistribution.length}>
              <HBars data={s.issueDistribution} />
            </ChartCard>
            <ChartCard title="Problems customers reported" sub="What people told us in the questionnaire (multiple per assessment)" rows={s.reportedProblems} cols={[{ key: "label", label: "Problem" }, { key: "value", label: "Mentions" }]} empty={!s.reportedProblems.length}>
              <HBars data={s.reportedProblems.slice(0, 8)} colorOffset={1} />
            </ChartCard>
            <ChartCard title="Consultation status" rows={s.bookingStatus} cols={[{ key: "key", label: "Status" }, { key: "value", label: "Bookings" }]} empty={!s.bookingStatus.length}>
              <HBars data={s.bookingStatus.map((b: any) => ({ label: statusLabel(b.key), value: b.value }))} colorOffset={2} />
            </ChartCard>
          </div>

          {role !== "customer" && s.feedback.count > 0 && (
            <section className="card p-4 sm:p-5">
              <h3 className="font-display text-[15px] font-semibold">Customer feedback · {s.feedback.count} response{s.feedback.count === 1 ? "" : "s"}</h3>
              <div className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                <Meter label="Overall experience" value={s.feedback.averages.overall} />
                <Meter label="Usefulness of recommendations" value={s.feedback.averages.usefulness} />
                <Meter label="Consultation experience" value={s.feedback.averages.consultation} />
                <Meter label="Improvement after changes" value={s.feedback.averages.improvement} />
              </div>
            </section>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between"><h3 className="font-display text-[15px] font-semibold">Recent assessments</h3><Link className="text-sm font-semibold text-brand" href="/app/assessments">View all</Link></div>
              {!list ? <Spinner /> : !list.items.length ? (
                <Empty title="No assessments yet" action={role === "customer" ? <Link href="/app/assessments/new" className="btn-primary btn-sm"><ClipboardList className="h-4 w-4" /> Start your first</Link> : undefined}>A short questionnaire and, optionally, a microphone check will tell us what is really wrong.</Empty>
              ) : (
                <ul className="divide-y divide-line">
                  {list.items.map((a: any) => (
                    <li key={a.id}><Link href={`/app/assessments/${a.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-raised/60">
                      <div className="min-w-0"><p className="truncate text-sm font-semibold">{a.title || a.ref}</p><p className="truncate text-xs text-muted">{a.ref}{role !== "customer" && ` · ${a.customer_name}`} · {fmtDate(a.updated_at)}</p></div>
                      <Badge tone={statusTone(a.status)}>{statusLabel(a.status)}</Badge>
                    </Link></li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between"><h3 className="font-display text-[15px] font-semibold">Upcoming consultations</h3><Link className="text-sm font-semibold text-brand" href="/app/bookings">Manage</Link></div>
              {!upcoming.length ? (
                <Empty title="Nothing booked" action={role === "customer" ? <Link href="/app/bookings" className="btn-secondary btn-sm"><CalendarDays className="h-4 w-4" /> Book a consultation</Link> : undefined}>Consultations are optional – you can use the diagnosis and report without one.</Empty>
              ) : (
                <ul className="divide-y divide-line">
                  {upcoming.map((b: any) => (
                    <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                      <div><p className="text-sm font-semibold">{fmtDate(b.slot_start, true)} IST</p><p className="text-xs text-muted">{b.ref}{role !== "customer" && ` · ${b.customer_name}`}</p></div>
                      <Badge tone={statusTone(b.status)}>{statusLabel(b.status)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {role === "customer" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Link href="/app/measure" className="card flex items-center gap-3 p-4 hover:bg-raised/50"><Mic className="h-5 w-5 text-brand" /><div><p className="font-semibold">Measure your room</p><p className="text-xs text-muted">Live level meter and room calculator</p></div></Link>
              <Link href="/app/chat" className="card flex items-center gap-3 p-4 hover:bg-raised/50"><MessageCircle className="h-5 w-5 text-brand" /><div><p className="font-semibold">Ask the assistant</p><p className="text-xs text-muted">Plain-language acoustics help</p></div></Link>
              <Link href="/app/learn" className="card flex items-center gap-3 p-4 hover:bg-raised/50"><ClipboardList className="h-5 w-5 text-brand" /><div><p className="font-semibold">Learn the basics</p><p className="text-xs text-muted">Echo, noise and microphones explained</p></div></Link>
            </div>
          )}
        </div>
      )}
    </>
  );
}
