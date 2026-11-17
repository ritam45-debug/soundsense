import { api, notFound } from "@/lib/api";

export const GET = api({ auth: true }, async ({ db, params }) => {
  const d = await db(async (q) => (await q.query<any>("select filename, mime_type, data from case_documents where id = $1 and assessment_id = $2", [params.docId, params.id])).rows[0]);
  if (!d) throw notFound("Document not found.");
  const data = Buffer.from(d.data);
  return new Response(data, {
    headers: {
      "Content-Type": d.mime_type,
      "Content-Disposition": `attachment; filename="${String(d.filename).replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});

export const DELETE = api({ auth: true }, async ({ db, params }) => {
  await db(async (q) => {
    const r = await q.query("delete from case_documents where id = $1 and assessment_id = $2", [params.docId, params.id]);
    if (!r.rowCount) throw notFound("Document not found or you cannot remove it.");
  });
  return { ok: true };
});
