import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  if (!(module in modules) && !["projects", "forms", "analytics", "meetings", "reports"].includes(module)) notFound();
  const supabase = await createClient();
  if (!supabase) notFound();
  if (module === "analytics") {
    const { data, error } = await supabase.from("pension_cases").select("id,stage,unresolved,late_objection,visible_before_retirement").limit(1000);
    const rows = data ?? [];
    const count = (key: "unresolved" | "late_objection" | "visible_before_retirement") => rows.filter((row) => row[key]).length;
    const stages: Record<string, number> = {};
    for (const row of rows) stages[row.stage] = (stages[row.stage] ?? 0) + 1;
    return <section className="content"><div className="eyebrow">Pension & Public Grievances</div><h1 className="mt-2 text-3xl font-semibold">Analytics</h1>{error ? <p className="mt-4 text-sm text-red-700">Authorized figures could not be loaded.</p> : <><p className="mt-2 text-sm text-secondary">Calculated from pension records available to your account.</p><div className="mt-6 grid gap-3 sm:grid-cols-3"><Metric label="Visible cases" value={rows.length}/><Metric label="Unresolved" value={count("unresolved")}/><Metric label="Late service objections" value={count("late_objection")}/><Metric label="Visible before retirement" value={count("visible_before_retirement")}/></div><h2 className="section-title">Cases by recorded stage</h2><div className="panel divide-y divide-border">{Object.entries(stages).map(([stage, cases]) => <div key={stage} className="flex justify-between p-4"><span>{stage.replaceAll("_", " ")}</span><strong>{cases}</strong></div>)}</div></>}</section>;
  }
  if (module === "projects" || module === "forms" || module === "meetings" || module === "reports") {
    const title = module[0].toUpperCase() + module.slice(1);
    return <section className="content"><div className="eyebrow">Workspace application</div><h1 className="mt-2 text-3xl font-semibold">{title}</h1><div className="panel mt-6 p-6"><p className="font-medium">No {title.toLowerCase()} records are available in the connected workspace.</p><p className="mt-2 text-sm text-secondary">This page will show records after they are configured in Supabase. No sample activity is presented as operational data.</p></div></section>;
  }
  const definition = modules[module as ModuleKey];
  const result = await queryModuleRows(supabase, definition);
  const rows = (result.data ?? []) as RowData[];
  return <section className="content"><div className="page-heading"><div><div className="eyebrow">Pension & Public Grievances · Assam</div><h1>{definition.title}</h1><p className="mt-2 text-sm text-secondary">{rows.length} authorized records</p></div></div>
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

function Metric({ label, value }: { label: string; value: number }) { return <div className="panel p-5"><div className="text-sm text-secondary">{label}</div><div className="mt-2 text-3xl font-semibold">{value}</div></div>; }
