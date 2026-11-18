"use client";
import { useRef, useState } from "react";
import { Download, Trash2, Upload } from "lucide-react";
import { Confirm, Notice, PageHeader, useToast } from "@/components/ui";
import { clearDb, loadDb, makeBackup, parseBackup, saveDb } from "@/lib/local/store";
import { mutate } from "swr";
import { useApi } from "@/lib/client";
import { clearWs, commitWs, emptyWs, loadWs, parseWorkspaceBackup } from "@/lib/workspace/store";
import { useWorkspace } from "@/lib/workspace/useWorkspace";

export default function Page() {
  const toast = useToast(); const file = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState(false);
  // read through SWR (client-side only) so the server-rendered page and the first client render match
  const count: number = useApi<any>("/api/assessments?limit=100").data?.total ?? 0;
  const [ws] = useWorkspace(); const wsCount = ws.rooms.length + ws.alerts.length + ws.readings.length + ws.snapshots.length;
  const refreshAll = () => mutate(() => true, undefined, { revalidate: true });
  function exportAll() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...JSON.parse(makeBackup(loadDb())), workspace: loadWs() }, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `soundsense-backup-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000); toast("Backup downloaded.");
  }
  async function importFile(f: File | undefined) {
    if (!f) return;
    try { const text = await f.text(); const d = parseBackup(text); const wsd = parseWorkspaceBackup(JSON.parse(text)); saveDb(d); commitWs(wsd ?? emptyWs()); await refreshAll(); toast(`Restored ${d.assessments.length} assessment${d.assessments.length === 1 ? "" : "s"}${wsd ? ` and ${wsd.rooms.length} room${wsd.rooms.length === 1 ? "" : "s"}` : ""}.`); }
    catch (e: any) { toast(e.message, "bad"); } finally { if (file.current) file.current.value = ""; }
  }
  return (
    <>
      <PageHeader title="My data" sub="SoundSense Lite has no accounts. Everything you enter is stored in this browser on this device." />
      <div className="max-w-2xl space-y-4">
        <Notice tone="info" title="Where your data lives">In your browser's local storage, nothing is uploaded. Clearing the browser's site data, using a private window, or switching browser or device means it will not be there. Use the backup to move it.</Notice>
        <div className="card space-y-3 p-5">
          <h2 className="font-display text-base font-semibold">Back up and restore</h2>
          <p className="text-sm text-muted">You have {count} assessment{count === 1 ? "" : "s"} and {ws.rooms.length} room{ws.rooms.length === 1 ? "" : "s"} (with {ws.readings.length} readings and {ws.alerts.length} alerts) saved here.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={exportAll} disabled={!count && !wsCount}><Download className="h-4 w-4" /> Download backup</button>
            <button className="btn-secondary" onClick={() => file.current?.click()}><Upload className="h-4 w-4" /> Restore from backup…</button>
            <input ref={file} type="file" accept="application/json,.json" className="sr-only" aria-label="Backup file" onChange={(e) => importFile(e.target.files?.[0])} />
          </div>
          <p className="text-xs text-muted">Restoring replaces what is currently saved in this browser.</p>
        </div>
        <div className="card space-y-3 p-5">
          <h2 className="font-display text-base font-semibold">Delete everything</h2>
          <p className="text-sm text-muted">Removes all assessments, recordings, reports, rooms, readings, alerts, settings and shared-contact lists from this browser. This cannot be undone.</p>
          <button className="btn-secondary !border-bad/50 !text-bad" disabled={!count && !wsCount} onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" /> Delete all my data…</button>
        </div>
      </div>
      <Confirm open={confirm} danger title="Delete all data?" confirmLabel="Delete everything" onClose={() => setConfirm(false)} onConfirm={async () => { clearDb(); clearWs(); setConfirm(false); await refreshAll(); toast("All data deleted from this browser."); }}>
        {count} assessment{count === 1 ? "" : "s"}, {ws.rooms.length} room{ws.rooms.length === 1 ? "" : "s"} and everything attached to them will be erased from this browser.
      </Confirm>
    </>
  );
}
