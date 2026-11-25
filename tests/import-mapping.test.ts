import { describe, expect, it } from "vitest";
import { mapGrievanceRecord, mapOfficeRecord, mapPensionRecord } from "../scripts/import-mapping";

describe("insert-only fixture database mappings", () => {
  it("maps offices to deployed columns and preserves the full source row", () => {
    const source = { id: "OFF-1", name: "Office", location: "Assam", parent_id: null, classification: "training", extra: "kept" };
    const row = mapOfficeRecord(source, "DEPT");
    expect(row).not.toHaveProperty("classification");
    expect(row.attributes).toMatchObject({ classification: "training", extra: "kept", source_record: source });
  });

  it("stores grievance disposal as a boolean and retains its source date", () => {
    const source = { id: "G-1", proposal_id: "P-1", disposed: "2026-09-28", unexplained_source_field: "kept" };
    const row = mapGrievanceRecord(source);
    expect(row).toMatchObject({ disposed: true, disposal_date: "2026-09-28" });
    expect(row.payload).toMatchObject({ disposed: "2026-09-28", unexplained_source_field: "kept", source_record: source });
    expect(mapGrievanceRecord({ id: "G-2", disposed: null }).disposed).toBe(false);
  });

  it("preserves unknown nullable pension flags as null", () => {
    const row = mapPensionRecord({ id: "P-1", late_objection: null, visible_before_retirement: null, unknown_field: "kept" }, "uuid");
    expect(row.late_objection).toBeNull();
    expect(row.visible_before_retirement).toBeNull();
    expect(row.payload).toEqual(expect.objectContaining({ unknown_field: "kept", late_objection: null }));
  });
});
