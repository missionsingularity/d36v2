export type PensionCase = { id: string; district: string; stage: string; unresolved: boolean; late_objection: boolean; visible_before_retirement: boolean };
export type Grievance = { id: string; case_id: string | null; status: string; disposed: boolean; atr_date: string | null; outcome_verified: boolean };
export type AuditEvent = { id: string; decision: string; external_disclosure_confirmed: boolean; action: string };
export type KnowledgeChange = { authority_verified: boolean; signature_verified: boolean; effective_date_verified: boolean; rule_compatibility_verified: boolean; publication_approved: boolean; payload?: { potential_case_ids?: string[]; manual_review_case_ids?: string[] } };

export function calculateBacklog(records: PensionCase[], district?: string) {
  const visible = district ? records.filter((record) => record.district.toLocaleLowerCase() === district.toLocaleLowerCase()) : records;
  const stageCounts: Record<string, number> = {};
  for (const record of visible) stageCounts[record.stage || "unspecified"] = (stageCounts[record.stage || "unspecified"] ?? 0) + 1;
  return {
    total: visible.length,
    unresolved: visible.filter((record) => record.unresolved).length,
    head_of_office: visible.filter((record) => record.stage === "head_of_office").length,
    late_objections: visible.filter((record) => record.late_objection).length,
    visible_before_retirement: visible.filter((record) => record.visible_before_retirement).length,
    by_stage: stageCounts,
  };
}

export function compareGrievanceDisposals(records: Grievance[]) {
  return {
    records: records.map((record) => ({ id: record.id, case_id: record.case_id, recorded_status: record.status, disposed: record.disposed, atr_date: record.atr_date, outcome_verified: record.outcome_verified })),
    same_case: records.length > 0 && records.every((record) => record.case_id === records[0]?.case_id),
    all_outcomes_verified: records.length > 0 && records.every((record) => record.outcome_verified),
    disposal_claim_supported: records.length > 0 && records.every((record) => record.disposed && record.outcome_verified && Boolean(record.atr_date)),
  };
}

export function summarizeAudit(events: AuditEvent[]) {
  return {
    total: events.length,
    denied_or_blocked: events.filter((event) => /denied|blocked/i.test(event.decision)).length,
    external_disclosures_confirmed: events.filter((event) => event.external_disclosure_confirmed).length,
    action_counts: events.reduce<Record<string, number>>((counts, event) => { counts[event.action] = (counts[event.action] ?? 0) + 1; return counts; }, {}),
  };
}

export function assessKnowledgeChange(change: KnowledgeChange) {
  const checks = {
    authority: change.authority_verified,
    signature: change.signature_verified,
    effective_date: change.effective_date_verified,
    rule_compatibility: change.rule_compatibility_verified,
    publication_approval: change.publication_approved,
  };
  const allVerified = Object.values(checks).every(Boolean);
  return {
    checks,
    ready_for_publication: allVerified,
    status: allVerified ? "verified" : "requires_manual_verification",
    linked_case_ids: change.payload?.potential_case_ids ?? [],
    manual_review_case_ids: change.payload?.manual_review_case_ids ?? [],
  } as const;
}

export function buildCaseInvestigation(caseRecord: { id: string; issue: string; stage: string; unresolved: boolean }, passages: { document_id: string; version: number; section: string; passage: string }[], grievances: Grievance[]) {
  return {
    case: { id: caseRecord.id, recorded_issue: caseRecord.issue, recorded_stage: caseRecord.stage, unresolved: caseRecord.unresolved },
    sources: passages.map((passage) => ({ ...passage })),
    linked_grievances: grievances.map((grievance) => ({ id: grievance.id, status: grievance.status, disposed: grievance.disposed, outcome_verified: grievance.outcome_verified })),
    evidence_state: passages.length ? "sources_available" : "no_source_passage_available",
  } as const;
}
