import { z } from "zod";
import { api, bad } from "@/lib/api";
import { assertCanEdit, loadAssessment } from "@/lib/services/assessments";
import { audit } from "@/lib/audit";

const MAX_BYTES = 3 * 1024 * 1024; // keeps the JSON/base64 body under typical serverless limits
const ALLOWED: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "text/plain": ["txt"],
  "audio/mpeg": ["mp3"],
  "audio/wav": ["wav"],
};

const schema = z.object({
  filename: z.string().trim().min(1).max(150),
  mimeType: z.string().max(80),
  dataBase64: z.string().min(4).max(Math.ceil((MAX_BYTES * 4) / 3) + 100),
});

function sniff(buf: Buffer, mime: string) {
  const startsWith = (...b: number[]) => b.every((x, i) => buf[i] === x);
  if (mime === "application/pdf") return startsWith(0x25, 0x50, 0x44, 0x46);
  if (mime === "image/png") return startsWith(0x89, 0x50, 0x4e, 0x47);
  if (mime === "image/jpeg") return startsWith(0xff, 0xd8, 0xff);
  if (mime === "audio/wav") return buf.subarray(0, 4).toString() === "RIFF";
  if (mime === "audio/mpeg") return buf.subarray(0, 3).toString() === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
  if (mime === "text/plain") return !buf.includes(0);
  return false;
}

export const POST = api({ auth: true, schema }, async ({ db, params, user, body, ip }) => {
  const exts = ALLOWED[body.mimeType];
  const ext = body.filename.split(".").pop()?.toLowerCase() ?? "";
  if (!exts || !exts.includes(ext)) throw bad("Allowed files: PDF, PNG, JPG, TXT, MP3 or WAV.");
  const buf = Buffer.from(body.dataBase64, "base64");
  if (buf.length === 0 || buf.length > MAX_BYTES) throw bad(`Files must be under ${MAX_BYTES / 1024 / 1024} MB.`);
  if (!sniff(buf, body.mimeType)) throw bad("The file contents do not match its type.");
  const safeName = body.filename.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  const doc = await db(async (q) => {
    const a = await loadAssessment(q, params.id);
    assertCanEdit(user.role, a, user.id);
    const r = await q.query("insert into case_documents(assessment_id, uploader_id, filename, mime_type, size_bytes, data) values ($1,$2,$3,$4,$5,$6) returning id, filename, mime_type, size_bytes, created_at", [a.id, user.id, safeName, body.mimeType, buf.length, buf]);
    return r.rows[0];
  });
  await audit(user, "document.upload", "assessment", params.id, { filename: safeName, bytes: buf.length }, ip);
  return { document: doc };
});
