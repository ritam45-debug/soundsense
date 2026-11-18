"use client";
import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Notice } from "./ui";

interface Topic { id: string; title: string; level: "Start here" | "Going deeper"; minutes: number; keywords: string; body: React.ReactNode }

const Fig = ({ children, cap }: { children: React.ReactNode; cap: string }) => <figure className="my-4 rounded-lg border border-line bg-raised p-3">{children}<figcaption className="mt-2 text-xs text-muted">{cap}</figcaption></figure>;

function DecayDiagram() {
  return (
    <Fig cap="After a sound stops, a lively room (orange) keeps it audible far longer than a treated room (green). RT60 is the time to fall by 60 dB.">
      <svg viewBox="0 0 320 130" className="w-full max-w-md" role="img" aria-label="Two decay curves: a lively room falls slowly, a treated room falls quickly">
        <line x1="30" y1="10" x2="30" y2="110" stroke="rgb(var(--muted))" /><line x1="30" y1="110" x2="310" y2="110" stroke="rgb(var(--muted))" />
        <path d="M30 14 L290 104" stroke="rgb(var(--c2))" strokeWidth="3" fill="none" /><path d="M30 14 L120 104" stroke="rgb(var(--c3))" strokeWidth="3" fill="none" />
        <text x="296" y="100" fontSize="10" fill="rgb(var(--ink))">long RT60</text><text x="124" y="100" fontSize="10" fill="rgb(var(--ink))">short RT60</text>
        <text x="4" y="18" fontSize="9" fill="rgb(var(--muted))">loud</text><text x="170" y="126" fontSize="9" fill="rgb(var(--muted))">time →</text>
      </svg></Fig>
  );
}
function DistanceDiagram() {
  return (
    <Fig cap="Close to the talker, direct sound dominates. Far away, reflections dominate – that is why a microphone near the talker sounds clearer than one across the room.">
      <svg viewBox="0 0 320 110" className="w-full max-w-md" role="img" aria-label="Direct sound level falls with distance while room reflections stay roughly level">
        <line x1="20" y1="95" x2="305" y2="95" stroke="rgb(var(--muted))" /><path d="M20 12 Q120 70 300 88" stroke="rgb(var(--c1))" strokeWidth="3" fill="none" /><line x1="20" y1="62" x2="300" y2="62" stroke="rgb(var(--c4))" strokeWidth="3" strokeDasharray="6 4" />
        <text x="196" y="82" fontSize="10" fill="rgb(var(--ink))">direct sound</text><text x="196" y="56" fontSize="10" fill="rgb(var(--ink))">room reflections</text><text x="108" y="108" fontSize="9" fill="rgb(var(--muted))">distance from talker →</text>
        <line x1="150" y1="14" x2="150" y2="95" stroke="rgb(var(--muted))" strokeDasharray="2 3" /><text x="154" y="26" fontSize="9" fill="rgb(var(--muted))">critical distance</text>
      </svg></Fig>
  );
}
const P = ({ children }: { children: React.ReactNode }) => <p className="mb-3 leading-relaxed">{children}</p>;
const UL = ({ items }: { items: React.ReactNode[] }) => <ul className="mb-3 list-disc space-y-1 pl-5 leading-relaxed">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;

const TOPICS: Topic[] = [
  { id: "echo-vs-noise", title: "Echo, reverberation and noise are different problems", level: "Start here", minutes: 4, keywords: "echo reverb noise difference", body: <>
    <P><strong>Reverberation</strong> is sound lingering in the room after the talker stops – the “bathroom” sound. <strong>Echo</strong> in a video call usually means something different: the remote person hears their own voice coming back, which is a <em>system</em> problem (a speaker and microphone looping), not a room problem. <strong>Background noise</strong> is sound that was never speech – air-conditioning, traffic, other people.</P>
    <P>They have different fixes, which is why buying equipment before diagnosing so often disappoints. Soft furnishings help reverberation. Moving a microphone helps both reverberation and noise. Software settings help call echo. None of them is helped by a more expensive speaker.</P><DecayDiagram /></> },
  { id: "five-minute", title: "Five checks you can do in five minutes", level: "Start here", minutes: 5, keywords: "clap test check quick free steps", body: <>
    <UL items={[<><strong>Clap test.</strong> Stand in the middle and clap once sharply. A ring or flutter that lasts a second or more suggests a lively room.</>, <><strong>Move the microphone.</strong> Put it 30–60 cm from the talker. Distance from the talker is the single biggest factor in clarity.</>, <><strong>Test with a headset.</strong> If a headset sounds fine on the same call, the room or the room equipment is the cause, not the network.</>, <><strong>Listen to the room with the call muted.</strong> Air-conditioning, projector fans and corridor noise often show up here.</>, <><strong>Check which device is active.</strong> Two laptops with speakers on in the same room is a classic cause of echo for remote people.</>]} />
    <P>Our assessment asks about each of these, and the diagnosis tells you which checks matter most for your situation.</P></> },
  { id: "rt60", title: "RT60: how long sound lingers", level: "Going deeper", minutes: 6, keywords: "rt60 sabine reverberation time calculation", body: <>
    <P>RT60 is the time it takes sound to fall by 60 dB after the source stops. The Sabine equation estimates it as <code>0.161 × volume ÷ total absorption</code>, where absorption is each surface’s area times how much of the sound it absorbs. Bare concrete, glass and plasterboard absorb very little; carpet, curtains and acoustic panels absorb much more.</P>
    <P>Common targets: around 0.6 s or less for meeting rooms and classrooms, shorter for open offices, longer for large halls and places of worship where some reverberance is acceptable. Our calculator uses these and tells you the estimate is a calculation, not a measurement – real rooms with odd shapes or lots of furniture can differ.</P>
    <Link href="/app/measure" className="btn-secondary btn-sm">Open the room calculator</Link></> },
  { id: "mic-distance", title: "Why microphone distance matters so much", level: "Start here", minutes: 4, keywords: "microphone distance placement critical distance", body: <>
    <P>Direct sound from a talker weakens as you move away (roughly 6 dB less for each doubling of distance in the open), while reflections from walls stay about the same. Beyond a certain point – the <em>critical distance</em> – reflections win, and speech turns muddy.</P><DistanceDiagram />
    <UL items={["Table microphones should be close to everyone who talks – a single mic in a big room rarely works.", "Ceiling microphones need the right height and a treated room.", "Never place a microphone next to a speaker or laptop fan."]} /></> },
  { id: "measure", title: "Measuring with your phone – honestly", level: "Going deeper", minutes: 6, keywords: "dbfs spl calibration measurement phone microphone", body: <>
    <P>Browser and phone microphones report levels relative to their own digital maximum (<strong>dBFS</strong>). Converting to real sound pressure (<strong>dB SPL</strong>) needs a calibration against a reference sound-level meter, and phones differ by 20 dB or more. So SoundSense shows three tiers: <strong>relative</strong> (always valid for comparisons on the same device), a <strong>rough estimate</strong> labelled with ±20 dB, and <strong>single-point calibrated</strong> if you compare with a reference meter – still not a certified measurement.</P>
    <P>The most useful thing you can measure without calibration is the <strong>gap between speech and room noise</strong> on the same device. A gap of about 25 dB or more is good for clear speech; under 10 dB is poor.</P>
    <UL items={["Record the quiet room for 30 s, then someone speaking for 30 s, from the same spot.", "We switch off noise suppression and auto-gain during recording so they don’t hide the problem.", "Your audio never leaves your device – only summary levels are saved, if you choose."]} /></> },
  { id: "noise-cancel", title: "Noise cancellation: what it can and can't fix", level: "Going deeper", minutes: 4, keywords: "noise cancelling headset software suppression", body: <>
    <P>Software noise suppression and noise-cancelling headsets help most with steady noise next to the talker – a fan, an air-conditioner. They help much less with a reverberant room or with several people talking nearby, and aggressive suppression can make speech sound thin or clipped. A close-talking headset microphone is often the cheapest improvement for one person in a noisy space; it does not help a whole conference room.</P></> },
  { id: "hybrid", title: "Hybrid meetings: why remote people struggle", level: "Start here", minutes: 5, keywords: "hybrid meeting echo remote speaker feedback", body: <>
    <UL items={["Remote people hear echo of themselves when a second device in the room picks up their voice from the speaker. Keep one audio device active in the room.", "Remote people hear a distant, hollow voice when the microphone is too far away or the room is reverberant.", "Room people can’t hear remote speakers when the speaker is placed behind them or the level is limited.", "Intermittent robotic or cut-out audio is usually network or CPU load, not acoustics."]} />
    <P>The questionnaire separates these so the diagnosis doesn’t blame the room for a Wi-Fi problem.</P></> },
  { id: "pa", title: "Temples, halls and public-address systems", level: "Going deeper", minutes: 6, keywords: "temple hall public address PA speaker coverage", body: <>
    <P>Large reverberant spaces with stone or concrete surfaces are the hardest for speech. Rather than one powerful speaker at the front – which excites the room and arrives late at the back – several smaller speakers spread through the space, each covering its own zone at lower level, often give clearer speech. Speakers farther from the front may need a small electronic delay so sound from the front and nearby speakers arrive together.</P>
    <P>These designs depend on the building, so the assessment will normally recommend an expert inspection for large or heritage spaces rather than a product list.</P></> },
  { id: "buying", title: "Before you buy anything", level: "Start here", minutes: 3, keywords: "buy purchase budget products price", body: <>
    <UL items={["Try the free steps first and re-check the problem.", "Fix the cause that scored highest in the diagnosis; don’t buy for the second or third.", "Ask suppliers for a trial or a return window – every room is different.", "Treat prices in SoundSense as indicative estimates and confirm with suppliers."]} /></> },
];

const GLOSSARY: [string, string][] = [
  ["Absorption", "How much sound a surface soaks up instead of reflecting."], ["AEC (acoustic echo cancellation)", "Software that stops a far-end voice from being re-sent back to its speaker."],
  ["Critical distance", "Distance from a talker at which direct sound and room reflections are equally loud."], ["dBFS", "Decibels relative to a digital device's maximum level. Not the same as dB SPL."],
  ["dB SPL", "Decibels of real sound pressure, as a sound-level meter reports."], ["Leq", "Average level over the recording, weighted by energy."],
  ["L90 / L10", "Level exceeded 90% / 10% of the time – roughly the background floor and the peaks."], ["RT60", "Time for sound to decay by 60 dB after the source stops."],
  ["Schroeder frequency", "Below this frequency a room behaves as individual resonances rather than a diffuse field."], ["SNR", "Signal-to-noise ratio: how far the wanted sound is above the unwanted sound."],
];
const FAQ: [string, string][] = [
  ["Do I need to record with my microphone?", "No. It strengthens the diagnosis, but the questionnaire and room details alone are enough for a first assessment. The report says what was and wasn't checked."],
  ["Is my audio uploaded?", "No. Level analysis happens in your browser. Only summary statistics are sent, and only if you press save."],
  ["Are the prices real?", "They are indicative estimates by our team, not quotes. Confirm with a supplier before purchasing."],
  ["Does it sell me products?", "No. There is no checkout, no affiliate link and no commission. Recommendations are options to discuss with a supplier."],
  ["Is the chatbot an AI?", "When a language-model service is configured on the server it is; otherwise you get clearly-labelled “offline guidance mode” with pre-written answers. Either way it can be wrong."],
];

export function LearnContent() {
  const [q, setQ] = useState(""); const [open, setOpen] = useState<string | null>("echo-vs-noise");
  const shown = TOPICS.filter((t) => !q || (t.title + t.keywords).toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <label className="relative mb-6 block max-w-md"><span className="sr-only">Search the learning centre</span><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted" /><input className="input !pl-9" placeholder="Search: echo, microphone, RT60…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div className="space-y-3">
        {!shown.length && <p className="text-muted">No topics match. Try “echo” or “microphone”.</p>}
        {shown.map((t) => (
          <section key={t.id} className="card">
            <h2><button className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 text-left" aria-expanded={open === t.id} aria-controls={`t-${t.id}`} onClick={() => setOpen(open === t.id ? null : t.id)}>
              <span><span className="font-display text-base font-semibold">{t.title}</span><span className="mt-0.5 block text-xs text-muted">{t.level} · {t.minutes} min read</span></span><span aria-hidden className="text-xl text-muted">{open === t.id ? "−" : "+"}</span></button></h2>
            {open === t.id && <div id={`t-${t.id}`} className="border-t border-line px-4 pb-4 pt-3 text-sm">{t.body}</div>}
          </section>))}
      </div>
      <section className="mt-10"><h2 className="font-display text-xl font-semibold">Glossary</h2><dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">{GLOSSARY.map(([k, v]) => <div key={k}><dt className="font-semibold">{k}</dt><dd className="text-sm text-muted">{v}</dd></div>)}</dl></section>
      <section className="mt-10"><h2 className="font-display text-xl font-semibold">Frequently asked</h2><div className="mt-3 space-y-2">{FAQ.map(([k, v]) => <details key={k} className="card px-4 py-3 text-sm"><summary className="cursor-pointer font-semibold">{k}</summary><p className="mt-2 text-muted">{v}</p></details>)}</div></section>
      <div className="mt-10"><Notice tone="info" title="Video tutorials">No video tutorials are included in this release – producing them needs filming that has not been done. The written guides above cover the same ground, and the platform is set up so admins can add video links later.</Notice></div>
      <p className="mt-6 text-xs text-muted">General guidance for orientation – not engineering advice for a specific building. Sources and assumptions for the calculations are listed in the project documentation.</p>
    </div>
  );
}
