import { describe, expect, it } from "vitest";
import { answerFromDemoRecords } from "@/lib/demo/answer";

describe("fixture grounded demonstration assistant", () => {
  it("retrieves the pension discrepancy and exact source references without asserting eligibility", () => {
    const result = answerFromDemoRecords("Why has Pranab Kumar Deka not received his pension?");
    expect(result.answer).toContain("six-month discrepancy");
    expect(result.answer).toContain("insufficient to determine final pension eligibility");
    expect(result.citations.map((source) => source.document_id)).toContain("DOC-004");
  });

  it("distinguishes grievance disposal from a verified outcome", () => {
    const result = answerFromDemoRecords("Was his earlier grievance closed without resolution?");
    expect(result.answer).toContain("outcome is not verified");
    expect(result.related).toContain("GRV-AS-2026-01192");
    expect(result.related).toContain("GRV-AS-2026-01874");
  });

  it("calculates backlog totals from fixture rows and cites the registry snapshot", () => {
    const result = answerFromDemoRecords("How many similar cases are pending in Nagaon?");
    expect(result.answer).toContain("186 pension records");
    expect(result.answer).toContain("41 unresolved");
    expect(result.answer).toContain("23 at Head of Office");
    expect(result.citations.map((source) => source.document_id)).toContain("DOC-013");
  });

  it("reports denied events separately from successful disclosure", () => {
    const result = answerFromDemoRecords("Who accessed his records? Review security audit.");
    expect(result.answer).toContain("2 operations were denied or blocked");
    expect(result.answer).toContain("0 successful external disclosures");
    expect(result.citations.map((source) => source.document_id)).toContain("DOC-015");
  });

  it("keeps the knowledge clarification unverified and identifies potential records", () => {
    const result = answerFromDemoRecords("Does the new clarification affect this pension?");
    expect(result.answer).toContain("unverified training record");
    expect(result.answer).toContain("7 potential records");
    expect(result.kind).toBe("finding");
  });
});
