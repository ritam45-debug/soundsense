import { beforeAll, describe, expect, it } from "vitest";
import { client } from "./helpers";
import { seed } from "@/lib/seed";
import { outbox } from "@/lib/mail";
import * as register from "@/app/api/auth/register/route";
import * as login from "@/app/api/auth/login/route";
import * as logout from "@/app/api/auth/logout/route";
import * as verify from "@/app/api/auth/verify/route";
import * as pw from "@/app/api/auth/password/route";
import * as me from "@/app/api/me/route";
import * as admUsers from "@/app/api/admin/users/route";
import * as admUser from "@/app/api/admin/users/[id]/route";
import { sys } from "@/lib/db";

const PASS = "Sound-Test-123";
beforeAll(async () => {
  await seed({ adminEmail: "admin@test.local", adminPassword: "Admin-Pass-12345", demo: true });
});

const lastLink = (to: string) => {
  const m = [...outbox].reverse().find((x) => x.to === to);
  if (!m) throw new Error("no mail for " + to);
  const t = /token=([A-Za-z0-9_-]+)/.exec(m.text)?.[1];
  if (!t) throw new Error("no token in mail: " + m.text);
  return t;
};

describe("auth", () => {
  it("rejects weak passwords and missing consent with field errors", async () => {
    const c = client();
    const r = await c.call(register.POST, { body: { name: "A", email: "a@test.local", password: "short", consent: true } });
    expect(r.status).toBe(400);
    const r2 = await c.call(register.POST, { body: { name: "A", email: "a@test.local", password: PASS, consent: false } });
    expect(r2.status).toBe(400);
    expect(r2.json.error.fields.consent).toBeTruthy();
  });

  it("register → blocked until verified → verify → login → me → logout", async () => {
    const c = client();
    const r = await c.call(register.POST, { body: { name: "Asha Rao", email: "asha@test.local", password: PASS, consent: true } });
    expect(r.status).toBe(200);
    expect(r.json.needsVerification).toBe(true);

    const early = await c.call(login.POST, { body: { email: "asha@test.local", password: PASS } });
    expect(early.status).toBe(403);

    const token = lastLink("asha@test.local");
    const v = await c.call(verify.POST, { body: { token } });
    expect(v.status).toBe(200);
    const reuse = await c.call(verify.POST, { body: { token } });
    expect(reuse.status).toBe(400); // single use

    const ok = await c.call(login.POST, { body: { email: "asha@test.local", password: PASS } });
    expect(ok.status).toBe(200);
    expect(ok.json.role).toBe("customer");
    expect(c.cookie).toMatch(/ss_session=/);

    const m = await c.call(me.GET);
    expect(m.json.user.email).toBe("asha@test.local");
    expect(JSON.stringify(m.json)).not.toMatch(/password/i);

    await c.call(logout.POST, { body: {} });
    expect((await c.call(me.GET)).status).toBe(401);
  });

  it("never stores plaintext passwords", async () => {
    const r = await sys<{ password_hash: string }>("select password_hash from users where email = 'asha@test.local'");
    expect(r.rows[0].password_hash).toMatch(/^\$2[aby]\$/);
    expect(r.rows[0].password_hash).not.toContain(PASS);
  });

  it("does not reveal whether an e-mail exists (login + forgot)", async () => {
    const c = client();
    const a = await c.call(login.POST, { body: { email: "nobody@test.local", password: PASS } });
    const b = await c.call(login.POST, { body: { email: "asha@test.local", password: "Wrong-pass-999" } });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.json.error.message).toBe(b.json.error.message);
    const f1 = await c.call(pw.POST, { body: { email: "nobody@test.local" } });
    const f2 = await c.call(pw.POST, { body: { email: "asha@test.local" } });
    expect(f1.status).toBe(200);
    expect(f2.status).toBe(200);
    expect(f1.json.message).toBe(f2.json.message);
  });

  it("password reset works once, invalidates old sessions", async () => {
    const c = client();
    await c.call(login.POST, { body: { email: "asha@test.local", password: PASS } });
    expect((await c.call(me.GET)).status).toBe(200);
    const other = client();
    await other.call(pw.POST, { body: { email: "asha@test.local" } });
    const token = lastLink("asha@test.local");
    const done = await other.call(pw.PUT, { method: "PUT", body: { token, password: "Brand-New-Pass-77" } });
    expect(done.status).toBe(200);
    expect((await other.call(pw.PUT, { method: "PUT", body: { token, password: "Another-Pass-88" } })).status).toBe(400);
    expect((await c.call(me.GET)).status).toBe(401); // old session revoked
    const again = await client().call(login.POST, { body: { email: "asha@test.local", password: "Brand-New-Pass-77" } });
    expect(again.status).toBe(200);
  });

  it("locks the account after repeated failures", async () => {
    await client("10.9.9.1").call(register.POST, { body: { name: "Lock Me", email: "lock@test.local", password: PASS, consent: true } });
    await client().call(verify.POST, { body: { token: lastLink("lock@test.local") } });
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await client(`10.9.8.${i}`).call(login.POST, { body: { email: "lock@test.local", password: "Wrong-pass-999" } })).status;
    expect([423, 429, 401]).toContain(last);
    const good = await client("10.9.7.1").call(login.POST, { body: { email: "lock@test.local", password: PASS } });
    expect(good.status).not.toBe(200); // still locked even with the right password
  });

  it("admin: create consultant, role guards, deactivate kills sessions", async () => {
    const admin = client();
    expect((await admin.call(login.POST, { body: { email: "admin@test.local", password: "Admin-Pass-12345" } })).status).toBe(200);
    const cust = client();
    await cust.call(login.POST, { body: { email: "customer@demo.soundsense.test", password: "Demo-Customer-1" } });
    expect((await cust.call(admUsers.GET)).status).toBe(403);
    expect((await client().call(admUsers.GET)).status).toBe(401);

    const created = await admin.call(admUsers.POST, { body: { name: "New Consultant", email: "nc@test.local", role: "consultant", specialisation: "Rooms" } });
    expect(created.status).toBe(200);
    const list = await admin.call(admUsers.GET, { query: { role: "consultant" } });
    expect(list.json.users.map((u: any) => u.email)).toContain("nc@test.local");

    const uid = (await sys<{ id: string }>("select id from users where email = 'customer@demo.soundsense.test'")).rows[0].id;
    await admin.call(admUser.PATCH, { method: "PATCH", params: { id: uid }, body: { isActive: false } });
    expect((await cust.call(me.GET)).status).toBe(401);
    const self = (await sys<{ id: string }>("select id from users where email = 'admin@test.local'")).rows[0].id;
    expect((await admin.call(admUser.PATCH, { method: "PATCH", params: { id: self }, body: { isActive: false } })).status).toBe(400);
  });
});
