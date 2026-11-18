"use client";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mic, MicOff } from "lucide-react";
import { AlertCard, BasisBadge, H2, RoomSelect, SeverityBadge, Sparkline } from "@/components/ws";
import { Badge, Field, Notice, PageHeader } from "@/components/ui";
import { loadCalibration, useLiveAudio, type LiveState } from "@/lib/acoustics/useLiveAudio";
import { NOISE_LABEL } from "@/lib/acoustics/audio";
import { screenLevel, BAND_LABEL } from "@/lib/acoustics/screening";
import { useWorkspace } from "@/lib/workspace/useWorkspace";
import { evaluateLive } from "@/lib/workspace/live";
import { acknowledge, addReading, openAlerts, resolveAlert } from "@/lib/workspace/ops";
import { loadWs } from "@/lib/workspace/store";
import { SILENCE_DB } from "@/lib/acoustics/measurement";

function Inner() {
  const sp = useSearchParams();
  const [w, update] = useWorkspace();
  const [roomId, setRoomId] = useState(sp.get("room") ?? "");
  const roomRef = useRef(roomId); roomRef.current = roomId;
  const lastSave = useRef(0);
  const { state, start, stop } = useLiveAudio((s: LiveState) => {
    const cal = loadCalibration();
    const now = Date.now();
    update((ws) => {
      const { events, reading } = evaluateLive(ws, roomRef.current || null, s, cal, now);
      if (reading && now - lastSave.current > 15_000) {
        lastSave.current = now;
        addReading(ws, { roomId: roomRef.current || null, source: "live", basis: reading.basis === "calibrated" ? "calibrated" : "estimate", value: reading.value, low: reading.low, high: reading.high, noiseClass: s.fingerprint?.top?.id, label: reading.status });
      }
      if (ws.settings.notify.browser && typeof Notification !== "undefined" && Notification.permission === "granted") {
        for (const e of events) if (e.notify) { const a = ws.alerts.find((x) => x.id === e.alertId); if (a) try { new Notification(`SoundSense: ${a.title}`, { body: a.reading }); } catch {} }
      }
    });
  });
  useEffect(() => () => stop(), [stop]);

  const cal = typeof window !== "undefined" ? loadCalibration() : { status: "uncalibrated" as const };
  const reading = state.stats ? screenLevel(state.stats, cal, w.settings.screening) : null;
  const room = w.rooms.find((r) => r.id === roomId) ?? null;
  const alerts = openAlerts(w, roomId || null);
  const fp = state.fingerprint;
  const running = state.status === "running";

  return (
    <>
      <PageHeader title="Live monitoring" sub="Listens through this device's microphone and flags noise problems as they happen. Audio is analysed in this tab and never stored or uploaded; only readings and alerts are saved on this device." />
      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,320px)_auto] sm:items-end">
        <Field label="Room being monitored" htmlFor="room" hint={!w.rooms.length ? <>No rooms yet. <Link className="font-semibold text-brand" href="/app/rooms">Add one</Link> to keep history and alerts per room.</> : undefined}><RoomSelect w={w} value={roomId} onChange={setRoomId} /></Field>
        <div className="flex gap-2">{!running ? <button className="btn-primary" onClick={start} disabled={state.status === "asking"}><Mic className="h-4 w-4" /> {state.status === "asking" ? "Waiting for permission…" : "Start monitoring"}</button> : <button className="btn-danger" onClick={stop}><MicOff className="h-4 w-4" /> Stop monitoring</button>}</div>
      </div>
      {state.status === "error" && <p className="err mb-4" role="alert">{state.error}</p>}
      {w.alerts.length > 0 && !running && state.status === "idle" && <p className="mb-4 text-sm text-muted">Monitoring is stopped. Alerts below stay until they are resolved.</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <section className="card p-4 sm:p-5" aria-live="off">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm text-muted">Level right now (relative to this device&apos;s digital maximum)</p>
                <p className="font-display text-4xl font-semibold tabular-nums">{running ? state.dbfs.toFixed(1) : "–"}<span className="ml-1 text-base font-normal text-muted">dBFS</span></p>
              </div>
              <div className="text-right text-sm text-muted tabular-nums">{running ? `${Math.floor(state.elapsedS / 60)}:${String(Math.floor(state.elapsedS % 60)).padStart(2, "0")} monitored` : "Not monitoring"}</div>
            </div>
            <Sparkline values={state.levels} label="Level over the last two minutes" min={SILENCE_DB + 20} max={0} />
            <div className="mt-3 space-y-2 text-sm">
              {!running && <p className="text-muted">Press start. The first screening reading needs about 10 seconds of listening.</p>}
              {running && !reading && <p>Warming up… collecting the first 10 seconds.</p>}
              {reading && (
                <div className="rounded-lg bg-raised p-3">
                  <p className="flex flex-wrap items-center gap-2"><BasisBadge b={reading.basis === "calibrated" ? "calibrated" : "estimated"} /><SeverityBadge s={reading.severity} /><span className="font-semibold">{BAND_LABEL[reading.band]}</span></p>
                  <p className="mt-1.5 text-lg font-semibold tabular-nums">{reading.basis === "calibrated" ? `${reading.value} dB (calibrated, single-point)` : `≈ ${reading.value} dB, could be ${reading.low}–${reading.high}`}</p>
                  <p className="mt-1 text-muted">{reading.status}</p>
                  {reading.basis !== "calibrated" && <p className="mt-1 text-muted">Severity uses the low end of the range, so an uncalibrated phone or laptop microphone can never raise an urgent (red) alert. <Link className="font-semibold text-brand" href="/app/measure">Calibrate against a sound level meter</Link> for a calibrated reading.</p>}
                </div>
              )}
            </div>
          </section>

          <section className="card p-4 sm:p-5">
            <H2>What kind of noise is it?</H2>
            {!running ? <p className="text-sm text-muted">Appears while monitoring.</p> : !fp || fp.status === "too_short" ? <p className="text-sm text-muted">Listening… needs about 5 seconds.</p> : fp.status === "too_quiet" ? <p className="text-sm">Too quiet to analyse. Move the microphone closer or check it is not muted.</p> : !fp.top ? <p className="text-sm">No clear match. The sound does not fit any of the patterns checked.</p> : (
              <div className="space-y-2 text-sm">
                <p className="flex flex-wrap items-center gap-2"><span className="font-semibold">Possibly: {NOISE_LABEL[fp.top.id]}</span><Badge tone={fp.top.band === "high" ? "good" : fp.top.band === "medium" ? "warn" : "neutral"}>{fp.top.band} confidence · {Math.round(fp.top.confidence * 100)}%</Badge></p>
                <ul className="list-disc pl-5">{fp.top.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
                {fp.alternatives.length > 0 && <p className="text-muted">Other possibilities: {fp.alternatives.map((a) => `${NOISE_LABEL[a.id]} (${Math.round(a.confidence * 100)}%)`).join("; ")}</p>}
                <p className="text-xs text-muted">{fp.caveats[0]}</p>
              </div>
            )}
          </section>
          <section className="card grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            <div><H2>Input overload</H2><p className="text-sm">{!running ? "–" : state.clipping ? "Yes: the input is hitting its maximum. Lower the gain or move back." : "No clipping detected."}</p></div>
            <div><H2>Feedback indicator</H2><p className="text-sm">{!running ? "–" : state.feedback.active ? `A steady tone near ${Math.round(state.feedback.hz ?? 0)} Hz for ${state.feedback.persistenceS.toFixed(0)} s${state.feedback.growing ? " and getting louder" : ""}: possible feedback.` : "No steady tone detected."}</p></div>
          </section>
        </div>

        <div className="space-y-3">
          <H2>Alerts{room ? ` for ${room.name}` : ""} ({alerts.length})</H2>
          {!alerts.length ? <Notice tone="good" title="No open alerts">Nothing needs attention right now{running ? "" : " (monitoring is stopped)"}.</Notice> : alerts.map((a) => (
            <AlertCard key={a.id} a={a} room={w.rooms.find((r) => r.id === a.roomId)} onAck={() => update((x) => acknowledge(x, a.id))} onResolve={() => update((x) => resolveAlert(x, a.id))} />
          ))}
          <p className="text-xs text-muted">Repeats of the same problem update one alert instead of creating new ones. An alert clears on its own only after the level drops a safe margin below its threshold ({w.settings.screening.hysteresisDb} dB), and a cleared alert that returns within {w.settings.screening.cooldownMin} minutes reopens quietly. <Link className="font-semibold text-brand" href="/app/settings">Change these in settings</Link>.</p>
        </div>
      </div>
    </>
  );
}
export default function Page() { return <Suspense><Inner /></Suspense>; }
