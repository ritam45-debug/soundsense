// Serves the exported site from ./out, like GitHub Pages would. BASE_PATH=/soundsense PORT=4100 node scripts/serve.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve("out");
const base = (process.env.BASE_PATH ?? "").replace(/\/$/, "");
const port = Number(process.env.PORT ?? 4100);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (base) { if (!p.startsWith(base + "/") && p !== base) { res.writeHead(404); return res.end("Not found (outside base path)"); } p = p.slice(base.length) || "/"; }
  let f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
  if (!fs.existsSync(f)) { const nf = path.join(root, "404.html"); res.writeHead(404, { "content-type": types[".html"] }); return res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : "Not found"); }
  res.writeHead(200, { "content-type": types[path.extname(f)] ?? "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log(`Serving out/ at http://localhost:${port}${base}/`));
