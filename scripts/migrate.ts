import "./env";
import { getDb } from "../src/lib/db";
import { migrate } from "../src/lib/db/migrate";
const db = await getDb();
const applied = await migrate(db);
console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
process.exit(0);
