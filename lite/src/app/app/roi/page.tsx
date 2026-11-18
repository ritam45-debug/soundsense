"use client";
import { useState } from "react";
import { Field, Notice, PageHeader } from "@/components/ui";
import { roi, type RoiInput } from "@/lib/acoustics/roi";

const EXAMPLE: Record<keyof RoiInput, string> = { people: "6", hourlyCost: "", meetingsPerWeek: "10", minutesLostPerMeeting: "5", reductionPct: "50", investment: "", yearlyUpkeep: "0", weeksPerYear: "46" };
const LABELS: [keyof RoiInput, string, string][] = [
  ["people", "People in a typical meeting", "number"], ["hourlyCost", "Cost of one person's hour (your currency)", "Your own figure: salary plus overheads, per hour."], ["meetingsPerWeek", "Meetings in this room per week", ""],
  ["minutesLostPerMeeting", "Minutes lost per meeting to poor sound", "Your estimate: repeats, re-explaining, delays."], ["reductionPct", "How much of that loss the fix removes (%)", "An assumption. Be cautious."], ["investment", "Cost of the fix (your currency)", "Use a local quote."], ["yearlyUpkeep", "Yearly upkeep (your currency)", ""],
];
export default function Page() {
  const [v, setV] = useState<Record<string, string>>(EXAMPLE);
  const n = (k: string) => (v[k] === "" ? NaN : Number(v[k]));
  const input: RoiInput = { people: n("people"), hourlyCost: n("hourlyCost"), meetingsPerWeek: n("meetingsPerWeek"), minutesLostPerMeeting: n("minutesLostPerMeeting"), reductionPct: n("reductionPct"), investment: n("investment"), yearlyUpkeep: n("yearlyUpkeep"), weeksPerYear: n("weeksPerYear") || 46 };
  const filled = LABELS.every(([k]) => v[k] !== "");
  const r = filled ? roi(input) : null; const money = (x: number) => x.toLocaleString();
  return (
    <>
      <PageHeader title="Return on investment" sub="Works out roughly how long a fix takes to pay for itself in meeting time. Every result comes from the numbers you enter." />
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card space-y-3 p-5"><Notice tone="info">The people, meetings and minutes shown are examples to get you started. The two money boxes and every estimate are yours to fill in: SoundSense does not know your costs or local prices.</Notice>
          {LABELS.map(([k, l, h]) => <Field key={k} label={l} htmlFor={`r-${k}`} hint={h === "number" ? undefined : h || undefined}><input id={`r-${k}`} inputMode="decimal" className="input max-w-[220px]" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>)}</section>
        <section className="card p-5" aria-live="polite">
          {!filled ? <p className="text-sm text-muted">Fill in every box to see scenarios. The two money boxes start empty on purpose.</p> : !r!.valid ? <ul className="list-disc space-y-1 pl-5 text-sm text-bad">{r!.problems.map((p) => <li key={p}>{p}</li>)}</ul> : (
            <div className="space-y-4"><p className="text-sm">Time lost to poor sound is worth about <strong>{money(r!.yearlyLostCost)}</strong> a year, from your numbers.</p>
              <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-sm"><thead><tr><th className="th">Scenario</th><th className="th">Reduction</th><th className="th">Saved a year</th><th className="th">Pays back in</th><th className="th">3-year net</th></tr></thead>
                <tbody>{r!.scenarios.map((s) => <tr key={s.name} className="border-t border-line"><td className="td font-semibold">{s.name}</td><td className="td">{s.reductionPct}%</td><td className="td tabular-nums">{money(s.yearlySaving)}</td><td className="td">{s.paybackMonths === null ? "Not within savings" : `${s.paybackMonths} months`}</td><td className="td tabular-nums">{money(s.threeYearNet)}</td></tr>)}</tbody></table></div>
              <div><p className="font-semibold">What this assumes</p><ul className="list-disc space-y-1 pl-5 text-sm text-muted">{r!.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></div></div>)}
        </section>
      </div>
    </>
  );
}
