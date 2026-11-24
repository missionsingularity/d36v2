import people from "../../../Singularity_D36V2_Implementation/Singularity_D36V2_Implementation/fixtures/people.json";
import offices from "../../../Singularity_D36V2_Implementation/Singularity_D36V2_Implementation/fixtures/offices.json";
import pensions from "../../../Singularity_D36V2_Implementation/Singularity_D36V2_Implementation/fixtures/pensions.json";
import grievances from "../../../Singularity_D36V2_Implementation/Singularity_D36V2_Implementation/fixtures/grievances.json";
import auditEvents from "../../../Singularity_D36V2_Implementation/Singularity_D36V2_Implementation/fixtures/audit_events.json";
import knowledgeChanges from "../../../Singularity_D36V2_Implementation/Singularity_D36V2_Implementation/fixtures/knowledge_changes.json";
import sourceManifest from "../../../Singularity_D36V2_Implementation/Singularity_D36V2_Implementation/fixtures/source_manifest.json";

export type DemoPerson = { id: string; name: string; designation: string; office_id: string; role: string; manager_id: string | null };
export type DemoPension = { id: string; case_id?: string; pensioner_name: string; office_id: string; district: string; department: string; unresolved: boolean; stage: string; issue: string | null; late_objection: boolean | null; visible_before_retirement: boolean | null; potential_clarification_match?: boolean; manual_review?: boolean; owner_id: string; as_of: string; designation?: string; appointment_date?: string; retirement_date?: string; claimed_service_months?: number; verified_record_service_months?: number; leave_start?: string; leave_end?: string; leave_type?: string; leave_sanction_order_available?: boolean; efile?: string; ppo_status?: string; payment_status?: string };
export type DemoGrievance = { id: string; case_id: string | null; received: string; status: string; disposed: boolean; atr_date: string | null; outcome_verified: boolean; owner_id: string };
export type DemoAudit = { id: string; proposal_id: string | null; timestamp: string; actor_id: string; action: string; decision: string; external_disclosure_confirmed: boolean; classification: string };
export type DemoKnowledgeChange = { id: string; source_id: string; requester_id: string; reviewer_id: string; state: string; authority_verified: boolean; signature_verified: boolean; effective_date_verified: boolean; rule_compatibility_verified: boolean; publication_approved: boolean; potential_case_ids: string[]; manual_review_case_ids: string[] };
export type DemoSource = { id: string; title: string; version: number; path: string; anchor: string; logical_location: string; passage: string; sha256: string; classification: string; proposal_id: string | null };

export const demoPeople = people as DemoPerson[];
export const demoOffices = offices as Array<{ id: string; name: string; location: string; parent_id: string | null }>;
export const demoPensions = pensions as DemoPension[];
export const demoGrievances = (grievances as Array<Record<string, unknown>>).map((record) => ({ id: String(record.id), case_id: record.proposal_id ? String(record.proposal_id) : null, received: String(record.received ?? ""), status: String(record.status ?? "unknown"), disposed: Boolean(record.disposed), atr_date: record.atr_date ? String(record.atr_date) : null, outcome_verified: Boolean(record.outcome_verified), owner_id: String(record.owner_id ?? "") })) satisfies DemoGrievance[];
export const demoAuditEvents = auditEvents as DemoAudit[];
export const demoKnowledgeChanges = knowledgeChanges as DemoKnowledgeChange[];
export const demoSources = sourceManifest as DemoSource[];
export const demoOfficer = people[0]!;
export const primaryCase = pensions.find((record) => record.id === "PEN-NGN-2026-041")!;

export type DemoConversationMessage = {
  role: "user" | "assistant";
  content: string;
  citations?: Array<{ document_id: string; title: string; version: number; section: string; passage: string }>;
  related?: string[];
  timestamp: string;
};
export type DemoConversation = { id: string; title: string; updatedAt: string; messages: DemoConversationMessage[] };
export type DemoTask = { id: string; title: string; description: string; assignee: string; caseId: string; dueDate: string; status: string; createdAt: string };
export type DemoDraft = { id: string; title: string; content: string; version: number; caseId: string; updatedAt: string; comments: string[]; status?: string };

export const DEMO_STORAGE_KEYS = {
  conversations: "singularity.demo.conversations.v1",
  tasks: "singularity.demo.tasks.v1",
  drafts: "singularity.demo.drafts.v1",
  meetings: "singularity.demo.meetings.v1",
  persona: "singularity.demo.persona.v1",
  sync: "singularity.demo.sync.v1",
  settings: "singularity.demo.settings.v1",
} as const;
