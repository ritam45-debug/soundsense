import "./env";
import { getDb } from "../src/lib/db";
import { migrate } from "../src/lib/db/migrate";
import { seed } from "../src/lib/seed";
await migrate(await getDb());
const lines = await seed({ adminEmail: process.env.ADMIN_EMAIL, adminPassword: process.env.ADMIN_PASSWORD, demo: process.env.SEED_DEMO === "true" });
console.log(lines.join("\n"));
if (!process.env.ADMIN_EMAIL) console.log("Tip: set ADMIN_EMAIL and ADMIN_PASSWORD to create the first administrator.");
process.exit(0);
