"use client";
import Link from "next/link";
import { Suspense, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { H2, RoomSelect } from "@/components/ws";
import { Empty, Field, Notice, PageHeader } from "@/components/ui";
import { clampPct, ITEM_KINDS, KIND_GLYPH, KIND_LABEL, reflectionPoints, suggest, type ItemKind } from "@/lib/workspace/mapPlan";
import { useWorkspace } from "@/lib/workspace/useWorkspace";
import { useAssessments } from "@/lib/workspace/useAssessments";
import { newId } from "@/lib/local/store";

function Inner() {
  const sp = useSearchParams(); const [w, update] = useWorkspace(); const as = useAssessments();
  const [roomId, setRoomId] = useState(sp.get("room") ?? w.rooms[0]?.id ?? "");
  const room = w.rooms.find((r) => r.id === roomId) ?? null;
  const a = as?.find((x) => x.id === room?.assessmentId);
  const dimW = room?.widthM ?? a?.room?.width_m ?? 6, dimL = room?.lengthM ?? a?.room?.length_m ?? 8;
  const dim = { widthM: dimW, lengthM: dimL };
  const items = room ? w.maps[room.id] ?? [] : [];
  const [tool, setTool] = useState<ItemKind | null>(null); const [sel, setSel] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null); const drag = useRef<string | null>(null);
  const sugg = useMemo(() => suggest(items, dim), [items, dimW, dimL]); // eslint-disable-line react-hooks/exhaustive-deps
  const refl = useMemo(() => reflectionPoints(items, dim), [items, dimW, dimL]); // eslint-disable-line react-hooks/exhaustive-deps
  const VW = 600, VH = Math.max(240, Math.min(760, (600 * dimL) / Math.max(1, dimW)));
  const pt = (e: React.PointerEvent) => { const r = svg.current!.getBoundingClientRect(); return { x: clampPct(((e.clientX - r.left) / r.width) * 100), y: clampPct(((e.clientY - r.top) / r.height) * 100) }; };
  const setItems = (fn: (l: any[]) => any[]) => room && update((x) => { x.maps[room.id] = fn(x.maps[room.id] ?? []); });
  const selected = items.find((i) => i.id === sel);
  return (
    <>
      <PageHeader title="Room acoustic map" sub="Place doors, windows, tables, microphones, speakers, noise sources, seats and panels to spot layout problems. These are planning suggestions from simple geometry, not a validated acoustic simulation." />
      <div className="mb-4 grid max-w-3xl gap-3 sm:grid-cols-[minmax(0,300px)_1fr] sm:items-end">
        <Field label="Room" htmlFor="room"><RoomSelect w={w} value={roomId} onChange={(v) => { setRoomId(v); setSel(null); }} allowNone={false} /></Field>
        <p className="text-sm text-muted">{room ? <>{dimW} m wide × {dimL} m long{!room.widthM && !a?.room ? " (assumed: add the size in the room's details for true distances)" : ""}.</> : ""}</p>
      </div>
      {!room ? <Empty title="Add a room first" action={<Link className="btn-primary btn-sm" href="/app/rooms">Add a room</Link>}>The map is saved per room.</Empty> : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div>
            <div className="mb-2 flex flex-wrap gap-1.5" role="toolbar" aria-label="Items to place">{ITEM_KINDS.map((k) => <button key={k} className={`btn-sm ${tool === k ? "btn-primary" : "btn-secondary"}`} aria-pressed={tool === k} onClick={() => setTool(tool === k ? null : k)}>{KIND_LABEL[k]}</button>)}</div>
            <p className="mb-2 text-xs text-muted">{tool ? `Click the plan to place a ${KIND_LABEL[tool].toLowerCase()}.` : "Choose an item, then click the plan. Drag items to move them, or select one and use the arrow keys."}</p>
            <svg ref={svg} viewBox={`0 0 ${VW} ${VH}`} className="w-full touch-none rounded-xl border border-line bg-raised" role="application" aria-label={`Plan of ${room.name}, ${items.length} items`}
              onPointerDown={(e) => { if (tool && e.target === svg.current) { const p = pt(e); const id = newId(); setItems((l) => [...l, { id, kind: tool, x: p.x, y: p.y }]); setSel(id); } else if (e.target === svg.current) setSel(null); }}
              onPointerMove={(e) => { if (drag.current) { const p = pt(e); const id = drag.current; setItems((l) => l.map((i) => (i.id === id ? { ...i, ...p } : i))); } }}
              onPointerUp={() => { drag.current = null; }}>
              <rect x="1" y="1" width={VW - 2} height={VH - 2} fill="none" stroke="rgb(var(--ink))" strokeWidth="2" />
              {refl.map((p, i) => <circle key={i} cx={(p.x / 100) * VW} cy={(p.y / 100) * VH} r="5" fill="rgb(var(--accent))" opacity="0.7"><title>Possible first-reflection point</title></circle>)}
              {sugg.filter((s) => s.at && s.id.startsWith("panel-")).map((s) => <rect key={s.id} x={(s.at!.x / 100) * VW - (s.at!.x > 90 || s.at!.x < 10 ? 5 : 30)} y={(s.at!.y / 100) * VH - (s.at!.y > 90 ? 5 : 30)} width={s.at!.x > 90 || s.at!.x < 10 ? 10 : 60} height={s.at!.y > 90 ? 10 : 60} fill="none" stroke="rgb(var(--brand))" strokeDasharray="5 4" strokeWidth="2"><title>{s.text}</title></rect>)}
              {items.map((i) => { const cx = (i.x / 100) * VW, cy = (i.y / 100) * VH, k = i.kind as ItemKind; return (
                <g key={i.id} tabIndex={0} role="button" aria-label={`${KIND_LABEL[k]}${i.label ? ` ${i.label}` : ""}, ${Math.round(i.x)} percent across, ${Math.round(i.y)} percent down${sel === i.id ? ", selected" : ""}`} style={{ cursor: "grab" }}
                  onPointerDown={(e) => { e.stopPropagation(); setSel(i.id); drag.current = i.id; (e.target as Element).setPointerCapture?.(e.pointerId); }}
                  onFocus={() => setSel(i.id)}
                  onKeyDown={(e) => { const s = e.shiftKey ? 5 : 1; const mv = (dx: number, dy: number) => { e.preventDefault(); setItems((l) => l.map((o) => (o.id === i.id ? { ...o, x: clampPct(o.x + dx), y: clampPct(o.y + dy) } : o))); }; if (e.key === "ArrowLeft") mv(-s, 0); else if (e.key === "ArrowRight") mv(s, 0); else if (e.key === "ArrowUp") mv(0, -s); else if (e.key === "ArrowDown") mv(0, s); else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); setItems((l) => l.filter((o) => o.id !== i.id)); setSel(null); } }}>
                  <circle cx={cx} cy={cy} r="15" fill={k === "noise" ? "rgb(var(--bad))" : k === "mic" ? "rgb(var(--brand))" : k === "speaker" ? "rgb(var(--accent))" : "rgb(var(--surface))"} stroke={sel === i.id ? "rgb(var(--ink))" : "rgb(var(--line))"} strokeWidth={sel === i.id ? 3 : 1.5} />
                  <text x={cx} y={cy + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill={k === "noise" || k === "mic" ? "#fff" : "rgb(var(--ink))"} pointerEvents="none">{KIND_GLYPH[k]}</text>
                  {i.label && <text x={cx} y={cy + 30} textAnchor="middle" fontSize="11" fill="rgb(var(--ink))" pointerEvents="none">{i.label}</text>}
                </g>); })}
            </svg>
            <p className="mt-1 text-xs text-muted">Orange dots: possible first-reflection points on the side walls. Dashed boxes: suggested panel positions.</p>
            {selected && <div className="mt-3 flex flex-wrap items-end gap-2"><Field label={`Label for ${KIND_LABEL[selected.kind as ItemKind].toLowerCase()}`} htmlFor="lbl"><input id="lbl" className="input" maxLength={30} value={selected.label ?? ""} onChange={(e) => setItems((l) => l.map((o) => (o.id === selected.id ? { ...o, label: e.target.value } : o)))} /></Field><button className="btn-secondary !text-bad" onClick={() => { setItems((l) => l.filter((o) => o.id !== selected.id)); setSel(null); }}><Trash2 className="h-4 w-4" /> Remove</button></div>}
          </div>
          <div className="space-y-3"><H2>Suggestions</H2>
            {!sugg.length ? <Notice tone="good">Nothing to flag with this layout. That only means the simple rules found nothing. It is not a guarantee of good sound.</Notice> : <ul className="space-y-2">{sugg.map((s) => <li key={s.id} className={`rounded-lg border p-3 text-sm ${s.severity === "warn" ? "border-warn/50 bg-warn/10" : "border-line"}`}><strong>{s.severity === "warn" ? "Check: " : "Idea: "}</strong>{s.text}</li>)}</ul>}
            <p className="text-xs text-muted">Rules used: microphone to speaker at least 1.5 m, microphone to noise source at least 2 m, seats within 3 m of a microphone, panels at side-wall reflection points. These are common rules of thumb (judgement), not measured results.</p>
          </div>
        </div>)}
    </>
  );
}
export default function Page() { return <Suspense><Inner /></Suspense>; }
