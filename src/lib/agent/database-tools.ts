import { createTrainingClient } from "@/lib/supabase/training";
import { demoOfficer } from "@/lib/demo/data";
import { assessKnowledgeChange, calculateBacklog, compareGrievanceDisposals, summarizeAudit } from "./workflows";
import { executeAssistantTool, type AssistantCitation, type PreparedAction, type ToolExecution } from "./tools";

type Row = Record<string, unknown>;
type Snapshot = { pensions: Row[]; grievances: Row[]; people: Row[]; offices: Row[]; audits: Row[]; knowledge: Row[]; documents: Row[]; passages: Row[] };

async function loadSnapshot(): Promise<Snapshot | null> {
  const db = createTrainingClient();
  if (!db) return null;
  const requests = await Promise.all([
    db.from("pension_cases").select("id,owner_id,office_id,district,department,unresolved,stage,issue,late_objection,visible_before_retirement,payload,classification").eq("classification", "training").limit(1000),
    db.from("grievances").select("id,case_id,owner_id,received,status,disposed,disposal_date,atr_date,outcome_verified,payload,classification").eq("classification", "training").limit(1000),
    db.from("employees").select("id,name,designation,office_id,role,manager_id,attributes").eq("classification", "training").limit(500),
    db.from("offices").select("id,name,location,parent_id,department_id,attributes").filter("attributes->>classification", "eq", "training").limit(200),
    db.from("audit_events").select("id,proposal_id,timestamp,actor_id,action,decision,external_disclosure_confirmed,classification,payload").eq("classification", "training").limit(1000),
    db.from("knowledge_changes").select("id,source_id,requester_id,reviewer_id,state,authority_verified,signature_verified,effective_date_verified,rule_compatibility_verified,publication_approved,payload,classification").eq("classification", "training").limit(500),
    db.from("documents").select("id,title,current_version,case_id,source_location,source_hash,classification,attributes").eq("classification", "training").limit(500),
    db.from("document_passages").select("document_id,version,section,passage,classification").eq("classification", "training").limit(2000),
  ]);
  const failed = requests.find((result) => result.error);
  if (failed?.error) throw new Error("Configured Supabase training records are unavailable to the server tools.");
  const [pensions, grievances, people, offices, audits, knowledge, documents, passages] = requests.map((result) => result.data ?? []) as Row[][];
  return { pensions, grievances, people, offices, audits, knowledge, documents, passages };
}

function text(value: unknown) { return value == null ? "" : String(value); }
function obj(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function asCase(row: Row): Row & { id: string; pensioner_name: string; case_id: string } { return { ...obj(row.payload), ...row, id: text(row.id), pensioner_name: text(obj(row.payload).pensioner_name ?? row.pensioner_name), case_id: text(obj(row.payload).case_id ?? row.id) }; }
function asGrievance(row: Row): Row & { id: string; case_id: string | null; disposed: boolean; disposal_date: string | null } {
  const payload = obj(row.payload);
  return { ...payload, ...row, id: text(row.id), case_id: row.case_id == null ? null : text(row.case_id), disposed: typeof payload.disposed === "string" ? true : Boolean(row.disposed), disposal_date: text(row.disposal_date ?? payload.disposal_date ?? (typeof payload.disposed === "string" ? payload.disposed : "")) || null };
}
function citations(snapshot: Snapshot, caseIds: string[], explicitIds: string[] = []): AssistantCitation[] {
  const docs = new Map(snapshot.documents.map((doc) => [text(doc.id), doc]));
  const selectedDocs = snapshot.documents.filter((doc) => explicitIds.includes(text(doc.id)) || (doc.case_id != null && caseIds.includes(text(doc.case_id))));
  return snapshot.passages.flatMap((passage) => {
    const doc = docs.get(text(passage.document_id));
    if (!doc || !selectedDocs.some((selected) => selected.id === doc.id) || Number(passage.version) !== Number(doc.current_version)) return [];
    return [{ document_id: text(doc.id), title: text(doc.title), version: Number(passage.version), section: text(passage.section), passage: text(passage.passage) }];
  });
}
function withSource(output: Record<string, unknown>) { return { ...output, data_source: "supabase" }; }
function fail(message: string): ToolExecution { return { ok: false, output: { error: message, data_source: "supabase" }, citations: [], related: [] }; }
function fixtureFallback(name: string, args: unknown): ToolExecution {
  const fallback = executeAssistantTool(name, args);
  return { ...fallback, output: { ...fallback.output, data_source: "fixture_fallback" } };
}

export async function executeDatabaseAssistantTool(name: string, args: unknown): Promise<ToolExecution> {
  let snapshot: Snapshot | null;
  try { snapshot = await loadSnapshot(); }
  catch { return fixtureFallback(name, args); }
  if (!snapshot) return fixtureFallback(name, args);
  try {
    if (name === "search_records") {
      const input = args as { query?: string; scope?: string; limit?: number };
      const terms = (input.query ?? "").toLocaleLowerCase().match(/[\p{L}\p{N}-]{2,}/gu) ?? [];
      const limit = Math.min(15, Math.max(1, Number(input.limit ?? 8)));
      const records = [
        ...snapshot.pensions.map(asCase).map((row) => ({ id: text(row.id), category: "pensions", title: `${text(row.pensioner_name)} · ${text(row.case_id)}`, summary: `${text(row.district)} · ${text(row.department)} · ${text(row.stage)} · ${text(row.issue)} · ${row.unresolved ? "unresolved" : "other recorded status"}`, related: [text(row.id), text(row.case_id)] })),
        ...snapshot.grievances.map(asGrievance).map((row) => ({ id: text(row.id), category: "grievances", title: text(row.id), summary: `${text(row.status)} · received ${text(row.received)} · ${row.disposal_date ? `disposed ${row.disposal_date}` : "not disposed"} · outcome ${row.outcome_verified ? "verified" : "not verified"}`, related: [text(row.id), ...(row.case_id ? [text(row.case_id)] : [])] })),
        ...snapshot.people.map((row) => ({ id: text(row.id), category: "people", title: text(row.name), summary: `${text(row.designation)} · ${text(row.role)} · ${text(row.office_id)}`, related: [text(row.id)] })),
        ...snapshot.offices.map((row) => ({ id: text(row.id), category: "offices", title: text(row.name), summary: text(row.location), related: [text(row.id)] })),
        ...snapshot.audits.map((row) => ({ id: text(row.id), category: "audit", title: `${text(row.action)} · ${text(row.id)}`, summary: `${text(row.timestamp)} · ${text(row.decision)}`, related: [text(row.id), ...(row.proposal_id ? [text(row.proposal_id)] : [])] })),
        ...snapshot.documents.map((row) => ({ id: text(row.id), category: "sources", title: text(row.title), summary: text(row.source_location), related: row.case_id ? [text(row.case_id)] : [] })),
      ].filter((row) => !input.scope || input.scope === "all" || row.category === input.scope);
      const matches = records.map((row) => ({ ...row, score: terms.reduce((score, term) => score + (row.title.toLocaleLowerCase().includes(term) ? 3 : 0) + (row.summary.toLocaleLowerCase().includes(term) ? 1 : 0) + (row.id.toLocaleLowerCase().includes(term) ? 4 : 0), 0) }))
        .filter((row) => row.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
      const related = [...new Set(matches.flatMap((item) => item.related))];
      return { ok: true, output: withSource({ count: matches.length, records: matches }), citations: citations(snapshot, related), related };
    }
    if (name === "get_pension_case") {
      const needle = text((args as { case_id?: string }).case_id).toLocaleLowerCase();
      const row = snapshot.pensions.map(asCase).find((item) => [item.id, item.case_id, item.pensioner_name].some((value) => text(value).toLocaleLowerCase() === needle))
        ?? snapshot.pensions.map(asCase).find((item) => text(item.pensioner_name).toLocaleLowerCase().includes(needle));
      if (!row) return { ok: true, output: withSource({ found: false, message: "No matching pension case is present in the populated Supabase training records." }), citations: [], related: [] };
      return { ok: true, output: withSource({ found: true, case: row }), citations: citations(snapshot, [text(row.id), text(row.case_id)]), related: [text(row.id), text(row.case_id)] };
    }
    if (name === "calculate_backlog") {
      const input = args as { district?: string; unresolved_only?: boolean };
      const all = snapshot.pensions.map(asCase);
      const districtRows = input.district ? all.filter((row) => text(row.district).toLocaleLowerCase() === input.district!.toLocaleLowerCase()) : all;
      const rows = input.unresolved_only === false ? districtRows : districtRows.filter((row) => Boolean(row.unresolved));
      const summary = calculateBacklog(rows.map((row) => ({ id: text(row.id), district: text(row.district), stage: text(row.stage), unresolved: Boolean(row.unresolved), late_objection: row.late_objection == null ? null : Boolean(row.late_objection), visible_before_retirement: row.visible_before_retirement == null ? null : Boolean(row.visible_before_retirement) })));
      const by_issue = rows.reduce<Record<string, number>>((out, row) => { const key = text(row.issue) || "unspecified"; out[key] = (out[key] ?? 0) + 1; return out; }, {});
      const related = rows.map((row) => text(row.id));
      return { ok: true, output: withSource({ ...summary, by_issue, as_of: new Date().toISOString().slice(0, 10), case_ids: related }), citations: citations(snapshot, [], ["DOC-013"]), related };
    }
    if (name === "compare_grievances") {
      const ids = (args as { grievance_ids?: string[] }).grievance_ids ?? [];
      const rows = snapshot.grievances.map(asGrievance).filter((row) => ids.includes(text(row.id)));
      const comparison = compareGrievanceDisposals(rows.map((row) => ({ id: text(row.id), case_id: row.case_id, status: text(row.status), disposed: Boolean(row.disposed), atr_date: row.atr_date ? text(row.atr_date) : null, outcome_verified: Boolean(row.outcome_verified) })));
      const related = [...new Set(rows.flatMap((row) => [text(row.id), ...(row.case_id ? [text(row.case_id)] : [])]))];
      return { ok: true, output: withSource({ ...comparison, records: rows.map((row) => ({ id: row.id, case_id: row.case_id, status: row.status, disposal_date: row.disposal_date, outcome_verified: row.outcome_verified })), not_found: ids.filter((id) => !rows.some((row) => text(row.id) === id)) }), citations: citations(snapshot, related, ["DOC-010", "DOC-011", "DOC-012"]), related };
    }
    if (name === "query_audit") {
      const input = args as { proposal_id?: string; from?: string; to?: string };
      const events = snapshot.audits.filter((row) => (!input.proposal_id || row.proposal_id === input.proposal_id) && (!input.from || text(row.timestamp).slice(0, 10) >= input.from) && (!input.to || text(row.timestamp).slice(0, 10) <= input.to));
      const summary = summarizeAudit(events.map((row) => ({ id: text(row.id), action: text(row.action), decision: text(row.decision), external_disclosure_confirmed: Boolean(row.external_disclosure_confirmed) })));
      return { ok: true, output: withSource({ ...summary, events }), citations: citations(snapshot, [], ["DOC-015", "DOC-016"]), related: events.map((row) => text(row.id)) };
    }
    if (name === "assess_knowledge_change") {
      const id = text((args as { change_id?: string }).change_id);
      const change = snapshot.knowledge.find((row) => row.id === id);
      if (!change) return { ok: true, output: withSource({ found: false, message: "No matching knowledge change is present in Supabase." }), citations: [], related: [] };
      const payload = obj(change.payload);
      const related = [...(Array.isArray(payload.potential_case_ids) ? payload.potential_case_ids.map(text) : []), ...(Array.isArray(payload.manual_review_case_ids) ? payload.manual_review_case_ids.map(text) : []), id];
      return { ok: true, output: withSource({ found: true, change, assessment: assessKnowledgeChange({ ...change, payload: payload as { potential_case_ids?: string[]; manual_review_case_ids?: string[] } } as unknown as Parameters<typeof assessKnowledgeChange>[0]) }), citations: citations(snapshot, [], ["DOC-017", "DOC-018"]), related };
    }
    if (name === "prepare_action") {
      const input = args as { action?: string; case_id?: string; title?: string; description?: string; assignee_id?: string; due_date?: string };
      const row = snapshot.pensions.map(asCase).find((item) => [text(item.id), text(item.case_id)].includes(text(input.case_id)));
      if (!row) return fail("An action can only be prepared for a case present in Supabase training records.");
      const assignee = input.assignee_id ? snapshot.people.find((person) => person.id === input.assignee_id) : snapshot.people.find((person) => person.id === demoOfficer.id) ?? snapshot.people[0];
      if (!assignee) return fail("No authorized training officer is available in the database.");
      const kind = input.action === "draft_office_note" ? "draft" : input.action === "prepare_meeting" ? "meeting" : "task";
      const action: PreparedAction = { kind, case_id: text(row.case_id), title: text(input.title), description: text(input.description), assignee_id: text(assignee.id), ...(input.due_date ? { due_date: input.due_date } : {}) };
      return { ok: true, output: withSource({ prepared: true, status: "awaiting_officer_save", action }), citations: citations(snapshot, [text(row.id), text(row.case_id)]), related: [text(row.case_id)], action };
    }
    return executeAssistantTool(name, args);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Supabase training records could not be searched.");
  }
}
