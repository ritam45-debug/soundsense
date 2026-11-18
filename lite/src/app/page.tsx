import Link from "next/link";
import { ArrowRight, Ear, FileText, Gauge, Mic2, ShieldCheck, Volume2, Wifi, Waves, Users, Radio } from "lucide-react";
import { PublicShell } from "@/components/PublicShell";

const CATS = [
  { i: Waves, t: "Room acoustics", d: "Echo and reverberation from hard surfaces and room shape." },
  { i: Mic2, t: "Microphones", d: "Placement, distance, pickup pattern, gain." },
  { i: Volume2, t: "Speakers", d: "Coverage, level and feedback paths." },
  { i: Ear, t: "Background noise", d: "AC, traffic, open-plan chatter, corridors." },
  { i: Radio, t: "Conference systems", d: "Settings, echo cancellation, device mix-ups." },
  { i: Wifi, t: "Connectivity", d: "Dropouts that sound like acoustics but aren't." },
  { i: Users, t: "Hybrid setups", d: "Rooms and remote people hearing each other badly." },
  { i: Gauge, t: "Several at once", d: "When two causes feed each other, we say so." },
];

export default function Home() {
  return (
    <PublicShell>
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="mb-4 text-sm font-semibold text-accent">Smart acoustic assessment, diagnosis & consultation</p>
            <h1 className="font-display text-4xl font-semibold leading-[1.08] sm:text-6xl">Diagnose first.<br />Recommend second.<br /><span className="text-accent">Sell last.</span></h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75">A new microphone will not fix a room that echoes. SoundSense asks the right questions, checks your room with your own device, and tells you what is most likely wrong – and how sure it is – before it mentions a single product.</p>
            <div className="mt-8 flex flex-wrap gap-3"><Link href="/app/assessments/new" className="btn-primary !bg-accent !text-black">Start a free assessment <ArrowRight className="h-4 w-4" /></Link><Link href="/app/assessments/new?sample=1" className="btn border border-white/30 text-white hover:bg-white/10">Try a sample</Link><Link href="/learn" className="btn border border-white/30 text-white hover:bg-white/10">Learn the basics first</Link></div>
          </div>
          <ReadoutCard />
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <h2 className="font-display text-3xl font-semibold">How an assessment works</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-4">
          {[["Answer", "A short questionnaire adapts to your answers – about 10 minutes."], ["Check", "Optionally measure the room with your microphone and describe its size and surfaces."], ["Understand", "See the likely cause, the evidence for it, a confidence level and free fixes to try first."], ["Decide", "Compare budget, recommended and premium options, download a report, or book a consultant."]].map(([t, d], i) => (
            <li key={t} className="card p-5"><span className="font-display text-sm font-semibold text-brand">Step {i + 1}</span><h3 className="mt-1 font-display text-lg font-semibold">{t}</h3><p className="mt-2 text-sm leading-relaxed text-muted">{d}</p></li>))}
        </ol>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-3xl font-semibold">What we look for</h2>
          <p className="mt-2 max-w-2xl text-muted">Eight possible diagnoses. The engine scores each from your evidence, shows its working, and tells you when the honest answer is “several things at once”.</p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{CATS.map((c) => <li key={c.t} className="rounded-xl border border-line p-4"><c.i className="h-5 w-5 text-brand" aria-hidden /><h3 className="mt-2 font-semibold">{c.t}</h3><p className="mt-1 text-sm text-muted">{c.d}</p></li>)}</ul>
        </div>
      </section>

      <section id="honesty" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-brand" /><h2 className="font-display text-3xl font-semibold">What we promise – and what we won&apos;t claim</h2></div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {[["No pretend precision", "Browser microphones are not meters. Readings are labelled relative, rough estimate, or single-point calibrated – never presented as certified decibels."], ["Hypotheses, not verdicts", "Root causes are listed as possibilities with a way to check each one. Low evidence means low confidence, and we say so."], ["Free steps first", "Moving a microphone or closing a door costs nothing. If that is likely to help, it comes before any product."], ["Prices are indicative", "Every price is an estimate set by our team for the Indian market – not a quote – and labelled that way throughout."], ["Your audio stays yours", "Recordings are analysed on your device. Only summary levels are saved, only if you choose to save them."], ["A person when it matters", "Ask the assistant for a consultant at any time. It is rule-guided and can be wrong; the diagnosis shows its rules."]].map(([t, d]) => (
            <div key={t} className="card p-5"><h3 className="font-display font-semibold">{t}</h3><p className="mt-1.5 text-sm leading-relaxed text-muted">{d}</p></div>))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-brand-soft p-8"><div><h2 className="font-display text-2xl font-semibold">Find out what is really wrong with the sound.</h2><p className="mt-1 text-muted">Free to start. Takes about ten minutes.</p></div><Link href="/app/assessments/new" className="btn-primary">Create your account <FileText className="h-4 w-4" /></Link></div>
      </section>
    </PublicShell>
  );
}

/** An illustrative readout: static sample content, clearly marked as an example. */
function ReadoutCard() {
  const bars = [0.35, 0.5, 0.8, 0.45, 0.9, 0.6, 0.3, 0.7, 0.55, 0.25, 0.65, 0.4, 0.85, 0.5, 0.3];
  return (
    <figure className="rounded-2xl border border-white/15 bg-white/[0.06] p-5 backdrop-blur" aria-label="Example diagnosis readout">
      <figcaption className="mb-3 flex items-center justify-between text-xs text-white/60"><span>Example readout – not a real customer</span><span>Conference room · 14 people</span></figcaption>
      <svg viewBox="0 0 300 60" className="w-full" aria-hidden>{bars.map((b, i) => <rect key={i} x={i * 20 + 2} y={30 - b * 28} width="8" height={b * 56} rx="4" fill={i === 4 ? "rgb(var(--accent))" : "rgb(var(--brand))"} opacity={i === 4 ? 1 : 0.7} />)}</svg>
      <p className="mt-4 text-sm text-white/60">Most likely problem</p>
      <p className="font-display text-2xl font-semibold">Room acoustics</p>
      <dl className="mt-4 space-y-3 text-sm">
        {[["Estimated reverberation (calculated)", "1.8 s vs 0.6 s target"], ["You reported", "echo, “sounds like a bathroom”"], ["Confidence", "Medium – no recording yet"]].map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-t border-white/10 pt-3"><dt className="text-white/60">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>)}
      </dl>
      <p className="mt-4 rounded-lg bg-white/10 p-3 text-sm">Try first: close the curtains, add soft furnishings, move microphones closer to talkers. Free.</p>
    </figure>
  );
}
