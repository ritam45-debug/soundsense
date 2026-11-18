"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, CircleAlert, CircleX, Volume2 } from "lucide-react";
import { RoomSelect } from "@/components/ws";
import { Field, Notice, PageHeader } from "@/components/ui";
import { FeatureTracker } from "@/lib/acoustics/audio";
import { computeStats, rmsToDbfs } from "@/lib/acoustics/measurement";
import { evaluateReadiness, VERDICT_LABEL, type Finding, type Verdict } from "@/lib/acoustics/readiness";
import { screenLevel } from "@/lib/acoustics/screening";
import { loadCalibration, micMessage } from "@/lib/acoustics/useLiveAudio";
import { useWorkspace } from "@/lib/workspace/useWorkspace";
import { audit } from "@/lib/workspace/store";
import { addReading } from "@/lib/workspace/ops";

const ICON = { ok: <CheckCircle2 className="h-4 w-4 shrink-0 text-good" aria-label="Passed" />, warn: <CircleAlert className="h-4 w-4 shrink-0 text-warn" aria-label="Warning" />, fail: <CircleX className="h-4 w-4 shrink-0 text-bad" aria-label="Failed" /> };
const TONE: Record<Verdict, string> = { ready: "border-good bg-good/10", warnings: "border-warn bg-warn/10", attention: "border-bad bg-bad/10" };

function Inner() {
  const sp = useSearchParams(); const [w, update] = useWorkspace();
  const [roomId, setRoomId] = useState(sp.get("room") ?? "");
  const [phase, setPhase] = useState<"idle" | "listening" | "tone" | "done">("idle");
  const [err, setErr] = useState(""); const [secs, setSecs] = useState(0);
  const [echo, setEcho] = useState(false);
  const [heard, setHeard] = useState<boolean | null>(null);
  const [toneDone, setToneDone] = useState(false);
  const [res, setRes] = useState<{ verdict: Verdict; findings: Finding[] } | null>(null);
  const [partial, setPartial] = useState<any>(null);

  async function run() {
    setErr(""); setRes(null); setHeard(null); setToneDone(false); setPhase("listening"); setSecs(0);
    const online = typeof navigator !== "undefined" && "onLine" in navigator ? navigator.onLine : null;
    const c: any = (navigator as any).connection;
    const slowLink = c ? (["slow-2g", "2g"].includes(c.effectiveType) || (typeof c.downlink === "number" && c.downlink < 1.5)) : null;
    let micFound = false, speakerFound: boolean | null = null;
    let stream: MediaStream | null = null, ctx: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
      micFound = true;
      const devs = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      const outs = devs.filter((d) => d.kind === "audiooutput"); speakerFound = devs.some((d) => d.kind === "audiooutput") ? true : null; void outs;
    } catch (e: any) {
      if (e?.name === "NotFoundError") { micFound = false; } else { setErr(micMessage(e)); setPhase("idle"); return; }
    }
    let levels: number[] = []; let clipping = false, feedback = false;
    if (stream) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); await ctx.resume();
      const an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0; ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize); const tr = new FeatureTracker(ctx.sampleRate, 20);
      const t0 = performance.now(); let acc: number[] = []; let last = t0;
      await new Promise<void>((done) => {
        const loop = () => {
          const t = performance.now(); an.getFloatTimeDomainData(buf); tr.push(buf, t);
          let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; acc.push(s / buf.length);
          if (t - last >= 100) { levels.push(rmsToDbfs(Math.sqrt(acc.reduce((a, b) => a + b, 0) / acc.length))); acc = []; last = t; }
          if (tr.clipping(3)) clipping = true;
          setSecs((t - t0) / 1000);
          if (t - t0 >= 10_000) return done(); requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });
      feedback = tr.feedback(3).active;
      stream.getTracks().forEach((t) => t.stop()); ctx.close().catch(() => {});
    }
    const stats = levels.length >= 50 ? computeStats(levels) : null;
    const signal = !!stats && stats.maxDb > -80;
    const reading = stats ? screenLevel(stats, loadCalibration(), w.settings.screening) : null;
    setPartial({ micFound, speakerFound, signal, clipping, feedback, online, slowLink, noiseSeverity: signal && reading ? reading.severity : null, noiseDb: signal && reading ? reading.value : null, noiseCalibrated: reading?.basis === "calibrated", noiseBasis: reading?.basis ?? "unavailable" });
    setPhase("tone");
  }
  function playTone() {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination);
    o.start(); g.gain.setTargetAtTime(0, ctx.currentTime + 1.2, 0.05); o.stop(ctx.currentTime + 1.5); o.onended = () => { ctx.close().catch(() => {}); setToneDone(true); };
  }
  function finish(h: boolean | null) {
    setHeard(h);
    const r = evaluateReadiness({ ...partial, speakerHeard: h, echoReported: echo });
    setRes(r); setPhase("done");
    update((x) => {
      x.readiness[roomId] = { at: new Date().toISOString(), verdict: r.verdict, micFound: partial.micFound, speakerFound: partial.speakerFound, speakerHeard: h, signal: partial.signal, clipping: partial.clipping, feedback: partial.feedback, noiseDb: partial.noiseDb, noiseBasis: partial.noiseBasis, online: partial.online, slowLink: partial.slowLink, echoReported: echo, findings: r.findings.filter((f) => f.level !== "ok").map((f) => f.text) };
      if (partial.noiseDb !== null) addReading(x, { roomId: roomId || null, source: "readiness", basis: partial.noiseBasis === "calibrated" ? "calibrated" : "estimate", value: partial.noiseDb, label: "Meeting Readiness check" });
      audit(x, `Meeting Readiness: ${VERDICT_LABEL[r.verdict]}${roomId ? ` (${x.rooms.find((y) => y.id === roomId)?.name ?? ""})` : ""}`);
    });
  }
  return (
    <>
      <PageHeader title="Test my room" sub="A 10-second check before an important meeting: microphone, speaker, room noise, feedback and connection. Audio is analysed on this device and not stored." />
      <div className="max-w-2xl space-y-4">
        <Field label="Room" htmlFor="room"><RoomSelect w={w} value={roomId} onChange={setRoomId} /></Field>
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[rgb(var(--brand))]" checked={echo} onChange={(e) => setEcho(e.target.checked)} disabled={phase === "listening"} /> Remote participants have told me they hear an echo in this room</label>
        {phase === "idle" || phase === "done" ? <button className="btn-primary" onClick={run}>{phase === "done" ? "Run the test again" : "Start the test"}</button> : null}
        {err && <p className="err" role="alert">{err}</p>}
        {phase === "listening" && <Notice tone="info" title="Listening for 10 seconds">Stay quiet and keep the room as it is for the meeting. ({Math.min(10, Math.ceil(secs))}/10 s)</Notice>}
        {phase === "tone" && (
          <div className="card space-y-3 p-4"><p className="font-semibold">Speaker check</p><p className="text-sm text-muted">Set the volume you would use in a meeting, then play the tone.</p>
            <button className="btn-secondary" onClick={playTone}><Volume2 className="h-4 w-4" /> Play test tone</button>
            {toneDone && <div className="flex flex-wrap items-center gap-2"><span className="text-sm">Did you hear it?</span><button className="btn-primary btn-sm" onClick={() => finish(true)}>Yes</button><button className="btn-secondary btn-sm" onClick={() => finish(false)}>No</button></div>}
            <button className="text-sm font-semibold text-brand" onClick={() => finish(null)}>Skip the speaker check</button></div>)}
        {res && (
          <section className={`rounded-xl border-2 p-5 ${TONE[res.verdict]}`} aria-live="polite">
            <p className="font-display text-2xl font-semibold">{VERDICT_LABEL[res.verdict]}</p>
            <ul className="mt-3 space-y-2 text-sm">{res.findings.map((f, i) => <li key={i} className="flex gap-2">{ICON[f.level]}<span>{f.text}{f.fix && <span className="block text-muted">{f.fix}</span>}</span></li>)}</ul>
            <p className="mt-3 text-xs text-muted">The noise figure is a screening estimate from this device&apos;s microphone unless marked calibrated. The connection line only says whether the browser reports being online. It is not a speed test.</p>
            {roomId && <p className="mt-2 text-sm"><Link className="font-semibold text-brand" href={`/app/rooms?id=${roomId}`}>Open the room</Link> to see how this affects its health score.</p>}
          </section>)}
      </div>
    </>
  );
}
export default function Page() { return <Suspense><Inner /></Suspense>; }
