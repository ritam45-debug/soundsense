"use client";
/**
 * Live microphone monitoring. Audio is analysed in this tab and never stored or sent anywhere.
 * Processing (echo cancel, noise suppression, auto gain) is turned OFF so real problems are not hidden.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { FeatureTracker, type FingerprintResult } from "./audio";
import { Calibration, computeStats, rmsToDbfs, SILENCE_DB, type LevelStats } from "./measurement";

export interface LiveState {
  status: "idle" | "asking" | "running" | "error";
  error: string;
  elapsedS: number;
  dbfs: number;
  /** Stats over the recent window (≥10 s of data) or null while warming up. */
  stats: LevelStats | null;
  fingerprint: FingerprintResult | null;
  clipping: boolean;
  feedback: { active: boolean; hz: number | null; persistenceS: number; growing: boolean };
  sampleRate: number;
  levels: number[]; // last ~120 s, one per second (dBFS), for the trend line
}
const INIT: LiveState = { status: "idle", error: "", elapsedS: 0, dbfs: SILENCE_DB, stats: null, fingerprint: null, clipping: false, feedback: { active: false, hz: null, persistenceS: 0, growing: false }, sampleRate: 0, levels: [] };
export const CAL_KEY = "ss-calibration-v1";
export function loadCalibration(): Calibration {
  try { const s = localStorage.getItem(CAL_KEY); if (s) { const c = JSON.parse(s); if (c?.status === "single_point") return c; } } catch {}
  return { status: "uncalibrated" };
}
export const micMessage = (e: any) =>
  e?.name === "NotAllowedError" ? "Microphone permission was denied. Allow it in the browser's address-bar settings and try again."
  : e?.name === "NotFoundError" ? "No microphone was found on this device."
  : e?.name === "NotReadableError" ? "The microphone is in use by another app or cannot be read."
  : `Could not start the microphone: ${e?.message ?? e}`;

/** `onTick` runs about once per second with the current state; use it to evaluate alerts. */
export function useLiveAudio(onTick?: (s: LiveState) => void, windowS = 30) {
  const [state, setState] = useState<LiveState>(INIT);
  const rt = useRef<{ ctx?: AudioContext; stream?: MediaStream; raf?: number; tracker?: FeatureTracker; secLevels: number[]; allLevels: number[]; start: number; lastSec: number; acc: number[] } | null>(null);
  const tick = useRef(onTick); tick.current = onTick;

  const stop = useCallback(() => {
    const r = rt.current; if (!r) return;
    if (r.raf) cancelAnimationFrame(r.raf);
    r.stream?.getTracks().forEach((t) => t.stop());
    r.ctx?.close().catch(() => {});
    rt.current = null;
    setState((s) => ({ ...s, status: "idle" }));
  }, []);
  useEffect(() => () => { const r = rt.current; if (r) { if (r.raf) cancelAnimationFrame(r.raf); r.stream?.getTracks().forEach((t) => t.stop()); r.ctx?.close().catch(() => {}); } }, []);

  const start = useCallback(async () => {
    if (rt.current) return;
    if (!navigator.mediaDevices?.getUserMedia) { setState({ ...INIT, status: "error", error: "This browser cannot access a microphone here. Microphone access needs a secure (https) connection and a modern browser." }); return; }
    setState({ ...INIT, status: "asking" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); await ctx.resume();
      const an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0; ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      const tracker = new FeatureTracker(ctx.sampleRate, 20);
      const now = performance.now();
      const r = { ctx, stream, tracker, secLevels: [] as number[], allLevels: [] as number[], start: now, lastSec: now, acc: [] as number[], raf: 0 };
      rt.current = r;
      setState({ ...INIT, status: "running", sampleRate: ctx.sampleRate });
      stream.getAudioTracks()[0]?.addEventListener("ended", () => { stop(); setState((s) => ({ ...s, status: "error", error: "The microphone stopped (unplugged or permission removed)." })); });
      let last100 = now; let acc100: number[] = [];
      const loop = () => {
        if (!rt.current) return;
        an.getFloatTimeDomainData(buf);
        const t = performance.now();
        tracker.push(buf, t);
        let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        acc100.push(sum / buf.length);
        if (t - last100 >= 100) {
          const ms = acc100.reduce((a, b) => a + b, 0) / acc100.length; acc100 = []; last100 = t;
          r.secLevels.push(rmsToDbfs(Math.sqrt(ms)));
        }
        if (t - r.lastSec >= 1000) {
          r.lastSec = t;
          const lv = r.secLevels; r.secLevels = [];
          const secLeq = lv.length ? 10 * Math.log10(lv.reduce((a, b) => a + 10 ** (b / 10), 0) / lv.length) : SILENCE_DB;
          r.allLevels.push(...lv);
          const keep = windowS * 10; if (r.allLevels.length > keep) r.allLevels.splice(0, r.allLevels.length - keep);
          const stats = r.allLevels.length >= 100 ? computeStats(r.allLevels) : null;
          const fp = (t - r.start) > 5000 ? tracker.fingerprint() : null;
          const trend = [...(rt.current ? (r as any).trend ?? [] : []), secLeq].slice(-120); (r as any).trend = trend;
          const next: LiveState = { status: "running", error: "", elapsedS: (t - r.start) / 1000, dbfs: secLeq, stats, fingerprint: fp, clipping: tracker.clipping(), feedback: tracker.feedback(), sampleRate: ctx.sampleRate, levels: trend };
          setState(next); tick.current?.(next);
        }
        r.raf = requestAnimationFrame(loop);
      };
      r.raf = requestAnimationFrame(loop);
    } catch (e: any) { rt.current = null; setState({ ...INIT, status: "error", error: micMessage(e) }); }
  }, [stop, windowS]);

  return { state, start, stop };
}
