import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { demoAuditEvents, demoGrievances, demoKnowledgeChanges, demoPensions, demoSources } from "@/lib/demo/data";

const modules = {
  pensions: { title: "Pensions", table: "pension_cases", columns: ["id", "district", "stage", "issue", "unresolved", "owner_id"] },
  grievances: { title: "Grievances", table: "grievances", columns: ["id", "case_id", "status", "disposed", "received", "owner_id"] },
  work: { title: "Work", table: "tasks", columns: ["id", "title", "case_id", "assignee_id", "due_date", "status"] },
  documents: { title: "Documents", table: "documents", columns: ["id", "title", "current_version", "case_id", "source_location", "classification"] },
  approvals: { title: "Approvals", table: "approval_requests", columns: ["id", "target_type", "target_id", "target_version", "reviewer_id", "status", "created_at"] },
  knowledge: { title: "Knowledge", table: "knowledge_changes", columns: ["id", "source_id", "requester_id", "reviewer_id", "state", "effective_date_verified", "publication_approved"] },
  audit: { title: "Audit", table: "audit_events", columns: ["id", "proposal_id", "timestamp", "actor_id", "action", "decision", "external_disclosure_confirmed"] },
} as const;
type ModuleKey = keyof typeof modules;
type RowData = Record<string, unknown>;

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (module === "meetings") redirect("/calendar");
  if (module === "reports") redirect("/analytics");
  if (module === "work") redirect("/work");
  if (!(module in modules) && module !== "analytics") notFound();
  const supabase = await createClient();
  if (module === "analytics") {
    const { data, error } = supabase ? await supabase.from("pension_cases").select("id,stage,unresolved,late_objection,visible_before_retirement").limit(1000) : { data: null, error: null };
    const rows = data ?? demoPensions;
    const count = (key: "unresolved" | "late_objection" | "visible_before_retirement") => rows.filter((row) => row[key] === true).length;
    const stages: Record<string, number> = {};
    for (const row of rows) stages[row.stage] = (stages[row.stage] ?? 0) + 1;
    return <section className="content"><div className="eyebrow">Pension & Public Grievances</div><h1 className="mt-2 text-3xl font-semibold">Analytics</h1>{error ? <p className="mt-4 text-sm text-red-700">Authorized figures could not be loaded.</p> : <><p className="mt-2 text-sm text-secondary">Calculated from {data ? "records visible to this session" : "the supplied synthetic pension register"}; the offline figures are labelled training data.</p><div className="mt-6 grid gap-3 sm:grid-cols-3"><Metric label="Visible cases" value={rows.length}/><Metric label="Unresolved" value={count("unresolved")}/><Metric label="Late service objections" value={count("late_objection")}/><Metric label="Visible before retirement" value={count("visible_before_retirement")}/></div><h2 className="section-title">Cases by recorded stage</h2><div className="panel divide-y divide-border">{Object.entries(stages).map(([stage, cases]) => <div key={stage} className="flex justify-between p-4"><span>{stage.replaceAll("_", " ")}</span><strong>{cases}</strong></div>)}</div></>}</section>;
  }
  const definition = modules[module as ModuleKey];
  const result = supabase ? await queryModuleRows(supabase, definition) : { data: null, error: null };
  const rows = ((result.data ?? offlineRows(definition.table)) ?? []) as RowData[];
  return <section className="content"><div className="page-heading"><div><div className="eyebrow">Pension & Public Grievances · Assam</div><h1>{definition.title}</h1><p className="mt-2 text-sm text-secondary">{rows.length} {result.data ? "authorized records" : "synthetic training records"}</p></div></div>
    {result.error ? <div role="alert" className="panel p-5 text-sm text-red-800">Could not retrieve this workspace application.</div> : rows.length ? <div className="panel overflow-x-auto"><table className="table"><thead><tr>{definition.columns.map((column) => <th key={column}>{column.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)}>{definition.columns.map((column) => <td key={column}>{column === "id" ? <Link className="font-medium text-primary hover:underline" href={`/${module}/${encodeURIComponent(String(row.id))}`}>{String(row[column] ?? "")}</Link> : typeof row[column] === "boolean" ? row[column] ? "Yes" : "No" : String(row[column] ?? "—")}</td>)}</tr>)}</tbody></table></div> : <div className="panel p-8 text-center text-sm text-secondary">No records are available in the current authorized scope.</div>}
  </section>;
}

async function queryModuleRows(supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>, definition: (typeof modules)[ModuleKey]) {
  switch (definition.table) {
    case "pension_cases": return supabase.from("pension_cases").select("id,district,stage,issue,unresolved,owner_id").limit(200);
    case "grievances": return supabase.from("grievances").select("id,case_id,status,disposed,received,owner_id").limit(200);
    case "tasks": return supabase.from("tasks").select("id,title,case_id,assignee_id,due_date,status").limit(200);
    case "documents": return supabase.from("documents").select("id,title,current_version,case_id,source_location,classification").limit(200);
    case "approval_requests": return supabase.from("approval_requests").select("id,target_type,target_id,target_version,reviewer_id,status,created_at").limit(200);
    case "knowledge_changes": return supabase.from("knowledge_changes").select("id,source_id,requester_id,reviewer_id,state,effective_date_verified,publication_approved").limit(200);
    case "audit_events": return supabase.from("audit_events").select("id,proposal_id,timestamp,actor_id,action,decision,external_disclosure_confirmed").limit(200);
  }
}

function offlineRows(table: (typeof modules)[ModuleKey]["table"]): RowData[] {
  if (table === "pension_cases") return demoPensions.map(({ id, district, stage, issue, unresolved, owner_id }) => ({ id, district, stage, issue, unresolved, owner_id }));
  if (table === "grievances") return demoGrievances.map(({ id, case_id, status, disposed, received, owner_id }) => ({ id, case_id, status, disposed, received, owner_id }));
  if (table === "documents") return demoSources.map((source) => ({ id: source.id, title: source.title, current_version: source.version, case_id: source.proposal_id, source_location: source.logical_location, classification: source.classification }));
  if (table === "knowledge_changes") return demoKnowledgeChanges.map(({ id, source_id, requester_id, reviewer_id, state, effective_date_verified, publication_approved }) => ({ id, source_id, requester_id, reviewer_id, state, effective_date_verified, publication_approved }));
  if (table === "audit_events") return demoAuditEvents.map(({ id, proposal_id, timestamp, actor_id, action, decision, external_disclosure_confirmed }) => ({ id, proposal_id, timestamp, actor_id, action, decision, external_disclosure_confirmed }));
  return [];
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="panel p-5"><div className="text-sm text-secondary">{label}</div><div className="mt-2 text-3xl font-semibold">{value}</div></div>; }
