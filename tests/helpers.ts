import { NextRequest } from "next/server";

type Handler = (req: NextRequest, ctx: { params: Promise<any> }) => Promise<Response>;

export interface Client {
  cookie: string;
  ip: string;
  call: (h: Handler, o?: { method?: string; body?: unknown; params?: Record<string, string>; query?: Record<string, string>; headers?: Record<string, string> }) => Promise<{ status: number; json: any; res: Response }>;
}

/** A tiny cookie-keeping client that calls route handlers directly (no HTTP server needed). */
export function client(ip = "10.0.0." + Math.floor(Math.random() * 250)): Client {
  const c: Client = {
    cookie: "",
    ip,
    async call(h, o = {}) {
      const url = new URL("http://localhost:3000/api/test");
      for (const [k, v] of Object.entries(o.query ?? {})) url.searchParams.set(k, v);
      const method = o.method ?? (o.body !== undefined ? "POST" : "GET");
      const headers: Record<string, string> = { "x-forwarded-for": c.ip, host: "localhost:3000", ...(o.headers ?? {}) };
      if (c.cookie) headers.cookie = c.cookie;
      if (o.body !== undefined) headers["content-type"] = "application/json";
      const req = new NextRequest(url, { method, headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
      const res = await h(req, { params: Promise.resolve(o.params ?? {}) });
      const set = res.headers.getSetCookie?.() ?? [];
      for (const sc of set) {
        const [pair] = sc.split(";");
        const [name, ...rest] = pair.split("=");
        const val = rest.join("=");
        const jar = new Map(c.cookie.split("; ").filter(Boolean).map((p) => [p.split("=")[0], p.slice(p.indexOf("=") + 1)] as const));
        if (!val || /max-age=0/i.test(sc)) jar.delete(name);
        else jar.set(name, val);
        c.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
      }
      const bytes = await res.arrayBuffer();
      let json: any = null;
      if ((res.headers.get("content-type") ?? "").includes("json")) {
        try { json = JSON.parse(Buffer.from(bytes).toString("utf8")); } catch {}
      }
      return { status: res.status, json, res: new Response(bytes, { status: res.status, headers: res.headers }) };
    },
  };
  return c;
}

import * as register from "@/app/api/auth/register/route";
import * as login from "@/app/api/auth/login/route";
import * as verify from "@/app/api/auth/verify/route";
import { outbox } from "@/lib/mail";

let ipn = 0;
/** Registers, verifies and signs in a customer through the real routes. */
export async function newCustomer(email: string, password = "Sound-Test-123", name = "Test Customer") {
  const c = client(`10.20.${Math.floor(ipn / 200)}.${(ipn++ % 200) + 1}`);
  const r = await c.call(register.POST, { body: { name, email, password, consent: true } });
  if (r.status !== 200) throw new Error("register failed " + JSON.stringify(r.json));
  const m = [...outbox].reverse().find((x) => x.to === email)!;
  const token = /token=([A-Za-z0-9_-]+)/.exec(m.text)![1];
  await c.call(verify.POST, { body: { token } });
  const l = await c.call(login.POST, { body: { email, password } });
  if (l.status !== 200) throw new Error("login failed " + JSON.stringify(l.json));
  return c;
}

export async function signIn(email: string, password: string) {
  const c = client(`10.30.0.${(ipn++ % 200) + 1}`);
  const l = await c.call(login.POST, { body: { email, password } });
  if (l.status !== 200) throw new Error("login failed " + JSON.stringify(l.json));
  return c;
}
