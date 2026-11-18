"use client";
import { useEffect, useRef, useState } from "react";
import { Captions, Download, Trash2 } from "lucide-react";
import { Badge, Field, Notice, PageHeader } from "@/components/ui";
import { LANGUAGES, mergeResults, speechSupported, type Line } from "@/lib/acoustics/captions";
import { NOISE_LABEL } from "@/lib/acoustics/audio";
import { useLiveAudio } from "@/lib/acoustics/useLiveAudio";
import { downloadBytes } from "@/lib/workspace/simplePdf";
import { useWorkspace } from "@/lib/workspace/useWorkspace";

export default function Page() {
  const [w, update] = useWorkspace();
  const [consent, setConsent] = useState(false); const [on, setOn] = useState(false);
  const [lines, setLines] = useState<Line[]>([]); const [err, setErr] = useState(""); const [big, setBig] = useState(false);
  const rec = useRef<any>(null); const id = useRef(0); const want = useRef(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const live = useLiveAudio();
  useEffect(() => setSupported(speechSupported()), []);
  useEffect(() => () => { want.current = false; rec.current?.stop?.(); }, []);
  const overlap = live.state.fingerprint?.status === "ok" && live.state.fingerprint.top?.id === "voices" && live.state.fingerprint.top.band !== "low";

  async function start() {
    setErr(""); const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition; if (!SR) return;
    const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = w.settings.captionLang; r.maxAlternatives = 1;
    r.onresult = (e: any) => setLines((p) => mergeResults(p, Array.from(e.results as ArrayLike<any>), e.resultIndex, () => ++id.current));
    r.onerror = (e: any) => { if (e.error === "no-speech" || e.error === "aborted") return; want.current = false; setOn(false); setErr(e.error === "not-allowed" || e.error === "service-not-allowed" ? "Microphone or speech-recognition permission was denied." : e.error === "network" ? "Speech recognition needs an internet connection (the browser's recognition service could not be reached)." : `Speech recognition stopped: ${e.error}.`); };
    r.onend = () => { if (want.current) { try { r.start(); } catch {} } else setOn(false); };
    rec.current = r; want.current = true; try { r.start(); setOn(true); live.start(); } catch (e: any) { setErr(e.message); }
  }
  function stop() { want.current = false; rec.current?.stop?.(); setOn(false); live.stop(); }
  return (
    <>
      <PageHeader title="Speech clarity and captions" sub="Live captions show what a room's microphone can actually understand, and help people who are hard of hearing follow along." />
      <div className="max-w-3xl space-y-4">
        <Notice tone="warn" title="Where the audio goes">In most browsers (including Chrome and Edge) live captions are produced by the browser vendor&apos;s online speech service, so your speech is sent to that service while captions are on. SoundSense itself stores no audio and no transcript: the captions below exist only on this page and disappear when you clear them or leave.</Notice>
        {supported === false && <Notice tone="info" title="Not supported in this browser">This browser has no speech-recognition feature. Try Chrome or Edge. The overlapping-voices indicator on the Live monitoring page still works.</Notice>}
        {supported && (
          <>
            <label className="flex min-h-[44px] items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-[rgb(var(--brand))]" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={on} /> I understand that my speech is sent to the browser&apos;s speech service to make captions, and I agree to turn captions on.</label>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,260px)_auto] sm:items-end">
              <Field label="Spoken language" htmlFor="lang"><select id="lang" className="input" value={w.settings.captionLang} disabled={on} onChange={(e) => update((x) => { x.settings.captionLang = e.target.value; })}>{LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></Field>
              <div className="flex flex-wrap gap-2">{!on ? <button className="btn-primary" disabled={!consent} onClick={start}><Captions className="h-4 w-4" /> Start captions</button> : <button className="btn-danger" onClick={stop}>Stop captions</button>}
                <button className="btn-secondary" aria-pressed={big} onClick={() => setBig(!big)}>Larger text</button></div>
            </div>
            {err && <p className="err" role="alert">{err}</p>}
            <section className="card min-h-[220px] p-4" aria-label="Live captions"><div className={`space-y-2 ${big ? "text-2xl leading-snug" : "text-base"}`} role="log" aria-live="polite" aria-relevant="additions text">
              {!lines.length && <p className="text-muted">{on ? "Listening… speak normally." : "Captions appear here."}</p>}
              {lines.map((l) => <p key={l.id} className={l.final ? "" : "text-muted"}>{l.text}{l.lowConfidence && <span className="ml-2 align-middle"><Badge tone="warn">unsure</Badge></span>}</p>)}</div></section>
            <div className="flex flex-wrap gap-2"><button className="btn-secondary btn-sm" disabled={!lines.length} onClick={() => setLines([])}><Trash2 className="h-4 w-4" /> Clear captions</button><button className="btn-secondary btn-sm" disabled={!lines.length} onClick={() => downloadBytes(new TextEncoder().encode(lines.filter((l) => l.final).map((l) => l.text).join("\n")), "captions.txt", "text/plain")}><Download className="h-4 w-4" /> Save as text file</button></div>
          </>)}
        <section className="card space-y-2 p-4 text-sm" aria-live="polite"><h2 className="font-display text-[15px] font-semibold">Overlap and clarity indicators</h2>
          <p>{!on ? "Start captions to also check for overlapping voices." : overlap ? <><Badge tone="warn">Overlapping voices likely</Badge> The room sounds like several people talking at once ({Math.round((live.state.fingerprint?.top?.confidence ?? 0) * 100)}% confidence, heuristic). Captions are likely to be less accurate.</> : "No clear sign of overlapping voices right now."}</p>
          {live.state.fingerprint?.top && on && <p className="text-muted">Sound type: possibly {NOISE_LABEL[live.state.fingerprint.top.id].toLowerCase()} (heuristic).</p>}
        </section>
        <section className="card p-4 text-sm"><h2 className="mb-2 font-display text-[15px] font-semibold">Microphone coverage tips</h2>
          <ul className="list-disc space-y-1 pl-5"><li>Keep every talker within about 1 m (desk microphone) to 3 m (table or array microphone) of a pickup.</li><li>Captions that miss or garble people in one seat usually mean that seat is too far from the microphone.</li><li>Ask for one speaker at a time. Overlapping voices defeat both people and captions.</li><li>Reduce room noise and echo first. Captions are a good test of whether a room really works for speech.</li></ul></section>
      </div>
    </>
  );
}
