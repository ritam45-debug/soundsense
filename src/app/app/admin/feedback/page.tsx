"use client";
import { Meter, ChartCard, HBars } from "@/components/Charts";
import { Empty, ErrorBox, PageHeader, Spinner, Stat } from "@/components/ui";
import { fmtDate, useApi, useMe } from "@/lib/client";

export default function Page() {
  const role = useMe().data!.user.role;
  const { data, error } = useApi<any>("/api/feedback");
  const { data: s } = useApi<any>("/api/stats?from=2000-01-01&to=2100-01-01");
  if (role === "customer") return <ErrorBox error="This page is for staff." />;
  if (error) return <ErrorBox error={error} />;
  if (!data || !s) return <Spinner />;
  const f = s.feedback;
  return (
    <>
      <PageHeader title="Feedback & satisfaction" sub="All-time figures from submitted customer feedback." />
      {!data.feedback.length ? <Empty title="No feedback yet" /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Responses" value={f.count} /><Stat label="Overall" value={f.averages.overall ? `${f.averages.overall.toFixed(1)}/5` : "—"} /><Stat label="Usefulness" value={f.averages.usefulness ? `${f.averages.usefulness.toFixed(1)}/5` : "—"} /><Stat label="Value for money" value={f.averages.value ? `${f.averages.value.toFixed(1)}/5` : "—"} /></div>
          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard title="Rating distribution" sub="Overall experience" rows={f.distribution} cols={[{ key: "stars", label: "Stars" }, { key: "value", label: "Responses" }]}><HBars data={f.distribution.map((d: any) => ({ label: `${d.stars} star${d.stars > 1 ? "s" : ""}`, value: d.value }))} /></ChartCard>
            <section className="card space-y-3 p-5"><h3 className="font-display text-[15px] font-semibold">Averages</h3><Meter label="Overall" value={f.averages.overall} /><Meter label="Usefulness" value={f.averages.usefulness} /><Meter label="Value for money" value={f.averages.value} /><Meter label="Consultation" value={f.averages.consultation} /><Meter label="Improvement after changes" value={f.averages.improvement} /></section>
          </div>
          <section className="card p-5"><h3 className="mb-3 font-display text-[15px] font-semibold">Responses</h3>
            <ul className="divide-y divide-line">{data.feedback.map((x: any) => (
              <li key={x.id} className="py-3 text-sm"><p className="font-semibold">{x.customer} <span className="font-normal text-muted">· {x.assessment_ref ?? "General"} · {fmtDate(x.created_at)} · overall {x.overall}/5, useful {x.usefulness}/5, value {x.value_for_money}/5</span></p>
                {x.improve_text && <p className="mt-1"><span className="text-muted">Improve: </span>{x.improve_text}</p>}{x.comments && <p className="mt-1"><span className="text-muted">Comment: </span>{x.comments}</p>}</li>))}</ul></section>
        </div>
      )}
    </>
  );
}
