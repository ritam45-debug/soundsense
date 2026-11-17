"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Info, Trash2 } from "lucide-react";
import { Field, Notice, Badge, useToast } from "./ui";
import { call } from "@/lib/client";
import { Calibration, LevelStats, MEASUREMENT_INSTRUCTIONS, ROUGH_UNCERTAINTY_DB, SILENCE_DB, computeStats, downsample, makeCalibration, relativeSnr, rmsToDbfs, roughEstimate } from "@/lib/acoustics/measurement";

type Kind = "ambient" | "speech" | "other";
const KIND_LABEL: Record<Kind, string> = { ambient: "Room noise (everyone quiet)", speech: "Speech (normal talking)", other: "Other / calibration clip" };
const CAL_KEY = "ss-calibration-v1";

interface Result { kind: Kind; durationS: number; stats: LevelStats; samples: number[]; startedAt: string }

export function MicMeter({ assessmentId, onSaved }: { assessmentId?: string; onSaved?: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<Kind>("ambient");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [state, setState] = useState<"idle" | "asking" | "recording" | "done">("idle");
  const [err, setErr] = useState("");
  const [db, setDb] = useState<number>(SILENCE_DB);
  const [peak, setPeak] = useState<number>(SILENCE_DB);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [cal, setCal] = useState<(Calibration & { device?: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [refDb, setRefDb] = useState(""); const [refInst, setRefInst] = useState("");
  const [local, setLocal] = useState<{ kind: Kind; stats: LevelStats }[]>([]);

  const canvas = useRef<HTMLCanvasElement>(null);
  const rt = useRef<{ ctx?: AudioContext; stream?: MediaStream; raf?: number; levels: number[]; start: number; lastTick: number; peak: number } | null>(null);

  useEffect(() => { try { const s = localStorage.getItem(CAL_KEY); if (s) setCal(JSON.parse(s)); } catch {} }, []);
  const stopTracks = useCallback(() => {
    const r = rt.current; if (!r) return;
    if (r.raf) cancelAnimationFrame(r.raf);
    r.stream?.getTracks().forEach((t) => t.stop());
    r.ctx?.close().catch(() => {});
  }, []);
  useEffect(() => stopTracks, [stopTracks]);

  async function start() {
    setErr(""); setResult(null);
    if (!navigator.mediaDevices?.getUserMedia) return setErr("This browser cannot access a microphone here. Microphone access needs a secure (https) connection and a modern browser.");
    setState("asking");
    try {
      // Processing OFF: noise suppression / auto-gain would hide exactly the problems we are trying to measure.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0; src.connect(an);
      const buf = new Float32Array(an.fftSize);
      const now = performance.now();
      rt.current = { ctx, stream, levels: [], start: now, lastTick: now, peak: SILENCE_DB };
      setDb(SILENCE_DB); setPeak(SILENCE_DB); setElapsed(0); setState("recording");
      let acc: number[] = []; // per-frame energies since last 100 ms tick
      const draw = () => {
        const r = rt.current!; an.getFloatTimeDomainData(buf);
        let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        acc.push(sum / buf.length);
        const c = canvas.current;
        if (c) {
          const g = c.getContext("2d")!; const w = c.width, h = c.height; g.clearRect(0, 0, w, h);
          const cs = getComputedStyle(document.documentElement);
          g.strokeStyle = `rgb(${cs.getPropertyValue("--brand")})`; g.lineWidth = 2; g.beginPath();
          const step = Math.max(1, Math.floor(buf.length / w));
          for (let x = 0; x < w; x++) { const v = buf[x * step] ?? 0; const y = h / 2 - Math.max(-1, Math.min(1, v * 3)) * (h / 2 - 2); x === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
          g.stroke();
        }
        const t = performance.now();
        if (t - r.lastTick >= 100) {
          const ms = acc.reduce((s, v) => s + v, 0) / acc.length; acc = []; r.lastTick = t;
          const level = rmsToDbfs(Math.sqrt(ms)); r.levels.push(level); r.peak = Math.max(r.peak, level);
          setDb(level); setPeak(r.peak); setElapsed((t - r.start) / 1000);
        }
        r.raf = requestAnimationFrame(draw);
      };
      rt.current.raf = requestAnimationFrame(draw);
    } catch (e: any) {
      setState("idle");
      setErr(e?.name === "NotAllowedError" ? "Microphone permission was denied. Allow it in the browser's address-bar settings and try again." : e?.name === "NotFoundError" ? "No microphone was found on this device." : `Could not start the microphone: ${e?.message ?? e}`);
    }
  }

  function stop() {
    const r = rt.current; if (!r) return;
    stopTracks();
    const seconds = (performance.now() - r.start) / 1000;
    if (r.levels.length < 20) { setState("idle"); return setErr("That recording was too short. Record for at least 10 seconds – 30 is better."); }
    const stats = computeStats(r.levels);
    setResult({ kind, durationS: Math.round(seconds * 10) / 10, stats, samples: downsample(r.levels), startedAt: new Date(Date.now() - seconds * 1000).toISOString() });
    setLocal((l) => [...l, { kind, stats }]);
    setState("done");
  }

  const activeCal: Calibration = cal && cal.status === "single_point" ? cal : { status: "uncalibrated" };
  async function save() {
    if (!result || !assessmentId) return;
    setSaving(true);
    try {
      await call(`/api/assessments/${assessmentId}/measurements`, { body: { kind: result.kind, label: label || undefined, startedAt: result.startedAt, durationS: Math.max(2, result.durationS), stats: result.stats, samples: result.samples, calibration: activeCal, deviceNote: navigator.userAgent.slice(0, 150), notes: notes || undefined } });
      toast("Recording saved to your assessment."); setResult(null); setState("idle"); setNotes(""); setLabel(""); onSaved?.();
    } catch (e: any) { toast(e.message, "bad"); } finally { setSaving(false); }
  }
  function saveCalibration() {
    if (!result) return;
    try {
      const c = { ...makeCalibration(Number(refDb), result.stats.leqDb, refInst.trim() || "unnamed reference meter"), device: navigator.userAgent.slice(0, 80) };
      if (!refInst.trim()) return setErr("Name the reference meter you used (for example “Class 2 sound level meter, model …”).");
      localStorage.setItem(CAL_KEY, JSON.stringify(c)); setCal(c); setErr(""); toast("Calibration saved on this device.");
    } catch (e: any) { setErr(e.message); }
  }
  const rough = roughEstimate(db);
  const pct = Math.max(0, Math.min(100, ((db + 80) / 80) * 100));
  const snrPair = (() => { const a = [...local].reverse().find((x) => x.kind === "ambient"); const s = [...local].reverse().find((x) => x.kind === "speech"); return a && s ? relativeSnr(s.stats, a.stats) : null; })();

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-4">
        <section className="card p-4 sm:p-5">
          <fieldset disabled={state === "recording" || state === "asking"} className="mb-4">
            <legend className="label">What are you recording?</legend>
            <div className="grid gap-2 sm:grid-cols-3">{(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <label key={k} className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm ${kind === k ? "border-brand bg-brand-soft" : "border-line"}`}><input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} className="accent-[rgb(var(--brand))]" />{KIND_LABEL[k]}</label>))}</div>
          </fieldset>

          <div className="rounded-xl bg-navy p-4 text-white">
            <canvas ref={canvas} width={640} height={110} className="h-[110px] w-full" aria-label="Live microphone waveform" role="img" />
            <div className="mt-3 flex items-end justify-between gap-3">
              <div aria-live="off">
                <p className="text-xs text-white/60">Level (relative to this device&apos;s digital maximum)</p>
                <p className="font-display text-4xl font-semibold tabular-nums">{state === "recording" ? db.toFixed(1) : state === "done" && result ? result.stats.leqDb.toFixed(1) : "–"}<span className="ml-1 text-base font-normal text-white/60">dBFS</span></p>
              </div>
              <div className="text-right text-sm tabular-nums text-white/70"><p>{Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, "0")}</p>{state === "recording" && <p>peak {peak.toFixed(1)}</p>}</div>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/15" role="meter" aria-label="Input level" aria-valuemin={-80} aria-valuemax={0} aria-valuenow={Math.round(db)}>
              <div className="h-full rounded-full" style={{ width: `${state === "recording" ? pct : 0}%`, background: db > -6 ? "rgb(var(--bad))" : db > -12 ? "rgb(var(--accent))" : "rgb(var(--brand))", transition: "width 80ms linear" }} />
            </div>
            {state === "recording" && db > -3 && <p className="mt-2 text-sm text-accent">Input is clipping – move the microphone away from the sound source.</p>}
            {state === "recording" && elapsed > 5 && peak < -70 && <p className="mt-2 text-sm text-accent">Almost no signal – is the microphone muted, covered or the wrong input selected?</p>}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {state !== "recording" ? <button className="btn-primary" onClick={start} disabled={state === "asking"}><Mic className="h-4 w-4" /> {state === "asking" ? "Waiting for permission…" : state === "done" ? "Record again" : "Start recording"}</button>
              : <button className="btn-danger" onClick={stop}><Square className="h-4 w-4" /> Stop & analyse</button>}
            <span className="text-sm text-muted">{state === "recording" ? (elapsed < 30 ? `Keep going – ${Math.ceil(30 - elapsed)} s to the recommended 30 s.` : "Good length. Stop whenever you are ready.") : "Aim for 30 seconds. Audio is analysed on this device and never uploaded."}</span>
          </div>
          {err && <p className="err mt-3" role="alert">{err}</p>}
        </section>

        {result && (
          <section className="card p-4 sm:p-5" aria-live="polite">
            <h3 className="font-display text-base font-semibold">Result – {KIND_LABEL[result.kind]}</h3>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-muted">Average (Leq)</dt><dd className="font-display text-xl font-semibold tabular-nums">{result.stats.leqDb.toFixed(1)}</dd></div>
              <div><dt className="text-muted">Background (L90)</dt><dd className="font-display text-xl font-semibold tabular-nums">{result.stats.l90Db.toFixed(1)}</dd></div>
              <div><dt className="text-muted">Peaks (L10)</dt><dd className="font-display text-xl font-semibold tabular-nums">{result.stats.l10Db.toFixed(1)}</dd></div>
              <div><dt className="text-muted">Length</dt><dd className="font-display text-xl font-semibold tabular-nums">{Math.round(result.durationS)} s</dd></div>
            </dl>
            <p className="mt-1 text-xs text-muted">All in dBFS. Lower (more negative) is quieter.</p>
            <Trace samples={result.samples} />
            <div className="mt-3 space-y-2 text-sm">
              <p><Badge>Relative level</Badge> <span className="ml-1">{result.stats.leqDb.toFixed(1)} dBFS – valid for comparing with other recordings made on this device.</span></p>
              <p><Badge tone="warn">Rough estimate</Badge> <span className="ml-1">≈ {roughEstimate(result.stats.leqDb).value} dB (±{ROUGH_UNCERTAINTY_DB} dB) – “{roughEstimate(result.stats.leqDb).label}”. Assumes a typical phone microphone; <strong>your device may differ by 20 dB or more</strong>.</span></p>
              {activeCal.status === "single_point" && <p><Badge tone="good">Single-point calibrated</Badge> <span className="ml-1">≈ {(result.stats.leqDb + activeCal.offsetDb!).toFixed(0)} dB SPL against “{activeCal.referenceInstrument}”. Valid near the calibration level only – not a certified measurement.</span></p>}
            </div>
            {snrPair && <p className="mt-3 rounded-lg bg-raised p-3 text-sm"><strong>Relative speech-to-noise this session: {snrPair.snrDb} dB ({snrPair.rating}).</strong> Around 25 dB or more is good for speech; under 10 dB is poor.</p>}
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Label (optional)" htmlFor="lbl"><input id="lbl" className="input" placeholder="e.g. Back-row seat, AC on" value={label} onChange={(e) => setLabel(e.target.value)} /></Field><Field label="Notes (optional)" htmlFor="nt"><input id="nt" className="input" placeholder="Anything unusual?" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
            <div className="mt-4 flex flex-wrap gap-2">
              {assessmentId ? <button className="btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save to my assessment"}</button> : <p className="text-sm text-muted">Open this page from an assessment (or pick one above) to save the recording. Unsaved results disappear when you leave.</p>}
              <button className="btn-secondary" onClick={() => { setResult(null); setState("idle"); }}>Discard</button>
            </div>
          </section>
        )}
      </div>

      <div className="space-y-4">
        <section className="card p-4">
          <h3 className="mb-2 flex items-center gap-2 font-display text-base font-semibold"><Info className="h-4 w-4 text-brand" /> How to record</h3>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">{MEASUREMENT_INSTRUCTIONS.map((s) => <li key={s}>{s}</li>)}</ol>
        </section>
        <section className="card p-4 text-sm">
          <h3 className="mb-2 font-display text-base font-semibold">What do the numbers mean?</h3>
          <ul className="space-y-2 leading-relaxed">
            <li><Badge>1 · Relative</Badge> dBFS – always valid for comparing on the same device.</li>
            <li><Badge tone="warn">2 · Rough estimate</Badge> adds an assumed offset, so treat it as “quiet / moderate / loud” only.</li>
            <li><Badge tone="good">3 · Calibrated</Badge> only after you compare against a reference sound-level meter. Even then it is not certified.</li>
          </ul>
        </section>
        <section className="card p-4 text-sm">
          <h3 className="mb-2 font-display text-base font-semibold">Optional: calibrate this device</h3>
          {cal?.status === "single_point" ? (
            <div><p>Saved: offset {cal.offsetDb! > 0 ? "+" : ""}{cal.offsetDb} dB against “{cal.referenceInstrument}” at {cal.referenceDb} dB.</p>
              <button className="btn-ghost btn-sm mt-2" onClick={() => { localStorage.removeItem(CAL_KEY); setCal(null); }}><Trash2 className="h-4 w-4" /> Remove calibration</button></div>
          ) : (
            <>
              <p className="mb-3 text-muted">With a reference sound-level meter next to your device, play a steady noise, record it here as “Other / calibration clip”, then enter what the reference meter read.</p>
              <div className="grid grid-cols-2 gap-2"><Field label="Reference reading (dB)" htmlFor="rd"><input id="rd" inputMode="decimal" className="input" value={refDb} onChange={(e) => setRefDb(e.target.value)} /></Field><Field label="Reference meter" htmlFor="ri"><input id="ri" className="input" value={refInst} onChange={(e) => setRefInst(e.target.value)} /></Field></div>
              <button className="btn-secondary btn-sm mt-3" onClick={saveCalibration} disabled={!result || result.kind !== "other" || !refDb}>Use last calibration clip</button>
              {(!result || result.kind !== "other") && <p className="hint">Record a clip with “Other / calibration clip” selected first.</p>}
            </>
          )}
        </section>
        <Notice tone="warn" title="Honest limits">Browser microphones are not measurement instruments. Use these results to compare and to guide the diagnosis – not to claim compliance with a noise standard.</Notice>
      </div>
    </div>
  );
}

function Trace({ samples }: { samples: number[] }) {
  const w = 600, h = 80; const min = Math.min(...samples), max = Math.max(...samples, min + 1);
  const pts = samples.map((v, i) => `${(i / Math.max(1, samples.length - 1)) * w},${h - ((v - min) / (max - min)) * (h - 8) - 4}`).join(" ");
  return (
    <figure className="mt-3"><svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full" role="img" aria-label={`Level over time, from ${min.toFixed(0)} to ${max.toFixed(0)} dBFS`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="rgb(var(--c1))" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>
      <figcaption className="text-xs text-muted">Level over time ({min.toFixed(0)} to {max.toFixed(0)} dBFS)</figcaption></figure>
  );
}
