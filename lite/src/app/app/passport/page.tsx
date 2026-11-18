"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { RoomSelect } from "@/components/ws";
import { Field, Notice, PageHeader, useToast } from "@/components/ui";
import { computeHealth, configFor, scoreBand } from "@/lib/acoustics/health";
import { detectIssues, planMitigation } from "@/lib/acoustics/mitigation";
import { ENVIRONMENTS } from "@/lib/acoustics/questionnaire";
import { buildPassport, decodePassport, encodePassport, FIELD_LABEL, needsPasscode, PASSPORT_FIELDS, passportUrl, QR_LIMIT, type PassportData, type PassportField } from "@/lib/workspace/passport";
import { healthInputFor } from "@/lib/workspace/derive";
import { useWorkspace } from "@/lib/workspace/useWorkspace";
import { useAssessments } from "@/lib/workspace/useAssessments";
import { SEVERITY_LABEL } from "@/lib/acoustics/screening";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
function Viewer({ token }: { token: string }) {
  const [pass, setPass] = useState(""); const [d, setD] = useState<PassportData | null>(null); const [err, setErr] = useState("");
  const open = async (p?: string) => { try { setD(await decodePassport(token, p)); setErr(""); } catch (e: any) { setD(null); setErr(e.message); } };
  useEffect(() => { if (!needsPasscode(token)) open(); else setErr(""); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <PageHeader title="Room passport" sub="A read-only summary shared from SoundSense Lite. It is held inside the link itself and was not fetched from a server." />
      <div className="max-w-xl space-y-4">
        {!d && needsPasscode(token) && <form className="card space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); open(pass); }}><Field label="Passcode" htmlFor="pc"><input id="pc" type="password" className="input" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} /></Field><button className="btn-primary">Open</button></form>}
        {err && <p className="err" role="alert">{err}</p>}
        {d && <section className="card p-5"><h2 className="font-display text-xl font-semibold">{d.n}</h2><p className="text-xs text-muted">Created {new Date(d.at).toLocaleString()}. Figures may be out of date.</p>
          <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[190px_1fr]">{PASSPORT_FIELDS.filter((k) => d.f[k]).map((k) => <><dt key={k + "t"} className="text-muted">{FIELD_LABEL[k]}</dt><dd key={k}>{d.f[k]}</dd></>)}</dl>
          <p className="mt-4 text-xs text-muted">Screening information, not a certified measurement. Noise figures come from phone or laptop microphones unless marked calibrated.</p></section>}
        <Link className="text-sm font-semibold text-brand" href="/app/passport">Make your own passport</Link>
      </div>
    </>
  );
}

function Maker() {
  const [w] = useWorkspace(); const as = useAssessments(); const toast = useToast();
  const [roomId, setRoomId] = useState(w.rooms[0]?.id ?? ""); const [fields, setFields] = useState<PassportField[]>(["location", "type", "score", "alerts", "readiness", "assessed"]);
  const [pass, setPass] = useState(""); const [out, setOut] = useState<{ url: string; qr: string; len: number } | null>(null); const [err, setErr] = useState("");
  const room = w.rooms.find((r) => r.id === roomId);
  async function make() {
    if (!room) return; setErr("");
    const a = as?.find((x) => x.id === room.assessmentId) ?? null; const input = healthInputFor(w, room, a); const h = computeHealth(input, configFor(room.roomType, w.settings.weights));
    const plan = planMitigation(detectIssues(input, h), w.mitigationDone[room.id] ?? {}); const open = w.alerts.filter((x) => x.roomId === room.id && x.status !== "resolved");
    const rank = ["green", "yellow", "orange", "red"]; const top = [...open].sort((x, y) => rank.indexOf(y.severity) - rank.indexOf(x.severity))[0];
    const rd = w.readiness[room.id]; const sched = w.schedules.find((s) => s.roomId === room.id);
    const data = buildPassport({ name: room.name, building: room.building, floor: room.floor, roomType: ENVIRONMENTS.find((o) => o.value === room.roomType)?.label ?? room.roomType, score: h.overall, scoreBand: scoreBand(h.overall), scoreBasis: h.gradeText.split(".")[0] + ".", noise: input.ambient ? { value: input.ambient.splDb, calibrated: input.ambient.calibrated } : null, openAlerts: open.length, topSeverity: top ? SEVERITY_LABEL[top.severity] : null, actionsDone: plan.filter((p) => p.done).length, actionsTotal: plan.length, readiness: rd ? (rd.verdict === "ready" ? "Ready" : rd.verdict === "warnings" ? "Ready with warnings" : "Needs attention") + ` (${rd.at.slice(0, 10)})` : null, assessedAt: a?.submitted_at ?? a?.updated_at ?? null, nextDue: sched?.nextDue ?? null, notes: room.notes }, fields);
    const token = await encodePassport(data, pass || undefined); const url = passportUrl(location.origin, BASE, token);
    if (url.length > QR_LIMIT + 200) { setErr("That is too much information for a scannable QR code. Untick a few fields."); setOut(null); return; }
    setOut({ url, len: url.length, qr: await QRCode.toDataURL(url, { margin: 2, width: 320, errorCorrectionLevel: "M" }) });
  }
  return (
    <>
      <PageHeader title="Room passport" sub="Share a room's acoustic summary as a QR code or link, for a sign on the door or a handover." />
      <div className="max-w-2xl space-y-4">
        <Notice tone="warn" title="Read this before sharing">There are no accounts or servers in this edition, so access cannot be controlled or taken back. The information is stored inside the link. Anyone who has the link can read it, or with a passcode, anyone with the link and the passcode. Choose the fields below carefully.</Notice>
        {!w.rooms.length ? <p className="text-sm">Add a room first on the <Link className="font-semibold text-brand" href="/app/rooms">Rooms</Link> page.</p> : (
          <>
            <Field label="Room" htmlFor="room"><RoomSelect w={w} value={roomId} onChange={(v) => { setRoomId(v); setOut(null); }} allowNone={false} /></Field>
            <fieldset className="card p-4"><legend className="label px-1">Include in the passport</legend><div className="grid gap-1 sm:grid-cols-2">{PASSPORT_FIELDS.map((k) => <label key={k} className="flex min-h-[40px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[rgb(var(--brand))]" checked={fields.includes(k)} onChange={(e) => { setFields((f) => (e.target.checked ? [...f, k] : f.filter((x) => x !== k))); setOut(null); }} />{FIELD_LABEL[k]}</label>)}</div></fieldset>
            <Field label="Passcode (optional)" htmlFor="pc" hint="Encrypts the passport in your browser (AES-256). Share the passcode separately. If you lose it, make a new passport."><input id="pc" type="password" autoComplete="new-password" className="input max-w-xs" value={pass} onChange={(e) => { setPass(e.target.value); setOut(null); }} /></Field>
            <button className="btn-primary" onClick={make} disabled={!room || !fields.length}>Create QR code</button>
            {err && <p className="err" role="alert">{err}</p>}
            {out && <section className="card flex flex-wrap items-center gap-5 p-5 print:border-0"><img src={out.qr} alt={`QR code for the ${room?.name} passport link`} width={240} height={240} />
              <div className="min-w-[200px] flex-1 space-y-2 text-sm"><p className="font-semibold">{room?.name}</p><p className="break-all text-xs text-muted">{out.url.length > 160 ? out.url.slice(0, 120) + "…" : out.url} ({out.len} characters)</p>
                <div className="flex flex-wrap gap-2 print:hidden"><button className="btn-secondary btn-sm" onClick={() => navigator.clipboard?.writeText(out.url).then(() => toast("Link copied."), () => toast("Could not copy.", "bad"))}>Copy link</button><button className="btn-secondary btn-sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</button></div>
                <p className="text-xs text-muted">The passport is a snapshot made now. Make a new one after anything changes.</p></div></section>}
          </>)}
      </div>
    </>
  );
}
export default function Page() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => { const read = () => { const m = location.hash.match(/^#d=(.+)$/); setToken(m ? m[1] : null); }; read(); window.addEventListener("hashchange", read); return () => window.removeEventListener("hashchange", read); }, []);
  if (token === undefined) return null;
  return token ? <Viewer token={token} /> : <Maker />;
}
