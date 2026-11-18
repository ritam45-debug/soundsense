"use client";
import { useState } from "react";
import { Notice, PageHeader, Field, useToast } from "@/components/ui";
import { DEFAULT_SCREENING } from "@/lib/acoustics/screening";
import { CAT_IDS, CAT_LABEL, DEFAULT_WEIGHTS } from "@/lib/acoustics/health";
import { useWorkspace } from "@/lib/workspace/useWorkspace";
import { defaultSettings, audit } from "@/lib/workspace/store";
import { newId } from "@/lib/local/store";

export default function Page() {
  const [w, update] = useWorkspace(); const toast = useToast();
  const s = w.settings; const sc = s.screening;
  const [c, setC] = useState({ name: "", role: "", email: "" });
  const numIn = (v: string, fb: number) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };
  const bandNames = ["Quiet up to", "Acceptable up to", "Caution up to", "High concern up to"];
  const bandsOk = sc.bands.every((b, i) => i === 0 || b > sc.bands[i - 1]);
  const wSum = CAT_IDS.reduce((t, id) => t + (s.weights[id] ?? DEFAULT_WEIGHTS[id]), 0);
  return (
    <>
      <PageHeader title="Settings" sub="Thresholds, alert behaviour, scoring weights and contacts. Saved on this device only." />
      <div className="max-w-3xl space-y-5">
        <section className="card space-y-3 p-5"><h2 className="font-display text-base font-semibold">Noise screening bands (dB)</h2>
          <Notice tone="info">These are indicative screening values for meeting-room comfort, not legal or hearing-safety limits. Change them to match your own policy.</Notice>
          <div className="grid gap-3 sm:grid-cols-4">{sc.bands.map((b, i) => <Field key={i} label={bandNames[i]} htmlFor={`b${i}`}><input id={`b${i}`} type="number" className="input" value={b} onChange={(e) => update((x) => { x.settings.screening.bands[i] = numIn(e.target.value, b); })} /></Field>)}</div>
          {!bandsOk && <p className="err" role="alert">Each band must be higher than the one before it.</p>}
        </section>
        <section className="card space-y-3 p-5"><h2 className="font-display text-base font-semibold">Alert behaviour</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Hysteresis (dB)" htmlFor="hy" hint="An alert clears only after the level falls this far below its threshold, so it does not flicker."><input id="hy" type="number" min={0} step={0.5} className="input" value={sc.hysteresisDb} onChange={(e) => update((x) => { x.settings.screening.hysteresisDb = Math.max(0, numIn(e.target.value, 2)); })} /></Field>
            <Field label="Cooldown (minutes)" htmlFor="cd" hint="A cleared alert that returns within this time reopens quietly instead of notifying again."><input id="cd" type="number" min={0} className="input" value={sc.cooldownMin} onChange={(e) => update((x) => { x.settings.screening.cooldownMin = Math.max(0, numIn(e.target.value, 10)); })} /></Field>
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[rgb(var(--brand))]" checked={sc.urgent.enabled} onChange={(e) => update((x) => { x.settings.screening.urgent.enabled = e.target.checked; })} /> Raise an urgent (red) alert when a calibrated reading is at or above</label>
          <Field label="Urgent level (dB, calibrated readings only)" htmlFor="ul" hint="Default 85 dB, the level where hearing-protection programmes begin (NIOSH recommended limit for 8 h, in dBA). Uncalibrated estimates can never trigger it."><input id="ul" type="number" className="input max-w-[160px]" value={sc.urgent.leqDb} onChange={(e) => update((x) => { x.settings.screening.urgent.leqDb = numIn(e.target.value, 85); })} /></Field>
        </section>
        <section className="card space-y-3 p-5"><h2 className="font-display text-base font-semibold">Health score weights</h2>
          <p className="text-sm text-muted">Relative importance of each area. Leave blank to use the preset for each room type. Weights are normalised, so they need not add to 100.</p>
          <div className="grid gap-3 sm:grid-cols-5">{CAT_IDS.map((id) => <Field key={id} label={CAT_LABEL[id]} htmlFor={`w${id}`}><input id={`w${id}`} type="number" min={0} step={0.05} className="input" placeholder={String(DEFAULT_WEIGHTS[id])} value={s.weights[id] ?? ""} onChange={(e) => update((x) => { if (e.target.value === "") delete x.settings.weights[id]; else x.settings.weights[id] = Math.max(0, numIn(e.target.value, 0)); })} /></Field>)}</div>
          {wSum <= 0 && <p className="err" role="alert">At least one weight must be above zero.</p>}
        </section>
        <section className="card space-y-3 p-5"><h2 className="font-display text-base font-semibold">Notifications</h2>
          <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[rgb(var(--brand))]" checked={s.notify.inApp} onChange={(e) => update((x) => { x.settings.notify.inApp = e.target.checked; })} /> In-app notifications</label>
          <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[rgb(var(--brand))]" checked={s.notify.browser} onChange={async (e) => { const on = e.target.checked; if (on) { if (typeof Notification === "undefined") return toast("This browser does not support notifications.", "bad"); const p = Notification.permission === "granted" ? "granted" : await Notification.requestPermission(); if (p !== "granted") return toast("Browser notifications were not allowed.", "bad"); } update((x) => { x.settings.notify.browser = on; }); }} /> Browser notifications while this tab is open</label>
          <p className="text-xs text-muted">A static page cannot send notifications when closed. There is no email or SMS sending in this edition.</p>
        </section>
        <section className="card space-y-3 p-5"><h2 className="font-display text-base font-semibold">Contacts for escalation</h2>
          <p className="text-sm text-muted">Used only to open your own mail app with a prepared message. You choose to send it.</p>
          <ul className="divide-y divide-line">{s.contacts.map((k) => <li key={k.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span>{k.name} <span className="text-muted">{k.role} · {k.email}</span></span><button className="btn-ghost btn-sm" onClick={() => update((x) => { x.settings.contacts = x.settings.contacts.filter((y) => y.id !== k.id); })}>Remove</button></li>)}</ul>
          <form className="grid gap-2 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); if (!c.name || !/^\S+@\S+\.\S+$/.test(c.email)) return toast("Enter a name and a valid email.", "bad"); update((x) => { x.settings.contacts.push({ id: newId(), ...c }); audit(x, `Contact added: ${c.name}`); }); setC({ name: "", role: "", email: "" }); }}>
            <input aria-label="Name" className="input" placeholder="Name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /><input aria-label="Role" className="input" placeholder="Role (e.g. facility manager)" value={c.role} onChange={(e) => setC({ ...c, role: e.target.value })} /><input aria-label="Email" className="input" placeholder="Email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} /><button className="btn-secondary">Add</button></form>
        </section>
        <button className="btn-secondary" onClick={() => { update((x) => { x.settings = defaultSettings(); }); toast("Settings reset to defaults."); }}>Reset settings to defaults</button>
        <p className="text-xs text-muted">Defaults: bands {DEFAULT_SCREENING.bands.join(" / ")} dB, hysteresis {DEFAULT_SCREENING.hysteresisDb} dB, cooldown {DEFAULT_SCREENING.cooldownMin} min.</p>
      </div>
    </>
  );
}
