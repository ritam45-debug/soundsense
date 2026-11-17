"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Mic, Save } from "lucide-react";
import { Field, Notice, useToast } from "./ui";
import { RoomCalculator } from "./RoomCalculator";
import { call, ClientError } from "@/lib/client";
import { Answers, Question, STEPS, validateAnswers, visibleQuestions } from "@/lib/acoustics/questionnaire";

type Slide = { kind: "step"; index: number } | { kind: "room" };
const ROOM_AT = STEPS.length - 1; // inserted before the final consent step
const SLIDES: Slide[] = [...STEPS.slice(0, ROOM_AT).map((_, i) => ({ kind: "step", index: i }) as Slide), { kind: "room" }, { kind: "step", index: ROOM_AT }];

export function Wizard({ assessment, room, onDone }: { assessment: any; room: any; onDone: () => void }) {
  const toast = useToast();
  const [answers, setAnswers] = useState<Answers>(assessment.answers ?? {});
  const [slide, setSlide] = useState(Math.min(assessment.step ?? 0, SLIDES.length - 1));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const top = useRef<HTMLDivElement>(null);

  const save = useCallback(async (a: Answers, step: number) => {
    setState("saving");
    try {
      await call(`/api/assessments/${assessment.id}`, { method: "PATCH", body: { answers: a, step } });
      dirty.current = false; setState("saved");
    } catch (e: any) { setState("error"); throw e; }
  }, [assessment.id]);

  const set = (id: string, v: any) => {
    const next = { ...answers, [id]: v };
    if (v === "" || v === undefined || (Array.isArray(v) && !v.length)) delete next[id];
    setAnswers(next); dirty.current = true; setErrors((e) => { const { [id]: _, ...rest } = e; return rest; });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(next, slide).catch(() => {}), 1500);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { top.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }, [slide]);

  const cur = SLIDES[slide];
  const step = cur.kind === "step" ? STEPS[cur.index] : null;
  const questions = useMemo(() => (step ? visibleQuestions(step, answers) : []), [step, answers]);

  function stepErrors(): Record<string, string> {
    if (!step) return {};
    const { errors } = validateAnswers(answers, true);
    return Object.fromEntries(questions.filter((q) => errors[q.id]).map((q) => [q.id, errors[q.id]]));
  }
  async function go(to: number) {
    clearTimeout(timer.current);
    if (to > slide) { const e = stepErrors(); setErrors(e); if (Object.keys(e).length) { toast("Please answer the highlighted questions.", "bad"); document.getElementById(`q-${Object.keys(e)[0]}`)?.scrollIntoView({ block: "center" }); return; } }
    try { await save(answers, to); setSlide(to); } catch (e: any) { toast(e.message, "bad"); }
  }
  async function submit() {
    const e = stepErrors(); setErrors(e);
    if (Object.keys(e).length) return toast("Please accept the consent to continue.", "bad");
    setSubmitting(true);
    try {
      await save(answers, slide);
      await call(`/api/assessments/${assessment.id}/submit`, { body: { share_with_chat: answers.consent_chat === true } });
      toast("Assessment submitted. Your diagnosis is ready."); onDone();
    } catch (e: any) {
      if (e instanceof ClientError && Object.keys(e.fields).length) {
        setErrors(e.fields);
        const idx = SLIDES.findIndex((s) => s.kind === "step" && STEPS[s.index].questions.some((q) => e.fields[q.id]));
        if (idx >= 0) setSlide(idx);
      }
      toast(e.message, "bad");
    } finally { setSubmitting(false); }
  }

  const last = slide === SLIDES.length - 1;
  return (
    <div ref={top} className="scroll-mt-20">
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold">Step {slide + 1} of {SLIDES.length}: {step ? step.title : "Room details"}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
            {state === "saving" && "Saving…"}{state === "saved" && <><Check className="h-3.5 w-3.5 text-good" /> Draft saved</>}{state === "error" && <span className="text-bad">Not saved – check connection</span>}
          </span>
        </div>
        <div className="flex gap-1" role="progressbar" aria-valuemin={1} aria-valuemax={SLIDES.length} aria-valuenow={slide + 1} aria-label="Questionnaire progress">
          {SLIDES.map((_, i) => <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= slide ? "bg-brand" : "bg-raised"}`} />)}
        </div>
      </div>

      <div className="card p-4 sm:p-6">
        {step ? (
          <>
            <h2 className="font-display text-xl font-semibold">{step.title}</h2>
            <p className="mb-5 mt-1 text-sm text-muted">{step.description}</p>
            <div className="space-y-6">
              {questions.map((q) => <QuestionField key={q.id} q={q} value={answers[q.id]} error={errors[q.id]} onChange={(v) => set(q.id, v)} />)}
            </div>
          </>
        ) : (
          <>
            <h2 className="font-display text-xl font-semibold">Room details & sound check <span className="ml-1 text-sm font-normal text-muted">(optional, recommended)</span></h2>
            <p className="mb-5 mt-1 text-sm text-muted">Size and materials let us calculate how long sound lingers. A short microphone recording gives us the noise level people actually experience. Skip either if you can&apos;t do it now – the diagnosis will say what it could not check.</p>
            <RoomCalculator environment={answers.environment ?? "other"} initial={room} assessmentId={assessment.id} />
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-raised p-3 text-sm">
              <Mic className="h-5 w-5 text-brand" />
              <p className="flex-1">Record room noise and speech with your device&apos;s microphone (opens in a new tab; your answers are already saved).</p>
              <Link target="_blank" href={`/app/measure?assessment=${assessment.id}`} className="btn-secondary btn-sm">Open sound check</Link>
            </div>
          </>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <button className="btn-secondary" onClick={() => go(slide - 1)} disabled={slide === 0}><ChevronLeft className="h-4 w-4" /> Back</button>
        <button className="btn-ghost btn-sm hidden sm:inline-flex" onClick={() => save(answers, slide).then(() => toast("Draft saved. You can finish later.")).catch((e) => toast(e.message, "bad"))}><Save className="h-4 w-4" /> Save & finish later</button>
        {last ? <button key="submit" className="btn-primary" onClick={submit} disabled={submitting}>{submitting ? "Analysing…" : "Submit & get diagnosis"}</button> : <button key="next" className="btn-primary" onClick={() => go(slide + 1)}>Next <ChevronRight className="h-4 w-4" /></button>}
      </div>
      {last && <div className="mt-4"><Notice tone="info">We analyse your answers with a transparent rule-based engine – no AI guesses. You will see exactly which answers raised each possibility and how confident we are.</Notice></div>}
    </div>
  );
}

function QuestionField({ q, value, onChange, error }: { q: Question; value: any; onChange: (v: any) => void; error?: string }) {
  const id = `q-${q.id}`;
  const common = { id, "aria-invalid": !!error, "aria-describedby": error ? `${id}-e` : undefined } as const;
  let input: React.ReactNode;
  switch (q.type) {
    case "single":
    case "multi": {
      const multi = q.type === "multi";
      const sel: string[] = multi ? (Array.isArray(value) ? value : []) : value ? [value] : [];
      const toggle = (v: string) => {
        if (!multi) return onChange(v);
        // "none / not sure" style answers are exclusive.
        const exclusive = ["nothing", "none", "not_sure"].includes(v);
        const next = sel.includes(v) ? sel.filter((x) => x !== v) : exclusive ? [v] : [...sel.filter((x) => !["nothing", "none", "not_sure"].includes(x)), v];
        onChange(next);
      };
      input = (
        <div className={`grid gap-2 ${q.options!.length > 5 ? "sm:grid-cols-2" : ""}`} role={multi ? "group" : "radiogroup"} aria-labelledby={`${id}-l`}>
          {q.options!.map((o) => {
            const on = sel.includes(o.value);
            return (
              <label key={o.value} className={`flex min-h-[48px] cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${on ? "border-brand bg-brand-soft" : "border-line hover:bg-raised"}`}>
                <input type={multi ? "checkbox" : "radio"} name={q.id} checked={on} onChange={() => toggle(o.value)} className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[rgb(var(--brand))]" />
                <span><span className="font-medium">{o.label}</span>{o.hint && <span className="block text-[13px] text-muted">{o.hint}</span>}</span>
              </label>
            );
          })}
        </div>
      );
      break;
    }
    case "consent":
      input = (
        <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 text-sm ${value ? "border-brand bg-brand-soft" : "border-line"}`}>
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--brand))]" {...common} />
          <span>{q.label}</span>
        </label>
      );
      break;
    case "longtext":
      input = <textarea {...common} className="input min-h-[96px] py-2" rows={4} maxLength={q.maxLen} placeholder={q.placeholder} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "number":
      input = <input {...common} className="input max-w-[200px]" type="number" inputMode="numeric" min={q.min} max={q.max} placeholder={q.placeholder} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />;
      break;
    default:
      input = <input {...common} className="input" type={q.type === "email" ? "email" : q.type === "tel" ? "tel" : "text"} maxLength={q.maxLen} placeholder={q.placeholder} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
  if (q.type === "consent") return <div id={`${id}-w`}>{input}{error && <p id={`${id}-e`} className="err">{error}</p>}</div>;
  return (
    <div className={q.followUp ? "border-l-2 border-brand/40 pl-3.5" : ""}>
      <p id={`${id}-l`} className="label">{q.label}{q.required && <span className="text-bad" aria-hidden> *</span>}</p>
      {q.help && <p className="hint mb-2 mt-0">{q.help}</p>}
      {input}
      {error && <p id={`${id}-e`} className="err" role="alert">{error}</p>}
    </div>
  );
}
void Field;
