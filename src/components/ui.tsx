"use client";
import { createContext, ReactNode, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from "lucide-react";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 p-8 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}
export function ErrorBox({ error, retry }: { error: { message: string } | string; retry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-bad/40 bg-bad/10 p-4 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden />
      <div className="flex-1">
        <p className="font-semibold">{typeof error === "string" ? error : error.message}</p>
        {retry && <button className="mt-2 text-sm font-semibold text-brand underline" onClick={retry}>Try again</button>}
      </div>
    </div>
  );
}
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-8 text-center">
      <p className="font-display text-base font-semibold">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold sm:text-[28px]">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <p className="hint">{hint}</p>}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}
type Tone = "neutral" | "good" | "warn" | "bad" | "brand";
const TONES: Record<Tone, string> = {
  neutral: "border-line bg-raised text-ink",
  good: "border-good/40 bg-good/10 text-good",
  warn: "border-warn/40 bg-warn/10 text-warn",
  bad: "border-bad/40 bg-bad/10 text-bad",
  brand: "border-brand/40 bg-brand-soft text-brand",
};
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}
export const statusTone = (s: string): Tone =>
  ({ completed: "good", confirmed: "good", submitted: "brand", requested: "warn", in_review: "brand", draft: "neutral", cancelled: "neutral", rejected: "bad", reschedule_requested: "warn", cancel_requested: "warn" } as Record<string, Tone>)[s] ?? "neutral";
export const statusLabel = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card p-4">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "good"; title?: string; children: ReactNode }) {
  const Icon = tone === "good" ? CheckCircle2 : tone === "warn" ? AlertTriangle : Info;
  const cls = tone === "good" ? "border-good/40 bg-good/10" : tone === "warn" ? "border-warn/40 bg-warn/10" : "border-brand/30 bg-brand-soft";
  return (
    <div className={`flex gap-3 rounded-lg border p-3.5 text-sm ${cls}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{title && <p className="font-semibold">{title}</p>}<div className="leading-relaxed">{children}</div></div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={id} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}
      className={`w-[calc(100%-24px)] ${wide ? "max-w-2xl" : "max-w-lg"} rounded-xl border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50`}>
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 id={id} className="font-display text-lg font-semibold">{title}</h2>
            <button className="btn-ghost btn-sm -mr-2 -mt-1" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`-mb-px min-h-[44px] whitespace-nowrap border-b-2 px-3.5 text-sm font-semibold ${value === t.id ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 rounded-full bg-raised px-1.5 py-0.5 text-[11px]">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Stars({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} of 5`} onClick={() => onChange(n)}
          className={`h-11 w-11 rounded-lg border text-lg ${n <= value ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:bg-raised"}`}>★</button>
      ))}
    </div>
  );
}

// ── toasts ──────────────────────────────────────────────────────────────────────────
interface T { id: number; tone: "good" | "bad"; text: string }
const ToastCtx = createContext<(text: string, tone?: "good" | "bad") => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const push = useCallback((text: string, tone: "good" | "bad" = "good") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, tone, text }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), tone === "bad" ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-3 md:bottom-6">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto flex max-w-md items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium shadow-card ${t.tone === "good" ? "border-good/50 bg-surface" : "border-bad/50 bg-surface"}`}>
            {t.tone === "good" ? <CheckCircle2 className="h-4 w-4 text-good" /> : <AlertTriangle className="h-4 w-4 text-bad" />} {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function Confirm({ open, title, children, confirmLabel = "Confirm", danger, busy, onConfirm, onClose }: { open: boolean; title: string; children: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-sm leading-relaxed text-muted">{children}</div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className={danger ? "btn-danger" : "btn-primary"} disabled={busy} onClick={onConfirm}>{busy ? "Working…" : confirmLabel}</button>
      </div>
    </Modal>
  );
}
