import useSWR, { SWRConfiguration } from "swr";

export class ClientError extends Error {
  constructor(public status: number, message: string, public fields: Record<string, string> = {}, public code = "error") {
    super(message);
  }
}

export async function call<T = any>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: opts.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new ClientError(0, "You appear to be offline. Check your connection and try again.", {}, "offline");
  }
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await res.json().catch(() => null) : null;
  if (!res.ok) throw new ClientError(res.status, data?.error?.message ?? "Something went wrong. Please try again.", data?.error?.fields ?? {}, data?.error?.code);
  return data as T;
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
export const useMe = () => useApi<{ user: Me }>("/api/me", { revalidateOnFocus: true });

export const fmtDate = (s?: string | null, withTime = false) =>
  s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" } : {}) }) : "—";
