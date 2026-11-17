import "./env";
import fs from "node:fs";
import path from "node:path";
if (process.env.DATABASE_URL) { console.error("Refusing to reset: DATABASE_URL is set (this only resets the embedded local database)."); process.exit(1); }
fs.rmSync(path.join(process.cwd(), ".data"), { recursive: true, force: true });
console.log("Removed .data/ – run `npm run db:seed` to recreate.");
