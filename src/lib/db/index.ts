import fs from "node:fs";
import path from "node:path";

/**
 * Database access layer.
 *  - DATABASE_URL set  → node-postgres pool (Supabase / Neon / RDS / any Postgres).
 *  - otherwise         → PGlite (real Postgres compiled to WASM) so the app runs with zero setup.
 *
 * Two ways to run SQL:
 *   db.query(...)                 owner connection – auth, sessions, audit, rate limits, migrations.
 *   asUser(user, async q => ...)  transaction under the restricted `soundsense_app` role with the
 *                                 user's id/role set, so Row Level Security applies.
 */
export type Row = Record<string, any>;
export interface QueryResult<T = Row> {
  rows: T[];
  rowCount: number;
}
export interface Queryable {
  query<T = Row>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  /** Multi-statement script (PGlite only; node-postgres runs scripts through query()). */
  exec?(sql: string): Promise<unknown>;
}
export interface Db extends Queryable {
  transaction<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  kind: "pg" | "pglite";
}

export interface SessionUser {
  id: string;
  role: "customer" | "consultant" | "admin";
}

export const j = (v: unknown) => JSON.stringify(v);

const g = globalThis as unknown as { __ssDb?: Promise<Db> };

async function createPg(url: string): Promise<Db> {
  const { Pool, types } = await import("pg");
  // Return int8 (count(*) etc.) as numbers – our counts are far below 2^53.
  types.setTypeParser(20, (v: string) => parseInt(v, 10));
  const ssl = process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false };
  const pool = new Pool({ connectionString: url, ssl, max: Number(process.env.DATABASE_POOL_MAX ?? 5) });
  const wrap = (c: { query: (s: string, p?: any[]) => Promise<any> }): Queryable => ({
    async query(sql, params) {
      const res = await c.query(sql, params);
      // node-postgres returns one Result per statement for multi-statement (simple-protocol) scripts, e.g. migrations.
      const r = Array.isArray(res) ? res[res.length - 1] : res;
      return { rows: r?.rows ?? [], rowCount: r?.rowCount ?? r?.rows?.length ?? 0 };
    },
  });
  return {
    kind: "pg",
    ...wrap(pool),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const out = await fn(wrap(client));
        await client.query("commit");
        return out;
      } catch (e) {
        await client.query("rollback").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function createPglite(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dir =
    process.env.PGLITE_DIR === "memory" || process.env.NODE_ENV === "test"
      ? undefined
      : process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  if (dir) fs.mkdirSync(path.dirname(dir), { recursive: true });
  const pg = await PGlite.create(dir);
  const wrap = (c: { query: (s: string, p?: any[]) => Promise<any>; exec: (s: string) => Promise<any> }): Queryable => ({
    async query(sql, params) {
      const r = await c.query(sql, params);
      return { rows: r.rows as any[], rowCount: r.rows.length || r.affectedRows || 0 };
    },
    exec: (sql) => c.exec(sql),
  });
  return {
    kind: "pglite",
    ...wrap(pg),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    close: () => pg.close(),
  };
}

export function getDb(): Promise<Db> {
  if (!g.__ssDb) {
    g.__ssDb = (async () => {
      const url = process.env.DATABASE_URL?.trim();
      if (!url && process.env.NODE_ENV === "production" && (process.env.NETLIFY || process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME))
        throw new Error("DATABASE_URL is not set. Serverless hosting has no persistent disk, so SoundSense needs a PostgreSQL database (e.g. Supabase). Add DATABASE_URL in your host's environment variables and redeploy.");
      const db = url ? await createPg(url) : await createPglite();
      if (db.kind === "pglite" || process.env.AUTO_MIGRATE === "true") {
        const { migrate } = await import("./migrate");
        await migrate(db);
      }
      return db;
    })().catch((e) => {
      g.__ssDb = undefined;
      throw e;
    });
  }
  return g.__ssDb;
}

export async function resetDbForTests() {
  if (g.__ssDb) await (await g.__ssDb).close().catch(() => {});
  g.__ssDb = undefined;
}

/** Owner-level query helper. */
export async function sys<T = Row>(sql: string, params?: any[]): Promise<QueryResult<T>> {
  return (await getDb()).query<T>(sql, params);
}

/** Run `fn` inside a transaction with Row Level Security applied for `user`. */
export async function asUser<T>(user: SessionUser, fn: (q: Queryable) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (q) => {
    await q.query("select set_config('app.user_id', $1, true), set_config('app.role', $2, true)", [user.id, user.role]);
    await q.query("set local role soundsense_app");
    return fn(q);
  });
}

/** Owner-level transaction (for multi-step system operations). */
export async function sysTx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
  return (await getDb()).transaction(fn);
}
