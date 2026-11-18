import useSWR, { SWRConfiguration } from "swr";
import { ClientError } from "./local/errors";
import { localCall, LOCAL_USER } from "./local/api";

export { ClientError };

/** In SoundSense Lite there is no server: every call is answered in the browser (see lib/local/api.ts). */
export async function call<T = any>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? "POST" : "GET");
  // yield once so React can paint "busy" states, as it would with a real request
  await Promise.resolve();
  return localCall<T>(method, url, opts.body);
}

export const fetcher = (url: string) => call(url);

export function useApi<T = any>(url: string | null, cfg?: SWRConfiguration) {
  return useSWR<T, ClientError>(url, fetcher, { revalidateOnFocus: false, shouldRetryOnError: false, ...cfg });
}

export interface Me {
  id: string; email: string; name: string; phone: string | null; role: "customer" | "consultant" | "admin";
  email_verified_at: string | null; organisation: string | null; city: string | null; designation: string | null; location: string | null;
  marketing_opt_in: boolean | null; specialisation: string | null; bio: string | null;
}
/** There is no sign-in: you are always "You". */
export const useMe = () => ({ data: { user: LOCAL_USER as Me }, error: undefined, isLoading: false, mutate: async () => undefined });

export const fmtDate = (s?: string | null, withTime = false) =>
  s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" } : {}) }) : "—";

/** Link to one assessment (static hosting cannot have /assessments/<id> pages, so the id travels in the query string). */
export const assessmentHref = (id: string) => `/app/assessments/view?id=${id}`;

/** Build and download a report PDF on this device. */
export async function downloadReport(assessmentId: string, reportId: string) {
  const { loadDb } = await import("./local/store");
  const a = loadDb().assessments.find((x) => x.id === assessmentId);
  const r = a?.reports.find((x) => x.id === reportId);
  if (!a || !r) throw new ClientError(404, "That report could not be found.");
  const { renderReportPdf } = await import("./report/pdf");
  const bytes = await renderReportPdf(r.payload);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const el = document.createElement("a");
  el.href = url; el.download = `SoundSense-${a.ref}-v${r.version}.pdf`; document.body.appendChild(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
