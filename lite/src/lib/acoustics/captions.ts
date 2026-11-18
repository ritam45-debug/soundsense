/** Caption lines from Web Speech API results. Kept in memory only; the app never writes a transcript to storage. */
export interface Line { id: number; text: string; final: boolean; lowConfidence: boolean }
export const MAX_LINES = 60;
export const LANGUAGES: { code: string; label: string }[] = [
  { code: "en-US", label: "English (US)" }, { code: "en-GB", label: "English (UK)" }, { code: "en-IN", label: "English (India)" }, { code: "hi-IN", label: "Hindi" },
  { code: "bn-IN", label: "Bengali" }, { code: "ta-IN", label: "Tamil" }, { code: "te-IN", label: "Telugu" }, { code: "mr-IN", label: "Marathi" }, { code: "es-ES", label: "Spanish" }, { code: "fr-FR", label: "French" }, { code: "de-DE", label: "German" },
];
/** Merge a recognition result list into the caption lines. `results` mimics SpeechRecognitionResultList. */
export function mergeResults(prev: Line[], results: { isFinal: boolean; 0: { transcript: string; confidence: number } }[], fromIndex: number, nextId: () => number): Line[] {
  const keep = prev.filter((l) => l.final);
  const out = [...keep];
  for (let i = fromIndex; i < results.length; i++) {
    const r = results[i]; const t = r[0].transcript.trim(); if (!t) continue;
    out.push({ id: nextId(), text: t, final: r.isFinal, lowConfidence: r.isFinal && r[0].confidence > 0 && r[0].confidence < 0.6 });
  }
  return out.slice(-MAX_LINES);
}
export const speechSupported = () => typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
