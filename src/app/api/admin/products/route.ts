import { z } from "zod";
import { api, bad } from "@/lib/api";
import { audit } from "@/lib/audit";
import { j } from "@/lib/db";
import { CATEGORY_IDS } from "@/lib/acoustics/types";

export const GET = api({ auth: ["admin", "consultant"] }, async ({ db }) => {
  const r = await db((q) => q.query("select * from products order by problem_category, case tier when 'budget' then 1 when 'recommended' then 2 else 3 end, name"));
  return { products: r.rows };
});

const product = z.object({
  sku: z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, dots, dashes."),
  name: z.string().trim().min(2).max(200),
  solution_group: z.enum(["equipment", "room", "software"]),
  problem_category: z.enum(CATEGORY_IDS as [string, ...string[]]),
  tier: z.enum(["budget", "recommended", "premium"]),
  description: z.string().trim().min(5).max(1000),
  price_min: z.number().int().min(0).max(1_000_000_000),
  price_max: z.number().int().min(0).max(1_000_000_000),
  price_basis: z.enum(["indicative_estimate", "vendor_quote", "catalogue_price"]).default("indicative_estimate"),
  advantages: z.array(z.string().max(300)).max(8).default([]),
  limitations: z.array(z.string().max(300)).max(8).default([]),
  suitability: z.object({ minOccupants: z.number().int().min(0).optional(), maxOccupants: z.number().int().min(0).optional(), environments: z.array(z.string()).optional() }).default({}),
  maintenance: z.string().max(300).optional(),
  expected_improvement: z.string().max(300).optional(),
  complexity: z.enum(["low", "medium", "high"]).default("medium"),
  active: z.boolean().default(true),
});

const upsert = async (db: any, p: z.infer<typeof product>) => {
  if (p.price_max < p.price_min) throw bad("Maximum price must not be below the minimum.", { price_max: "Must be at least the minimum." });
  return db((q: any) =>
    q.query(
      `insert into products(sku,name,solution_group,problem_category,tier,description,price_min,price_max,price_basis,advantages,limitations,suitability,maintenance,expected_improvement,complexity,active)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16)
       on conflict (sku) do update set name=$2,solution_group=$3,problem_category=$4,tier=$5,description=$6,price_min=$7,price_max=$8,price_basis=$9,advantages=$10::jsonb,limitations=$11::jsonb,suitability=$12::jsonb,maintenance=$13,expected_improvement=$14,complexity=$15,active=$16,updated_at=now()
       returning *`,
      [p.sku, p.name, p.solution_group, p.problem_category, p.tier, p.description, p.price_min, p.price_max, p.price_basis, j(p.advantages), j(p.limitations), j(p.suitability), p.maintenance ?? null, p.expected_improvement ?? null, p.complexity, p.active]
    )
  );
};

export const POST = api({ auth: ["admin"], schema: product }, async ({ db, body, user, ip }) => {
  const r = await upsert(db, body);
  await audit(user, "product.upsert", "product", body.sku, { priceMin: body.price_min, priceMax: body.price_max, basis: body.price_basis }, ip);
  return { product: r.rows[0] };
});

export const DELETE = api({ auth: ["admin"], schema: z.object({ sku: z.string().min(2).max(60) }) }, async ({ db, body, user, ip }) => {
  // Soft-delete so historic recommendations keep their link.
  await db((q) => q.query("update products set active = false, updated_at = now() where sku = $1", [body.sku]));
  await audit(user, "product.deactivate", "product", body.sku, {}, ip);
  return { ok: true };
});
