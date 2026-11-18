import { describe, expect, it } from "vitest";
import { simplePdf } from "@/lib/workspace/simplePdf";
describe("simple pdf", () => {
  it("produces a multi-page PDF from long text and handles non-Latin punctuation", async () => {
    const lines = Array.from({ length: 120 }, (_, i) => `Line ${i} – ≈ 45 dB → better “quote”`);
    const b = await simplePdf("T", "sub", [{ heading: "H", lines }], "footer");
    expect(new TextDecoder().decode(b.slice(0, 5))).toBe("%PDF-"); expect(b.length).toBeGreaterThan(2000);
    const { PDFDocument } = await import("pdf-lib"); expect((await PDFDocument.load(b)).getPageCount()).toBeGreaterThan(1);
  });
});
