import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { client, signIn } from "./helpers";
import { seed } from "@/lib/seed";
import { sys } from "@/lib/db";
import { requireEmailVerification } from "@/lib/env";
import * as register from "@/app/api/auth/register/route";
import * as login from "@/app/api/auth/login/route";
import * as pw from "@/app/api/auth/password/route";
import * as me from "@/app/api/me/route";
import * as admUser from "@/app/api/admin/users/[id]/route";

const PASS = "Sound-Test-123";
const saved = process.env.REQUIRE_EMAIL_VERIFICATION;
beforeAll(async () => {
  await seed({ adminEmail: "admin@test.local", adminPassword: "Admin-Pass-12345", demo: false });
});
afterAll(() => {
  if (saved === undefined) delete process.env.REQUIRE_EMAIL_VERIFICATION;
  else process.env.REQUIRE_EMAIL_VERIFICATION = saved;
});

describe("accounts without a mail server (e.g. a first Netlify deploy)", () => {
  it("verification defaults to off when SMTP is not configured, on when it is, and the env var overrides", () => {
    delete process.env.REQUIRE_EMAIL_VERIFICATION;
    expect(requireEmailVerification()).toBe(false);
    process.env.SMTP_HOST = "smtp.example.com";
    expect(requireEmailVerification()).toBe(true);
    process.env.REQUIRE_EMAIL_VERIFICATION = "false";
    expect(requireEmailVerification()).toBe(false);
    delete process.env.SMTP_HOST;
  });

  it("register signs the customer straight in; the same address cannot register twice", async () => {
    delete process.env.REQUIRE_EMAIL_VERIFICATION;
    const c = client();
    const r = await c.call(register.POST, { body: { name: "Meera Iyer", email: "meera@test.local", password: PASS, consent: true } });
    expect(r.status).toBe(200);
    expect(r.json.signedIn).toBe(true);
    expect(r.json.needsVerification).toBe(false);
    expect(c.cookie).toMatch(/ss_session=/);
    expect((await c.call(me.GET)).json.user.email).toBe("meera@test.local");

    const again = await client().call(register.POST, { body: { name: "X", email: "MEERA@test.local", password: PASS, consent: true } });
    expect(again.status).toBe(409);
    expect(again.res.headers.get("set-cookie")).toBeNull();

    const l = await client().call(login.POST, { body: { email: "meera@test.local", password: PASS } });
    expect(l.status).toBe(200);
  });

  it("forgot-password says plainly that e-mail is off instead of promising a link", async () => {
    const r = await client().call(pw.POST, { body: { email: "meera@test.local" } });
    expect(r.status).toBe(200);
    expect(r.json.emailOff).toBe(true);
    expect(r.json.message).toMatch(/administrator/i);
  });

  it("an admin can issue a one-time reset link, and it really resets the password and signs the old session out", async () => {
    const victim = client();
    await victim.call(register.POST, { body: { name: "Ravi K", email: "ravi@test.local", password: PASS, consent: true } });
    const id = (await sys<{ id: string }>("select id from users where email = 'ravi@test.local'")).rows[0].id;

    // non-admins cannot
    expect((await victim.call(admUser.PUT, { method: "PUT", params: { id }, body: {} })).status).toBe(403);

    const admin = await signIn("admin@test.local", "Admin-Pass-12345");
    const r = await admin.call(admUser.PUT, { method: "PUT", params: { id }, body: {} });
    expect(r.status).toBe(200);
    expect(r.json.emailed).toBe(false);
    const token = /token=([A-Za-z0-9_-]+)/.exec(r.json.link)![1];

    const done = await client().call(pw.PUT, { method: "PUT", body: { token, password: "Brand-New-Pass-77" } });
    expect(done.status).toBe(200);
    expect((await victim.call(me.GET)).status).toBe(401); // old session revoked
    expect((await client().call(login.POST, { body: { email: "ravi@test.local", password: PASS } })).status).toBe(401);
    expect((await client().call(login.POST, { body: { email: "ravi@test.local", password: "Brand-New-Pass-77" } })).status).toBe(200);
    // the link is single-use
    expect((await client().call(pw.PUT, { method: "PUT", body: { token, password: "Another-Pass-1234" } })).status).toBe(400);
  });

  it("a customer can delete their own account (password required) and all their data goes", async () => {
    const c = client();
    await c.call(register.POST, { body: { name: "Del Me", email: "del@test.local", password: PASS, consent: true } });
    const id = (await sys<{ id: string }>("select id from users where email = 'del@test.local'")).rows[0].id;
    await sys("insert into assessments(ref, customer_id, title) values ('SS-TEST-DEL', $1, 'to be erased')", [id]);
    expect((await sys("select 1 from assessments where customer_id = $1", [id])).rowCount).toBe(1);

    const wrong = await c.call(me.DELETE, { method: "DELETE", body: { password: "wrong-password-1" } });
    expect(wrong.status).toBe(400);
    expect((await c.call(me.GET)).status).toBe(200);

    const ok = await c.call(me.DELETE, { method: "DELETE", body: { password: PASS } });
    expect(ok.status).toBe(200);
    expect((await c.call(me.GET)).status).toBe(401);
    expect((await sys("select 1 from users where id = $1", [id])).rowCount).toBe(0);
    expect((await sys("select 1 from assessments where customer_id = $1", [id])).rowCount).toBe(0);
    expect((await client().call(login.POST, { body: { email: "del@test.local", password: PASS } })).status).toBe(401);
  });

  it("consultants and admins cannot use the self-service delete", async () => {
    const admin = await signIn("admin@test.local", "Admin-Pass-12345");
    expect((await admin.call(me.DELETE, { method: "DELETE", body: { password: "Admin-Pass-12345" } })).status).toBe(403);
  });
});
