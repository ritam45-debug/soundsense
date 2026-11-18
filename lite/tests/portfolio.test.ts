import { describe, expect, it } from "vitest";
import { applyFilters, distinct, NO_FILTERS, portfolio, toCsv } from "@/lib/workspace/portfolio";
import { addRoom, emptyWs } from "@/lib/workspace/store";
import { addReading, observe } from "@/lib/workspace/ops";
import { levelCandidate, screenLevel } from "@/lib/acoustics/screening";
const world = () => {
  const w = emptyWs();
  const a = addRoom(w, { name: "Alpha", building: "HQ", floor: "1", department: "Sales", roomType: "conference_room" });
  const b = addRoom(w, { name: "Beta \"Big\"", building: "Annex", floor: "2", department: "HR", roomType: "auditorium" });
  addReading(w, { roomId: a.id, source: "live", basis: "calibrated", value: 62, label: "x", at: "2026-03-10T00:00:00Z" });
  addReading(w, { roomId: b.id, source: "live", basis: "calibrated", value: 40, label: "x", at: "2026-01-10T00:00:00Z" });
  observe(w, a.id, "level", levelCandidate(screenLevel({ leqDb: -28, minDb: 0, maxDb: 0, l10Db: 0, l50Db: 0, l90Db: 0, n: 1 }, { status: "uncalibrated" }), "t"));
  return { w, a, b };
};
describe("multi-room portfolio", () => {
  it("builds a row per room with evidence-based score, alerts and noise basis", () => {
    const { w } = world(); const rows = portfolio(w, []);
    expect(rows).toHaveLength(2); const alpha = rows.find((r) => r.room.name === "Alpha")!;
    expect(alpha.openAlerts).toBe(1); expect(alpha.noise).toEqual({ value: 62, calibrated: true }); expect(alpha.health.status).toBe("insufficient"); expect(alpha.band).toBe("Insufficient data");
  });
  it("filters by building, type, severity and date", () => {
    const rows = portfolio(world().w, []);
    expect(applyFilters(rows, { ...NO_FILTERS, building: "Annex" }).map((r) => r.room.name)).toEqual(['Beta "Big"']);
    expect(applyFilters(rows, { ...NO_FILTERS, roomType: "conference_room" })).toHaveLength(1);
    expect(applyFilters(rows, { ...NO_FILTERS, severity: "yellow" }).length + applyFilters(rows, { ...NO_FILTERS, severity: "orange" }).length).toBe(1);
    expect(applyFilters(rows, { ...NO_FILTERS, from: "2026-02-01" }).map((r) => r.room.name)).toContain("Alpha");
    expect(applyFilters(rows, { ...NO_FILTERS, from: "2026-02-01" }).map((r) => r.room.name)).not.toContain('Beta "Big"');
    expect(applyFilters(rows, { ...NO_FILTERS, to: "2026-02-01" })).toHaveLength(1);
    expect(distinct(rows, "building")).toEqual(["Annex", "HQ"]);
  });
  it("exports escaped CSV and says 'Insufficient data' instead of a number", () => {
    const csv = toCsv(portfolio(world().w, [])); expect(csv.split("\n")).toHaveLength(3); expect(csv).toContain('"Beta ""Big"""'); expect(csv).toContain("Insufficient data");
  });
});
