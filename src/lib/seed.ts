import { sys, j } from "@/lib/db";
import { SEED_PRODUCTS } from "@/lib/acoustics/catalogue";
import { DEFAULT_AVAILABILITY } from "@/lib/services/bookings";
import { hashPassword } from "@/lib/auth/password";

/** Idempotent seed: catalogue, availability defaults, optional admin and demo accounts. Safe to run repeatedly. */
export async function seed(opts: { adminEmail?: string; adminPassword?: string; demo?: boolean } = {}) {
  const out: string[] = [];
  for (const p of SEED_PRODUCTS) {
    // Do not overwrite prices an admin has already edited: insert only if the SKU is new.
    await sys(
      `insert into products(sku,name,solution_group,problem_category,tier,description,price_min,price_max,price_basis,advantages,limitations,suitability,maintenance,expected_improvement,complexity)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'indicative_estimate',$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14) on conflict (sku) do nothing`,
      [p.sku, p.name, p.group, p.category, p.tier, p.description, p.min, p.max, j(p.advantages), j(p.limitations), j(p.suitability), p.maintenance, p.improvement, p.complexity]
    );
  }
  out.push(`catalogue: ${SEED_PRODUCTS.length} solution types`);
  await sys("insert into system_settings(key, value) values ('availability', $1::jsonb) on conflict (key) do nothing", [j(DEFAULT_AVAILABILITY)]);

  const mk = async (email: string, password: string, name: string, role: "admin" | "consultant" | "customer") => {
    const e = email.toLowerCase();
    const ex = await sys<{ id: string }>("select id from users where lower(email) = $1", [e]);
    if (ex.rowCount) return ex.rows[0].id;
    const u = await sys<{ id: string }>(
      "insert into users(email,password_hash,name,role,email_verified_at,consent_privacy_at) values ($1,$2,$3,$4,now(),now()) returning id",
      [e, await hashPassword(password), name, role]
    );
    const id = u.rows[0].id;
    if (role === "consultant") await sys("insert into consultants(user_id, specialisation) values ($1,$2) on conflict do nothing", [id, "Room acoustics & conferencing audio"]);
    if (role === "customer") await sys("insert into customer_profiles(user_id) values ($1) on conflict do nothing", [id]);
    out.push(`created ${role}: ${e}`);
    return id;
  };
  if (opts.adminEmail && opts.adminPassword) await mk(opts.adminEmail, opts.adminPassword, "SoundSense Admin", "admin");
  if (opts.demo) {
    await mk("consultant@demo.soundsense.test", "Demo-Consultant-1", "Demo Consultant", "consultant");
    await mk("customer@demo.soundsense.test", "Demo-Customer-1", "Demo Customer", "customer");
  }
  return out;
}
