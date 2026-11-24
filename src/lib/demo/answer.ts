import { demoAuditEvents, demoGrievances, demoKnowledgeChanges, demoPensions, demoSources, primaryCase } from "./data";
import { calculateBacklog, compareGrievanceDisposals, summarizeAudit } from "@/lib/agent/workflows";

export type DemoCitation = { document_id: string; title: string; version: number; section: string; passage: string };
export type DemoAnswer = { answer: string; citations: DemoCitation[]; related: string[]; kind: "finding" | "draft" | "task" | "meeting" };

export function answerFromDemoRecords(query: string, history: Array<{ role: string; content: string }> = []): DemoAnswer {
  const text = `${history.slice(-8).map((item) => item.content).join(" ")} ${query}`.toLocaleLowerCase();
  const get = (ids: string[]) => demoSources.filter((source) => ids.includes(source.id));
  const cite = (ids: string[]) => get(ids).map((source) => ({ document_id: source.id, title: source.title, version: source.version, section: source.logical_location, passage: source.passage }));

  if (/audit|access|who accessed|security|external disclosure/.test(text)) {
    const summary = summarizeAudit(demoAuditEvents);
    const blocked = demoAuditEvents.filter((event) => /denied|blocked/i.test(event.decision));
    return { answer: `The training audit contains ${summary.total} recorded events. ${summary.denied_or_blocked} operations were denied or blocked, and ${summary.external_disclosures_confirmed} successful external disclosures are recorded. The two denied/blocked events are ${blocked.map((event) => `${event.id} (${event.action})`).join(" and ")}. This record does not establish intent or rule out activity outside the reviewed log.`, citations: cite(["DOC-015", "DOC-016"]), related: ["PEN-NGN-2026-041", ...blocked.map((event) => event.id)], kind: "finding" };
  }
  if (/previous|earlier|prior|grievance|complaint/.test(text)) {
    const disposal = compareGrievanceDisposals(demoGrievances);
    return { answer: `The earlier grievance ${demoGrievances[0]?.id} was administratively disposed on 28 September 2026. Its outcome is not verified in the supplied record. The action-taken report says the proposal was processed for early settlement, but does not establish forwarding, PPO issuance or payment. A later grievance ${demoGrievances[1]?.id} remains open. Administrative closure therefore does not establish that the pension was settled. ${disposal.same_case ? "Both records link to the same pension proposal." : "The records require case-link review."} A reopening recommendation can be prepared for review; the grievance status has not been changed.`, citations: cite(["DOC-010", "DOC-011", "DOC-012"]), related: ["GRV-AS-2026-01192", "GRV-AS-2026-01874", primaryCase.id], kind: /draft|prepare|recommend|submit/.test(query.toLowerCase()) ? "draft" : "finding" };
  }
  if (/backlog|how many|nagaon|similar cases|by reason|secretary.report/.test(text)) {
    const result = calculateBacklog(demoPensions.map((record) => ({ ...record, issue: record.issue ?? "unspecified", late_objection: Boolean(record.late_objection), visible_before_retirement: Boolean(record.visible_before_retirement) })), "Nagaon");
    const issues = demoPensions.filter((record) => record.district === "Nagaon").reduce<Record<string, number>>((counts, record) => { counts[record.issue ?? "unspecified"] = (counts[record.issue ?? "unspecified"] ?? 0) + 1; return counts; }, {});
    const group = Object.entries(issues).map(([key, count]) => `${key.replaceAll("_", " ")}: ${count}`).join("; ");
    return { answer: `The Nagaon training registry has ${result.total} pension records, ${result.unresolved} unresolved and ${result.head_of_office} at Head of Office. By issue: ${group}. These issue categories are separate from the workflow-stage count. I can prepare a Secretary-level report and case-wise annexure from these records; no report has been sent externally.`, citations: cite(["DOC-013"]), related: demoPensions.filter((record) => record.district === "Nagaon").slice(0, 15).map((record) => record.id), kind: /report|annexure|create/.test(query.toLowerCase()) ? "draft" : "finding" };
  }
  if (/clarification|knowledge|extraordinary leave|rule|affected|impact/.test(text)) {
    const change = demoKnowledgeChanges.find((item) => item.id === "KB-CHANGE-2026-0037");
    const ids = change?.potential_case_ids ?? [];
    return { answer: `The 20 November 2026 clarification is an unverified training record. Its issuing authority, signature, effective date and compatibility with controlling rules remain unconfirmed; it must not change a pension calculation or be published yet. The proposed change ${change?.id ?? "KB-CHANGE-2026-0037"} identifies ${ids.length} potential records for review. ${change?.manual_review_case_ids?.length ? `Manual review is separately flagged for ${change.manual_review_case_ids.join(", ")}.` : "No manual-review exception is listed."} A knowledge-change request is prepared for authorised review, not approved.`, citations: cite(["DOC-017", "DOC-018"]), related: ids, kind: /prepare|propose|request/.test(query.toLowerCase()) ? "draft" : "finding" };
  }
  if (/task|assign|follow.up|responsible/.test(text)) {
    return { answer: "I can prepare a follow-up task for the current case. The saved task will be a local demonstration record and will not represent a verified officer assignment or completed government action.", citations: cite(["DOC-006", "DOC-008"]), related: [primaryCase.id], kind: "task" };
  }
  if (/meeting|arrange|schedule/.test(text)) {
    return { answer: "I can prepare an internal meeting record with the Pension Section and Head of Office. No calendar invitation will be sent by this demonstration workspace.", citations: cite(["DOC-006", "DOC-008"]), related: [primaryCase.id], kind: "meeting" };
  }
  if (/draft|office note|verification request|speaking note|reopen/.test(text)) {
    const caseDetails = primaryCase;
    return { answer: `**Draft for review — ${caseDetails.id}**\n\nSubject: Verification of qualifying service and outstanding leave records for Pranab Kumar Deka.\n\nThe supplied proposal records claimed qualifying service of 32 years and 4 months and verified service of 31 years and 10 months, a six-month discrepancy. The service book and leave register record extraordinary leave from 1 July to 31 December 2004; the sanction order is not present in the available case records.\n\nThe proposal remains at Head of Office stage. Please verify the leave sanction order and provide a reconciled qualifying-service statement before the case is forwarded. This draft does not determine pension eligibility.`, citations: cite(["DOC-002", "DOC-003", "DOC-004", "DOC-006", "DOC-009"]), related: [caseDetails.id, caseDetails.case_id ?? caseDetails.id], kind: "draft" };
  }
  return { answer: `I found the supplied pension record for Pranab Kumar Deka. The proposal ${primaryCase.id} is recorded at Head of Office stage. The file shows claimed service of 32 years and 4 months (388 months) and a verified figure of 31 years and 10 months (382 months), a six-month discrepancy. Extraordinary leave from 1 July to 31 December 2004 is recorded, but its sanction order is not in the available records. PPO issuance and payment are not established. The evidence is insufficient to determine final pension eligibility.`, citations: cite(["DOC-001", "DOC-002", "DOC-003", "DOC-004", "DOC-008", "DOC-009"]), related: [primaryCase.id, primaryCase.case_id ?? primaryCase.id, "GRV-AS-2026-01874"], kind: "finding" };
}
