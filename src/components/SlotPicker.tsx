"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ErrorBox, Spinner } from "./ui";
import { useApi } from "@/lib/client";

export interface Slot { start: string; end: string; day: string; label: string; available: boolean; reason?: "booked" | "blocked" | "past" }
const REASON: Record<string, string> = { booked: "Booked", blocked: "Closed", past: "Too soon" };
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const add = (d: string, n: number) => new Date(+new Date(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Shows every slot; unavailable ones are visible but disabled and say why – they can never be selected. */
export function SlotPicker({ value, onChange }: { value: string | null; onChange: (start: string, label: string) => void }) {
  const [offset, setOffset] = useState(0);
  const first = useApi<any>("/api/availability");
  const from = useMemo(() => (first.data ? add(first.data.from, offset * 7) : null), [first.data, offset]);
  const { data, error, isLoading } = useApi<any>(from ? `/api/availability?from=${from}&to=${add(from, 6)}` : null);
  const [day, setDay] = useState<string | null>(null);
  if (error || first.error) return <ErrorBox error={(error ?? first.error)!} />;
  if (!data || isLoading) return <Spinner />;
  const slots: Slot[] = data.slots;
  const days = Array.from({ length: 7 }, (_, i) => add(data.from, i));
  const sel = day && days.includes(day) ? day : days.find((d) => slots.some((s) => s.day === d && s.available)) ?? days[0];
  const free = (d: string) => slots.filter((s) => s.day === d && s.available).length;
  const maxOffset = Math.floor((data.horizonDays - 1) / 7);
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button type="button" className="btn-secondary btn-sm" disabled={offset === 0} onClick={() => setOffset(offset - 1)} aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></button>
        <div className="grid flex-1 grid-cols-7 gap-1" role="tablist" aria-label="Choose a day">
          {days.map((d) => (
            <button type="button" key={d} role="tab" aria-selected={sel === d} onClick={() => setDay(d)} disabled={!slots.some((s) => s.day === d)}
              className={`flex min-h-[56px] flex-col items-center justify-center rounded-lg border px-1 text-[11px] font-semibold sm:text-xs ${sel === d ? "border-brand bg-brand-soft" : "border-line"} ${free(d) === 0 ? "opacity-50" : ""}`}>
              <span>{dayLabel(d).split(" ")[0]}</span><span className="text-sm">{dayLabel(d).split(" ")[1]}</span><span className="text-[10px] font-normal text-muted">{free(d) ? `${free(d)} free` : "none"}</span>
            </button>))}
        </div>
        <button type="button" className="btn-secondary btn-sm" disabled={offset >= maxOffset} onClick={() => setOffset(offset + 1)} aria-label="Next week"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <p className="mb-2 text-sm font-semibold">{dayLabel(sel)} <span className="font-normal text-muted">· times in {data.timezone}</span></p>
      {slots.filter((s) => s.day === sel).length === 0 ? <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">No consultations are offered on this day.</p> : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="listbox" aria-label="Available times">
          {slots.filter((s) => s.day === sel).map((s) => (
            <button type="button" key={s.start} role="option" aria-selected={value === s.start} disabled={!s.available} onClick={() => onChange(s.start, `${dayLabel(s.day)}, ${s.label}`)}
              className={`min-h-[48px] rounded-lg border px-2 text-sm font-semibold ${value === s.start ? "border-brand bg-brand text-brand-ink" : s.available ? "border-line hover:bg-raised" : "cursor-not-allowed border-line bg-raised/60 text-muted line-through"}`}>
              {s.label}{!s.available && <span className="block text-[10px] font-normal no-underline">{REASON[s.reason ?? "booked"]}</span>}
            </button>))}
        </div>
      )}
    </div>
  );
}
