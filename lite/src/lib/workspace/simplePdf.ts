import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
export interface PdfSection { heading: string; lines: string[] }
/** Plain text PDF (A4): title, sub-title, sections of wrapped lines. Standard fonts only (Latin text). */
export async function simplePdf(title: string, sub: string, sections: PdfSection[], footer: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create(); doc.setTitle(title); doc.setCreator("SoundSense Lite");
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 50; let page = doc.addPage([W, H]); let y = H - M;
  const clean = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, (c) => ({ "–": "-", "—": "-", "’": "'", "‘": "'", "“": '"', "”": '"', "≈": "~", "±": "+/-", "×": "x", "→": "->", "−": "-", "·": "-", "…": "..." } as Record<string, string>)[c] ?? "?");
  const wrap = (t: string, f: any, size: number, width: number) => { const out: string[] = []; let cur = ""; for (const w of clean(t).split(/\s+/)) { const next = cur ? `${cur} ${w}` : w; if (f.widthOfTextAtSize(next, size) > width && cur) { out.push(cur); cur = w; } else cur = next; } if (cur) out.push(cur); return out; };
  const need = (h: number) => { if (y - h < M + 20) { page = doc.addPage([W, H]); y = H - M; } };
  const text = (t: string, f: any, size: number, color = rgb(0.1, 0.1, 0.15), indent = 0) => { for (const l of wrap(t, f, size, W - 2 * M - indent)) { need(size + 4); page.drawText(l, { x: M + indent, y: y - size, size, font: f, color }); y -= size + 4; } };
  text(title, bold, 20); text(sub, font, 10, rgb(0.4, 0.4, 0.45)); y -= 8;
  for (const s of sections) { y -= 6; need(30); text(s.heading, bold, 13, rgb(0.05, 0.35, 0.45)); y -= 2; for (const l of s.lines) text(l, font, 10.5, rgb(0.1, 0.1, 0.15), l.startsWith("- ") ? 8 : 0); }
  y -= 10; text(footer, font, 8.5, rgb(0.45, 0.45, 0.5));
  return doc.save();
}
export function downloadBytes(bytes: Uint8Array, name: string, type = "application/pdf") {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type })); const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
