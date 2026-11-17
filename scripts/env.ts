// Loads .env.local then .env into process.env (existing variables win), like Next.js does for the app.
// Import this FIRST in every script so configuration is in place before the database module reads it.
import fs from "node:fs";
for (const f of [".env.local", ".env"]) if (fs.existsSync(f)) process.loadEnvFile(f);
