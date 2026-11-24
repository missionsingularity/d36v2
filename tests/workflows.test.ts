import { describe, expect, it } from "vitest";
import { assessKnowledgeChange, buildCaseInvestigation, calculateBacklog, compareGrievanceDisposals, summarizeAudit } from "@/lib/agent/workflows";

describe("government workflow calculations", () => {
  it("builds a case investigation from case, exact source passages and linked grievance data", () => {
    const result = buildCaseInvestigation({ id: "PEN-NGN-2026-041", issue: "service_discrepancy", stage: "head_of_office", unresolved: true }, [{ document_id: "DOC-001", version: 1, section: "Original logical page 3", passage: "Appointment recorded." }], [{ id: "GRV-AS-2026-01192", case_id: "PEN-NGN-2026-041", status: "open", disposed: false, atr_date: null, outcome_verified: false }]);
    expect(result.evidence_state).toBe("sources_available");
    expect(result.sources[0]).toMatchObject({ document_id: "DOC-001", version: 1, section: "Original logical page 3" });
    expect(result.linked_grievances[0]?.disposed).toBe(false);
  });

  it("compares grievance disposal without treating an unverified ATR as proof", () => {
    const result = compareGrievanceDisposals([
      { id: "GRV-1", case_id: "PEN-1", status: "disposed", disposed: true, atr_date: "2026-01-12", outcome_verified: false },
      { id: "GRV-2", case_id: "PEN-1", status: "open", disposed: false, atr_date: null, outcome_verified: false },
    ]);
    expect(result.same_case).toBe(true);
    expect(result.disposal_claim_supported).toBe(false);
  });

  it("calculates district backlog from authorized rows", () => {
    const result = calculateBacklog([
      { id: "1", district: "Nagaon", stage: "head_of_office", unresolved: true, late_objection: true, visible_before_retirement: false },
      { id: "2", district: "Nagaon", stage: "deeo", unresolved: true, late_objection: false, visible_before_retirement: true },
      { id: "3", district: "Jorhat", stage: "deeo", unresolved: false, late_objection: false, visible_before_retirement: false },
    ], "Nagaon");
    expect(result).toMatchObject({ total: 2, unresolved: 2, head_of_office: 1, late_objections: 1, visible_before_retirement: 1 });
  });

  it("summarizes security audit events without inferring unconfirmed disclosure", () => {
    const result = summarizeAudit([
      { id: "1", decision: "allowed", external_disclosure_confirmed: false, action: "read" },
      { id: "2", decision: "blocked", external_disclosure_confirmed: false, action: "export" },
      { id: "3", decision: "allowed", external_disclosure_confirmed: true, action: "share" },
    ]);
    expect(result).toMatchObject({ total: 3, denied_or_blocked: 1, external_disclosures_confirmed: 1 });
  });

  it("requires every verification gate before a knowledge change is publication-ready", () => {
    const result = assessKnowledgeChange({ authority_verified: true, signature_verified: true, effective_date_verified: false, rule_compatibility_verified: true, publication_approved: false, payload: { potential_case_ids: ["PEN-1"], manual_review_case_ids: ["PEN-2"] } });
    expect(result.ready_for_publication).toBe(false);
    expect(result.status).toBe("requires_manual_verification");
    expect(result.manual_review_case_ids).toEqual(["PEN-2"]);
  });
});
