import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { ReportPayload } from "./payload";
import { CATEGORY_LABEL, CATEGORY_SHORT, CATEGORY_IDS, TIER_LABEL, DiagnosisCategory, CategoryId, Tier } from "../acoustics/types";

/** Standard PDF fonts only cover WinAnsi – map the few symbols we use so nothing renders as a blank box. */
const safe = (s: unknown): string =>
  String(s ?? "")
    .replace(/₹\s?/g, "Rs ")
    .replace(/≈/g, "~")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/→/g, "->")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—]/g, "?");

const NAVY = rgb(0.043, 0.122, 0.227);
const TEAL = rgb(0.039, 0.498, 0.486);
const BLUE = rgb(0.231, 0.51, 0.769);
const INK = rgb(0.1, 0.13, 0.2);
const MUTED = rgb(0.38, 0.43, 0.52);
const LINE = rgb(0.85, 0.89, 0.93);
const SOFT = rgb(0.94, 0.97, 0.98);
const WARN = rgb(0.72, 0.42, 0.05);

const W = 595.28;
const H = 841.89;
const M = 46;

class Doc {
  pdf!: PDFDocument;
  regular!: PDFFont;
  bold!: PDFFont;
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];

  static async create() {
    const d = new Doc();
    d.pdf = await PDFDocument.create();
    d.regular = await d.pdf.embedFont(StandardFonts.Helvetica);
    d.bold = await d.pdf.embedFont(StandardFonts.HelveticaBold);
    d.newPage();
    return d;
  }

  newPage() {
    this.page = this.pdf.addPage([W, H]);
    this.pages.push(this.page);
    this.y = H - 70;
  }

  ensure(h: number) {
    if (this.y - h < 60) this.newPage();
  }

  wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
    const out: string[] = [];
    for (const para of safe(text).split(/\n/)) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) > maxW && line) {
          out.push(line);
          line = word;
        } else line = test;
      }
      out.push(line);
    }
    return out;
  }

  text(text: string, o: { x?: number; size?: number; bold?: boolean; color?: any; maxW?: number; gap?: number } = {}) {
    const size = o.size ?? 10;
    const font = o.bold ? this.bold : this.regular;
    const x = o.x ?? M;
    const lines = this.wrap(text, font, size, o.maxW ?? W - M - x);
    for (const l of lines) {
      this.ensure(size + 4);
      this.page.drawText(l, { x, y: this.y, size, font, color: o.color ?? INK });
      this.y -= size + 3.5;
    }
    this.y -= o.gap ?? 0;
  }

  h1(n: string, title: string) {
    this.ensure(46);
    this.y -= 8;
    this.page.drawRectangle({ x: M, y: this.y - 4, width: 4, height: 18, color: TEAL });
    this.page.drawText(safe(`${n}  ${title}`), { x: M + 12, y: this.y, size: 14, font: this.bold, color: NAVY });
    this.y -= 24;
  }

  h2(title: string) {
    this.ensure(30);
    this.page.drawText(safe(title), { x: M, y: this.y, size: 10.5, font: this.bold, color: TEAL });
    this.y -= 15;
  }

  bullets(items: string[], o: { x?: number; size?: number; color?: any } = {}) {
    const x = o.x ?? M;
    for (const it of items) {
      const lines = this.wrap(it, this.regular, o.size ?? 9.5, W - M - x - 12);
      this.ensure(lines.length * 13 + 2);
      this.page.drawCircle({ x: x + 3, y: this.y + 3, size: 1.6, color: o.color ?? TEAL });
      for (const l of lines) {
        this.page.drawText(l, { x: x + 12, y: this.y, size: o.size ?? 9.5, font: this.regular, color: INK });
        this.y -= 13;
      }
    }
    this.y -= 4;
  }

  kv(rows: [string, string][], colW = 130) {
    for (const [k, v] of rows) {
      const lines = this.wrap(v || "-", this.regular, 9.5, W - M * 2 - colW);
      this.ensure(lines.length * 13 + 4);
      this.page.drawText(safe(k), { x: M, y: this.y, size: 9, font: this.bold, color: MUTED });
      lines.forEach((l, i) => this.page.drawText(l, { x: M + colW, y: this.y - i * 13, size: 9.5, font: this.regular, color: INK }));
      this.y -= lines.length * 13 + 3;
    }
    this.y -= 4;
  }

  table(cols: { title: string; w: number }[], rows: string[][], o: { highlight?: (i: number) => boolean } = {}) {
    const size = 8.6;
    const pad = 4;
    const total = cols.reduce((s, c) => s + c.w, 0);
    const scale = (W - M * 2) / total;
    const widths = cols.map((c) => c.w * scale);
    const header = () => {
      this.ensure(30);
      this.page.drawRectangle({ x: M, y: this.y - 5, width: W - M * 2, height: 17, color: NAVY });
      let x = M;
      cols.forEach((c, i) => {
        this.page.drawText(safe(c.title), { x: x + pad, y: this.y, size: 8.2, font: this.bold, color: rgb(1, 1, 1) });
        x += widths[i];
      });
      this.y -= 20;
    };
    header();
    rows.forEach((r, ri) => {
      const cells = r.map((c, i) => this.wrap(c, this.regular, size, widths[i] - pad * 2));
      const h = Math.max(...cells.map((c) => c.length)) * 11 + 7;
      if (this.y - h < 60) {
        this.newPage();
        header();
      }
      if (o.highlight?.(ri)) this.page.drawRectangle({ x: M, y: this.y - h + 9, width: W - M * 2, height: h, color: SOFT });
      let x = M;
      cells.forEach((lines, i) => {
        lines.forEach((l, li) => this.page.drawText(l, { x: x + pad, y: this.y - li * 11, size: size, font: i === 0 ? this.bold : this.regular, color: INK }));
        x += widths[i];
      });
      this.page.drawLine({ start: { x: M, y: this.y - h + 9 }, end: { x: W - M, y: this.y - h + 9 }, thickness: 0.5, color: LINE });
      this.y -= h;
    });
    this.y -= 8;
  }

  /** Horizontal bar chart (values 0..max). */
  bars(items: { label: string; value: number; color?: any; note?: string }[], max: number) {
    const labelW = 150;
    const barMax = W - M * 2 - labelW - 60;
    for (const it of items) {
      this.ensure(20);
      this.page.drawText(safe(it.label), { x: M, y: this.y, size: 9, font: this.regular, color: INK });
      this.page.drawRectangle({ x: M + labelW, y: this.y - 2, width: barMax, height: 10, color: SOFT });
      const w = max > 0 ? Math.max(1.5, (it.value / max) * barMax) : 0;
      if (it.value > 0) this.page.drawRectangle({ x: M + labelW, y: this.y - 2, width: w, height: 10, color: it.color ?? TEAL });
      this.page.drawText(safe(it.note ?? String(it.value)), { x: M + labelW + barMax + 6, y: this.y, size: 8.5, font: this.bold, color: MUTED });
      this.y -= 18;
    }
    this.y -= 4;
  }

  /** Range chart: each row is a [min,max] bar on a shared scale. */
  ranges(items: { label: string; min: number; max: number; color?: any }[]) {
    const labelW = 180;
    const barW = W - M * 2 - labelW - 110;
    const top = Math.max(...items.map((i) => i.max), 1);
    for (const it of items) {
      this.ensure(20);
      this.page.drawText(safe(it.label.length > 38 ? it.label.slice(0, 36) + "..." : it.label), { x: M, y: this.y, size: 8.6, font: this.regular, color: INK });
      this.page.drawRectangle({ x: M + labelW, y: this.y - 2, width: barW, height: 9, color: SOFT });
      const x0 = M + labelW + (it.min / top) * barW;
      this.page.drawRectangle({ x: x0, y: this.y - 2, width: Math.max(3, ((it.max - it.min) / top) * barW), height: 9, color: it.color ?? BLUE });
      this.page.drawText(safe(`${inr(it.min)} - ${inr(it.max)}`), { x: M + labelW + barW + 6, y: this.y, size: 8, font: this.bold, color: MUTED });
      this.y -= 17;
    }
    this.y -= 4;
  }

  callout(title: string, body: string, color = TEAL) {
    const lines = this.wrap(body, this.regular, 9.5, W - M * 2 - 24);
    const h = lines.length * 13 + 30;
    this.ensure(h + 6);
    this.page.drawRectangle({ x: M, y: this.y - h + 14, width: W - M * 2, height: h, color: SOFT });
    this.page.drawRectangle({ x: M, y: this.y - h + 14, width: 3.5, height: h, color });
    this.page.drawText(safe(title), { x: M + 14, y: this.y, size: 10, font: this.bold, color });
    lines.forEach((l, i) => this.page.drawText(l, { x: M + 14, y: this.y - 15 - i * 13, size: 9.5, font: this.regular, color: INK }));
    this.y -= h + 4;
  }
}

const inr = (n: number) => (n === 0 ? "0" : `Rs ${new Intl.NumberFormat("en-IN").format(n)}`);
const range = (a: number, b: number) => (b === 0 ? "No cost" : `${inr(a)} - ${inr(b)}`);
const dateStr = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

function logo(page: PDFPage, x: number, y: number, s = 1, color = rgb(1, 1, 1)) {
  const bars = [6, 14, 24, 14, 20, 9, 16, 7];
  bars.forEach((h, i) => page.drawRectangle({ x: x + i * 5 * s, y: y - (h / 2) * s, width: 3 * s, height: h * s, color }));
}

export async function renderReportPdf(p: ReportPayload): Promise<Uint8Array> {
  const d = await Doc.create();
  const pg = d.page;

  // ── Cover header ──
  pg.drawRectangle({ x: 0, y: H - 150, width: W, height: 150, color: NAVY });
  pg.drawRectangle({ x: 0, y: H - 154, width: W, height: 4, color: TEAL });
  logo(pg, M, H - 54, 1.1);
  pg.drawText("SoundSense", { x: M + 52, y: H - 58, size: 20, font: d.bold, color: rgb(1, 1, 1) });
  pg.drawText("Making Every Sound Count.", { x: M + 52, y: H - 73, size: 9, font: d.regular, color: rgb(0.7, 0.88, 0.9) });
  pg.drawText("Acoustic Assessment Report", { x: M, y: H - 112, size: 24, font: d.bold, color: rgb(1, 1, 1) });
  pg.drawText(safe(`${p.status === "final" ? "FINAL" : "PRELIMINARY"} report  |  Assessment ${p.ref}  |  v${p.version}  |  ${dateStr(p.generatedAt)}`), { x: M, y: H - 134, size: 9.5, font: d.regular, color: rgb(0.8, 0.9, 0.95) });
  d.y = H - 185;

  const dg = p.diagnosis;
  const plan = p.plan;
  const best = p.recommendations.filter((r) => r.best);
  const bestMin = best.reduce((s, r) => s + r.priceMin, 0);
  const bestMax = best.reduce((s, r) => s + r.priceMax, 0);

  // ── Executive summary ──
  d.h1("", "Executive summary");
  d.text(p.summary.headline.charAt(0).toUpperCase() + p.summary.headline.slice(1) + ".", { size: 11, bold: true, gap: 4 });
  d.callout(
    `Diagnosis: ${dg.primaryLabel}`,
    `Confidence: ${String(dg.confidenceLevel).toUpperCase()} (${Math.round(dg.confidence * 100)}%). ${dg.solution}`
  );
  d.kv([
    ["Impact", `Problems occur ${p.impact.frequency.toLowerCase()}; time lost per meeting: ${p.impact.lostTime.toLowerCase()}; people ask for repeats: ${p.impact.repeats.toLowerCase()}.`],
    ["Best-fit investment", best.length ? `${range(bestMin, bestMax)} (indicative estimate, not a quote)` : "No purchase suggested yet - see recommended tests"],
    ["Expert inspection", dg.expertInspection.needed ? "Recommended - " + dg.expertInspection.reasons[0] : "Not required at this stage"],
    ["Evidence quality", `${dg.confirmedObservations.length} calculated/measured item(s), ${dg.reportedObservations.length} customer-reported item(s). Data completeness ${Math.round(dg.dataQuality.completeness * 100)}%.`],
  ]);

  // ── 1 Customer ──
  d.h1("1", "Customer and organisation");
  d.kv([
    ["Name", p.customer.name],
    ["Designation", p.customer.designation ?? "-"],
    ["E-mail / phone", `${p.customer.email}${p.customer.phone ? "  |  " + p.customer.phone : ""}`],
    ["Organisation", p.organisation.name],
    ["Location", p.organisation.location ?? "-"],
    ["Consultant", p.consultantName ?? "Not yet assigned"],
  ]);

  // ── 2 Environment ──
  d.h1("2", "Environment and room");
  d.kv([
    ["Space", p.environment.type],
    ["Typical occupancy", p.environment.occupants ? `${p.environment.occupants} people` : "-"],
    ["Problem occurs in", p.environment.mode],
  ]);
  if (p.room) {
    d.table(
      [{ title: "Room measure", w: 3 }, { title: "Value", w: 2 }, { title: "Note", w: 4 }],
      [
        ["Dimensions (L x W x H)", `${p.room.length} x ${p.room.width} x ${p.room.height} m`, "As declared by the customer"],
        ["Floor area / volume", `${p.room.floorArea} m2 / ${p.room.volume} m3`, "Calculated"],
        ["Estimated RT60 (empty)", `${p.room.rt60} s`, `Target about ${p.room.target} s - screening estimate (Sabine), not measured`],
        ["Estimated RT60 (occupied)", `${p.room.rt60Occupied} s`, "Includes ~0.5 m2 absorption per person"],
        ["Acoustic risk screening", p.room.risk.toUpperCase(), p.room.notes[0] ?? ""],
        ["Surfaces", `Floor: ${p.room.materials.floor}; walls: ${p.room.materials.walls}; ceiling: ${p.room.materials.ceiling}`, `Glass: ${p.room.materials.glass}; soft furnishings: ${p.room.materials.softFurnishings}; panels: ${p.room.materials.panels}`],
      ]
    );
    d.bars(
      [
        { label: "Estimated RT60 (empty room)", value: p.room.rt60, color: p.room.risk === "low" ? TEAL : p.room.risk === "moderate" ? WARN : rgb(0.75, 0.2, 0.2), note: `${p.room.rt60} s` },
        { label: "Target for this space", value: p.room.target, color: BLUE, note: `${p.room.target} s` },
      ],
      Math.max(p.room.rt60, p.room.target, 0.1)
    );
  } else d.text("No room dimensions were provided, so no room calculation is included.", { color: MUTED, gap: 6 });

  // ── 3 Problems ──
  d.h1("3", "Reported sound problems");
  d.bullets(p.problems.length ? p.problems : ["None selected"]);

  // ── 4 Measurements ──
  d.h1("4", "Measurement observations");
  d.callout("How to read these numbers", "Levels are RELATIVE to digital full scale (dBFS) on the recording device. They are not calibrated sound pressure levels unless stated, and they are not certified measurements.", WARN);
  if (p.measurements.length) {
    d.table(
      [{ title: "Recording", w: 3 }, { title: "Duration", w: 1.2 }, { title: "Leq", w: 1.1 }, { title: "L10", w: 1.1 }, { title: "L90", w: 1.1 }, { title: "Calibration", w: 3.5 }],
      p.measurements.map((m) => [m.label, `${m.durationS}s`, `${m.leq} dBFS`, `${m.l10} dBFS`, `${m.l90} dBFS`, m.calibration])
    );
    if (p.relativeSnr) d.text(`Relative signal-to-noise: ${p.relativeSnr.snrDb} dB (${p.relativeSnr.rating}). Guidance: at least 10 dB is needed and about 25 dB is best for speech intelligibility.`, { bold: true, gap: 4 });
  } else d.text("No microphone recordings were saved with this assessment.", { color: MUTED, gap: 6 });

  // ── 5 Diagnostic findings ──
  d.h1("5", "Diagnostic findings");
  d.text("Score per problem category (higher = more supporting evidence). Scores come from transparent rules listed in the appendix of the platform; weights are engineering judgement, not a standard.", { size: 9, color: MUTED, gap: 4 });
  const top = Math.max(...CATEGORY_IDS.map((c) => dg.scores[c] ?? 0), 1);
  d.bars(
    CATEGORY_IDS.map((c) => ({ label: CATEGORY_SHORT[c as DiagnosisCategory], value: dg.scores[c] ?? 0, color: dg.contributing.includes(c) ? TEAL : BLUE, note: String(dg.scores[c] ?? 0) })),
    top
  );
  d.h2("Calculated or measured observations");
  d.bullets(dg.confirmedObservations.length ? dg.confirmedObservations.map((o: any) => `${o.text} [${o.basis}]`) : ["None yet - add room dimensions and recordings to strengthen the diagnosis."]);
  d.h2("Reported by the customer");
  d.bullets(dg.reportedObservations.map((o: any) => o.text).slice(0, 12));
  if (dg.contradictingEvidence.length) {
    d.h2("Evidence pointing elsewhere");
    d.bullets(dg.contradictingEvidence.map((o: any) => o.text));
  }

  // ── 6 Root causes ──
  d.h1("6", "Root-cause hypotheses and recommended tests");
  d.text("These are hypotheses, not confirmed findings, until the tests below are done.", { size: 9, color: MUTED, gap: 4 });
  d.table(
    [{ title: "Possible root cause", w: 5 }, { title: "Status", w: 1.3 }, { title: "How to check", w: 4 }],
    dg.rootCauses.map((c: any) => [c.cause, c.status === "likely" ? "Likely" : "Possible", c.check])
  );
  d.table(
    [{ title: "Recommended test", w: 4 }, { title: "Why", w: 4 }, { title: "Who", w: 1.4 }, { title: "Effort", w: 1.2 }],
    dg.recommendedTests.map((t: any) => [t.test, t.why, t.who === "consultant" ? "Consultant" : "You", t.effort])
  );
  if (dg.expertInspection.needed) d.callout("Expert inspection advised", dg.expertInspection.reasons.join("\n"), WARN);

  // ── 7 Recommendations ──
  d.h1("7", "Recommended solutions");
  d.text("Start with the free checks, then choose the tier that fits the cause and budget. Higher tiers are not automatically better.", { size: 9, color: MUTED, gap: 4 });
  d.bullets(plan.freeFirstSteps ?? []);
  const cats = Array.from(new Set(p.recommendations.map((r) => r.category)));
  for (const c of cats) {
    d.h2(`${CATEGORY_LABEL[c as CategoryId] ?? c}`);
    const rows = p.recommendations.filter((r) => r.category === c);
    d.table(
      [{ title: "Tier / solution", w: 3.2 }, { title: "Est. price", w: 2 }, { title: "Advantages", w: 3 }, { title: "Limitations", w: 3 }, { title: "Suitability / upkeep", w: 3 }],
      rows.map((r) => [
        `${TIER_LABEL[r.tier as Tier]}${r.best ? " (best fit)" : ""}: ${r.title}`,
        range(r.priceMin, r.priceMax),
        r.advantages.join("; "),
        r.limitations.join("; "),
        `${r.suitability}. Upkeep: ${r.maintenance}. Expected: ${r.improvement}. Complexity: ${r.complexity}.`,
      ]),
      { highlight: (i) => rows[i].best }
    );
    const why = rows.find((r) => r.best)?.why ?? [];
    if (why.length) d.bullets(why, { size: 9 });
  }
  if (dg.notRecommended.length) {
    d.h2("What is not recommended, and why");
    d.bullets(dg.notRecommended);
  }

  // ── 8 Costs ──
  d.h1("8", "Estimated costs");
  if (best.length) {
    d.ranges(best.map((r) => ({ label: `${CATEGORY_SHORT[r.category as DiagnosisCategory] ?? r.category}: ${r.title}`, min: r.priceMin, max: r.priceMax })));
    d.text(`Best-fit plan total: ${range(bestMin, bestMax)}`, { bold: true });
  } else d.text("No purchases are suggested yet.");
  d.text(plan.priceDisclaimer, { size: 8.5, color: MUTED, gap: 4 });

  // ── 9 Roadmap ──
  d.h1("9", "Implementation roadmap");
  d.table(
    [{ title: "Phase", w: 2.2 }, { title: "Timeframe", w: 2 }, { title: "Actions", w: 6 }],
    (plan.roadmap ?? []).map((r: any) => [r.phase, r.timeframe, r.actions.join("\n")])
  );

  // ── 10 Remarks ──
  d.h1("10", "Consultant remarks");
  if (p.consultantRemarks) d.text(p.consultantRemarks, { gap: 4 });
  else d.text(p.status === "final" ? "No additional remarks." : "This is an automatically generated preliminary report. A consultant has not yet reviewed it.", { color: MUTED, gap: 4 });
  if (p.customerNotes.length) d.bullets(p.customerNotes);

  // ── 11 Limitations ──
  d.h1("11", "Limitations and disclaimers");
  d.bullets(p.limitations, { size: 9 });
  d.text(`Generated by SoundSense diagnostic engine v${dg.engineVersion}. ${dg.caveat}`, { size: 8.5, color: MUTED });

  // Footer on every page.
  const n = d.pages.length;
  d.pages.forEach((page, i) => {
    page.drawLine({ start: { x: M, y: 40 }, end: { x: W - M, y: 40 }, thickness: 0.5, color: LINE });
    page.drawText(safe(`SoundSense  |  ${p.ref}  |  ${p.status === "final" ? "Final" : "Preliminary"} v${p.version}  |  Indicative screening - not a certified survey`), { x: M, y: 27, size: 7.5, font: d.regular, color: MUTED });
    page.drawText(`Page ${i + 1} of ${n}`, { x: W - M - 50, y: 27, size: 7.5, font: d.regular, color: MUTED });
    if (i > 0) {
      logo(page, M, H - 40, 0.55, TEAL);
      page.drawText("SoundSense  Acoustic Assessment", { x: M + 30, y: H - 44, size: 8.5, font: d.bold, color: NAVY });
    }
  });

  d.pdf.setTitle(`SoundSense report ${p.ref}`);
  d.pdf.setAuthor("SoundSense");
  d.pdf.setSubject("Acoustic assessment report");
  return d.pdf.save();
}
