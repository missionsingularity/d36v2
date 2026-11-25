import { z } from "zod";
import {
  demoAuditEvents,
  demoGrievances,
  demoKnowledgeChanges,
  demoOffices,
  demoPeople,
  demoPensions,
  demoSources,
  primaryCase,
} from "@/lib/demo/data";
import { assessKnowledgeChange, calculateBacklog, compareGrievanceDisposals, summarizeAudit } from "./workflows";

const searchArgs = z.object({
  query: z.string().trim().min(1).max(300),
  scope: z.enum(["all", "pensions", "grievances", "sources", "people", "offices", "audit"]).default("all"),
  limit: z.number().int().min(1).max(15).default(8),
});
const caseArgs = z.object({ case_id: z.string().trim().min(2).max(100) });
const backlogArgs = z.object({ district: z.string().trim().min(2).max(80).optional(), unresolved_only: z.boolean().default(true) });
const grievancesArgs = z.object({ grievance_ids: z.array(z.string().trim().min(2).max(100)).min(1).max(10) });
const auditArgs = z.object({ proposal_id: z.string().trim().min(2).max(100).optional(), from: z.string().date().optional(), to: z.string().date().optional() });
const knowledgeArgs = z.object({ change_id: z.string().trim().min(2).max(100) });
const actionArgs = z.object({
  action: z.enum(["draft_office_note", "create_follow_up_task", "prepare_meeting"]),
  case_id: z.string().trim().min(2).max(100),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(5).max(1200),
  assignee_id: z.string().trim().min(2).max(100).optional(),
  due_date: z.string().date().optional(),
});

export const assistantToolInputSchemas = {
  search_records: searchArgs,
  get_pension_case: caseArgs,
  calculate_backlog: backlogArgs,
  compare_grievances: grievancesArgs,
  query_audit: auditArgs,
  assess_knowledge_change: knowledgeArgs,
  prepare_action: actionArgs,
} satisfies Record<string, z.ZodType>;

export const assistantFunctionDeclarations = [
  {
    name: "search_records",
    description: "Search the permitted synthetic pension, grievance, source, officer, office and audit records. Always use this before answering a factual question that is not covered by a more specific tool.",
    parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "Names, identifiers, subjects or terms to find." }, scope: { type: "STRING", enum: ["all", "pensions", "grievances", "sources", "people", "offices", "audit"] }, limit: { type: "INTEGER", description: "Maximum results, from 1 to 15." } }, required: ["query"] },
  },
  {
    name: "get_pension_case",
    description: "Retrieve one pension case by record ID, case ID or pensioner name, including service figures and linked source citations.",
    parameters: { type: "OBJECT", properties: { case_id: { type: "STRING", description: "The exact case identifier or pensioner name from the records." } }, required: ["case_id"] },
  },
  {
    name: "calculate_backlog",
    description: "Calculate pension registry totals directly from records, with unresolved case IDs and stage and issue breakdowns.",
    parameters: { type: "OBJECT", properties: { district: { type: "STRING", description: "Optional district filter." }, unresolved_only: { type: "BOOLEAN", description: "Use only unresolved records; defaults to true." } } },
  },
  {
    name: "compare_grievances",
    description: "Compare selected grievance records, their administrative disposal, action-taken report and verified outcome. Disposal alone does not prove resolution.",
    parameters: { type: "OBJECT", properties: { grievance_ids: { type: "ARRAY", items: { type: "STRING" }, description: "One or more exact grievance IDs." } }, required: ["grievance_ids"] },
  },
  {
    name: "query_audit",
    description: "Summarize recorded audit events in an optional proposal and date scope. Do not infer intent or activity outside these records.",
    parameters: { type: "OBJECT", properties: { proposal_id: { type: "STRING" }, from: { type: "STRING", description: "Inclusive ISO date (YYYY-MM-DD)." }, to: { type: "STRING", description: "Inclusive ISO date (YYYY-MM-DD)." } } },
  },
  {
    name: "assess_knowledge_change",
    description: "Check the recorded verification and approval state of a proposed source change. Never publish or change policy.",
    parameters: { type: "OBJECT", properties: { change_id: { type: "STRING" } }, required: ["change_id"] },
  },
  {
    name: "prepare_action",
    description: "Prepare (never execute) a working document, follow-up task or meeting for an existing case. Return a proposal that the officer can explicitly save. Do not claim assignment, approval, dispatch or completion.",
    parameters: { type: "OBJECT", properties: { action: { type: "STRING", enum: ["draft_office_note", "create_follow_up_task", "prepare_meeting"] }, case_id: { type: "STRING" }, title: { type: "STRING" }, description: { type: "STRING" }, assignee_id: { type: "STRING", description: "Optional existing officer ID; defaults to the current workspace officer." }, due_date: { type: "STRING", description: "Optional ISO date (YYYY-MM-DD)." } }, required: ["action", "case_id", "title", "description"] },
  },
] as const;

export type AssistantCitation = { document_id: string; title: string; version: number; section: string; passage: string };
export type PreparedAction = { kind: "draft" | "task" | "meeting"; case_id: string; title: string; description: string; assignee_id: string; due_date?: string };
export type ToolExecution = { ok: true; output: Record<string, unknown>; citations: AssistantCitation[]; related: string[]; action?: PreparedAction } | { ok: false; output: Record<string, unknown>; citations: AssistantCitation[]; related: string[] };

const tokens = (query: string) => [...new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}-]{2,}/gu) ?? [])];
const citationFor = (source: (typeof demoSources)[number]): AssistantCitation => ({ document_id: source.id, title: source.title, version: source.version, section: source.logical_location, passage: source.passage });
const citationsFor = (ids: string[]) => demoSources.filter((source) => ids.includes(source.id)).map(citationFor);
const sourceIdsForCase = (caseId: string, caseAlias?: string) => demoSources.filter((source) => source.proposal_id === caseId || (caseAlias && source.proposal_id === caseAlias)).map((source) => source.id);

type SearchRecord = { id: string; category: string; title: string; summary: string; related?: string[]; sourceIds?: string[] };

function allSearchRecords(): SearchRecord[] {
  return [
    ...demoPensions.map((record) => ({
      id: record.id,
      category: "pension",
      title: `${record.pensioner_name} · ${record.case_id ?? record.id}`,
      summary: `${record.district} · ${record.department} · ${record.stage} · ${record.issue ?? "No issue recorded"} · ${record.unresolved ? "unresolved" : "resolved in record"}${record.claimed_service_months == null ? "" : ` · claimed service ${record.claimed_service_months} months`}${record.verified_record_service_months == null ? "" : ` · recorded service ${record.verified_record_service_months} months`}`,
      related: [record.id, record.case_id ?? record.id],
      sourceIds: sourceIdsForCase(record.id, record.case_id),
    })),
    ...demoGrievances.map((record) => ({ id: record.id, category: "grievance", title: record.id, summary: `${record.status} · received ${record.received || "date not recorded"} · ${record.disposed ? "administratively disposed" : "open"} · outcome ${record.outcome_verified ? "verified" : "not verified"}`, related: [record.id, ...(record.case_id ? [record.case_id] : [])], sourceIds: sourceIdsForCase(record.case_id ?? record.id) })),
    ...demoSources.map((source) => ({ id: source.id, category: "source", title: source.title, summary: `${source.logical_location} · ${source.passage}`, related: source.proposal_id ? [source.proposal_id] : [], sourceIds: [source.id] })),
    ...demoPeople.map((person) => ({ id: person.id, category: "person", title: person.name, summary: `${person.designation} · office ${demoOffices.find((office) => office.id === person.office_id)?.name ?? person.office_id} · role ${person.role}`, related: [person.id] })),
    ...demoOffices.map((office) => ({ id: office.id, category: "office", title: office.name, summary: office.location, related: [office.id] })),
    ...demoAuditEvents.map((event) => ({ id: event.id, category: "audit", title: `${event.action} · ${event.id}`, summary: `${event.timestamp} · actor ${event.actor_id} · ${event.decision}${event.external_disclosure_confirmed ? " · external disclosure confirmed in record" : ""}`, related: [event.id, ...(event.proposal_id ? [event.proposal_id] : [])] })),
  ];
}

function searchRecords(query: string, scope: z.infer<typeof searchArgs>["scope"], limit: number) {
  const words = tokens(query);
  if (!words.length) return [];
  const allowed = new Set(scope === "all" ? ["pension", "grievance", "source", "person", "office", "audit"] : [scope === "pensions" ? "pension" : scope === "grievances" ? "grievance" : scope === "sources" ? "source" : scope === "people" ? "person" : scope]);
  return allSearchRecords()
    .filter((record) => allowed.has(record.category))
    .map((record) => ({ record, score: words.reduce((sum, word) => sum + (record.title.toLocaleLowerCase().includes(word) ? 3 : 0) + (record.summary.toLocaleLowerCase().includes(word) ? 1 : 0) + (record.id.toLocaleLowerCase().includes(word) ? 4 : 0), 0) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title))
    .slice(0, limit)
    .map(({ record, score }) => ({ ...record, score }));
}

function findCase(caseId: string) {
  const needle = caseId.toLocaleLowerCase();
  return demoPensions.find((record) => [record.id, record.case_id, record.pensioner_name].some((value) => value?.toLocaleLowerCase() === needle))
    ?? demoPensions.find((record) => record.pensioner_name.toLocaleLowerCase().includes(needle));
}

export function executeAssistantTool(name: string, rawArgs: unknown): ToolExecution {
  const empty: Pick<ToolExecution, "citations" | "related"> = { citations: [], related: [] };
  if (name === "search_records") {
    const parsed = searchArgs.safeParse(rawArgs);
    if (!parsed.success) return { ok: false, output: { error: "The search request did not match the permitted fields." }, ...empty };
    const results = searchRecords(parsed.data.query, parsed.data.scope, parsed.data.limit);
    const sourceIds = [...new Set(results.flatMap((record) => record.sourceIds ?? []))];
    return { ok: true, output: { count: results.length, records: results }, citations: citationsFor(sourceIds), related: [...new Set(results.flatMap((record) => record.related ?? []))] };
  }
  if (name === "get_pension_case") {
    const parsed = caseArgs.safeParse(rawArgs);
    if (!parsed.success) return { ok: false, output: { error: "Provide a case ID or pensioner name." }, ...empty };
    const record = findCase(parsed.data.case_id);
    if (!record) return { ok: true, output: { found: false, message: "No matching pension case is present in the available workspace records." }, ...empty };
    const citations = citationsFor(sourceIdsForCase(record.id, record.case_id));
    const context = record.id === primaryCase.id ? demoSources.filter((source) => ["DOC-001", "DOC-002", "DOC-003", "DOC-004", "DOC-008", "DOC-009"].includes(source.id)).map(citationFor) : citations;
    return { ok: true, output: { found: true, case: record }, citations: context, related: [record.id, record.case_id ?? record.id] };
  }
  if (name === "calculate_backlog") {
    const parsed = backlogArgs.safeParse(rawArgs);
    if (!parsed.success) return { ok: false, output: { error: "The backlog filters were invalid." }, ...empty };
    const selected = demoPensions.filter((record) => !parsed.data.district || record.district.toLocaleLowerCase() === parsed.data.district.toLocaleLowerCase());
    const records = parsed.data.unresolved_only ? selected.filter((record) => record.unresolved) : selected;
    const summary = calculateBacklog(records.map((record) => ({ ...record, late_objection: Boolean(record.late_objection), visible_before_retirement: Boolean(record.visible_before_retirement) })));
    const issues = records.reduce<Record<string, number>>((counts, record) => { const issue = record.issue ?? "unspecified"; counts[issue] = (counts[issue] ?? 0) + 1; return counts; }, {});
    return { ok: true, output: { ...summary, by_issue: issues, as_of: "2026-11-24", case_ids: records.map((record) => record.case_id ?? record.id) }, citations: citationsFor(["DOC-013"]), related: records.slice(0, 50).map((record) => record.case_id ?? record.id) };
  }
  if (name === "compare_grievances") {
    const parsed = grievancesArgs.safeParse(rawArgs);
    if (!parsed.success) return { ok: false, output: { error: "Provide one or more exact grievance IDs." }, ...empty };
    const records = demoGrievances.filter((record) => parsed.data.grievance_ids.includes(record.id));
    const comparison = compareGrievanceDisposals(records);
    return { ok: true, output: { ...comparison, not_found: parsed.data.grievance_ids.filter((id) => !records.some((record) => record.id === id)) }, citations: citationsFor(["DOC-010", "DOC-011", "DOC-012"]), related: [...new Set(records.flatMap((record) => [record.id, ...(record.case_id ? [record.case_id] : [])]))] };
  }
  if (name === "query_audit") {
    const parsed = auditArgs.safeParse(rawArgs);
    if (!parsed.success) return { ok: false, output: { error: "The audit query was invalid." }, ...empty };
    const events = demoAuditEvents.filter((event) => (!parsed.data.proposal_id || event.proposal_id === parsed.data.proposal_id) && (!parsed.data.from || event.timestamp.slice(0, 10) >= parsed.data.from) && (!parsed.data.to || event.timestamp.slice(0, 10) <= parsed.data.to));
    return { ok: true, output: { ...summarizeAudit(events), events }, citations: citationsFor(["DOC-015", "DOC-016"]), related: events.map((event) => event.id) };
  }
  if (name === "assess_knowledge_change") {
    const parsed = knowledgeArgs.safeParse(rawArgs);
    if (!parsed.success) return { ok: false, output: { error: "Provide a knowledge change ID." }, ...empty };
    const change = demoKnowledgeChanges.find((item) => item.id === parsed.data.change_id);
    if (!change) return { ok: true, output: { found: false, message: "No matching knowledge change is present in the available workspace records." }, ...empty };
    return { ok: true, output: { found: true, change, assessment: assessKnowledgeChange(change) }, citations: citationsFor(["DOC-017", "DOC-018"]), related: [change.id, ...change.potential_case_ids, ...change.manual_review_case_ids] };
  }
  if (name === "prepare_action") {
    const parsed = actionArgs.safeParse(rawArgs);
    if (!parsed.success) return { ok: false, output: { error: "The requested action did not match a supported preparation template." }, ...empty };
    const record = findCase(parsed.data.case_id);
    if (!record) return { ok: false, output: { error: "An action can only be prepared for a case found in the workspace." }, ...empty };
    const assigneeId = parsed.data.assignee_id ?? record.owner_id;
    const assignee = demoPeople.find((person) => person.id === assigneeId);
    if (!assignee) return { ok: false, output: { error: "Choose an officer from the workspace directory." }, ...empty };
    const kind = parsed.data.action === "draft_office_note" ? "draft" : parsed.data.action === "create_follow_up_task" ? "task" : "meeting";
    const action: PreparedAction = { kind, case_id: record.case_id ?? record.id, title: parsed.data.title, description: parsed.data.description, assignee_id: assignee.id, ...(parsed.data.due_date ? { due_date: parsed.data.due_date } : {}) };
    return { ok: true, output: { prepared: true, status: "awaiting_officer_save", action }, citations: citationsFor(sourceIdsForCase(record.id, record.case_id)), related: [record.case_id ?? record.id], action };
  }
  return { ok: false, output: { error: "This operation is not registered." }, ...empty };
}

export function localSearchAnswer(query: string) {
  const result = executeAssistantTool("search_records", { query, scope: "all", limit: 8 });
  if (!result.ok) return { answer: "The record search could not validate this request. Please rephrase it and try again.", ...result };
  const records = result.output.records as SearchRecord[];
  const lines = records.map((record) => `• ${record.title}\n  ${record.summary}`);
  const answer = records.length
    ? `I found ${records.length} matching records in the available workspace.\n\n${lines.join("\n\n")}\n\nThis result is a record search. Review the cited source text before relying on a case interpretation.`
    : "No matching records or source passages were found in the available workspace. Try a case ID, officer name, grievance ID, district or source phrase.";
  return { answer, citations: result.citations, related: result.related, kind: "finding" as const };
}
