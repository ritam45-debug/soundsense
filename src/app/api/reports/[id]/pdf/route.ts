import { api, notFound } from "@/lib/api";
import { renderReportPdf } from "@/lib/report/pdf";
import { audit } from "@/lib/audit";

/** Streams a stored report snapshot as PDF. RLS decides whether the caller may see the parent assessment. */
export const GET = api({ auth: true }, async ({ db, params, query, user, ip }) => {
  const rep = await db(async (q) => (await q.query<any>("select r.payload, a.ref, r.version from reports r join assessments a on a.id = r.assessment_id where r.id = $1", [params.id])).rows[0]);
  if (!rep) throw notFound("Report not found.");
  const bytes = await renderReportPdf(rep.payload);
  await audit(user, "report.download", "report", params.id, {}, ip);
  const inline = query.get("inline") === "1";
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="SoundSense-${rep.ref}-v${rep.version}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
