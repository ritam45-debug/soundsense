import fs from "node:fs";
import path from "node:path";
import type { Db } from "./index";

/** Applies db/migrations/*.sql in filename order; each file runs once, inside a transaction. */
export async function migrate(db: Db, dir = path.join(process.cwd(), "db", "migrations")): Promise<string[]> {
  await db.query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())"
  );
  const done = new Set((await db.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    await db.transaction(async (q) => {
      // PGlite's query() runs one statement; exec multi-statement files via the simple protocol when available.
      await execMulti(db, q, sql);
      await q.query("insert into schema_migrations(name) values ($1)", [f]);
    });
    applied.push(f);
  }
  return applied;
}

async function execMulti(db: Db, q: { query: (s: string, p?: any[]) => Promise<any> }, sql: string) {
  if (db.kind === "pglite") {
    // PGlite exposes exec() for multi-statement scripts; the transaction handle has it too.
    const anyQ = q as any;
    if (typeof anyQ.exec === "function") return anyQ.exec(sql);
  }
  // node-postgres: a parameter-less query() uses the simple protocol, which accepts many statements.
  await q.query(sql);
}
