"use client";

import { useMemo, useState } from "react";
import { ReactFlow, Background, Controls, type Edge, type Node } from "@xyflow/react";

export type EmployeeRow = { id: string; name: string; designation: string; office_id: string; role: string; manager_id: string | null; office_name: string; assigned_cases: number; assigned_tasks: number };
type OfficeRow = { id: string; name: string; location: string; parent_id: string | null };
type TaskRow = { id: string; assignee_id: string; status: string; title: string };
const tabs = ["Directory", "Organisation", "Offices", "Responsibilities", "Workload", "Relationships", "Access"] as const;

function OrganisationChart({ employees, onSelect }: { employees: EmployeeRow[]; onSelect: (employee: EmployeeRow) => void }) {
  const nodes: Node[] = employees.map((employee, index) => ({
    id: employee.id,
    position: { x: (index % 4) * 260, y: Math.floor(index / 4) * 130 },
    data: { label: <button className="rounded-lg border border-border bg-white px-4 py-3 text-left shadow-sm" onClick={() => onSelect(employee)}><strong className="block">{employee.name}</strong><span className="text-xs text-secondary">{employee.designation}</span></button> },
    style: { width: 230, padding: 0, border: 0, background: "transparent" },
  }));
  const edges: Edge[] = employees.filter((employee) => employee.manager_id && employees.some((manager) => manager.id === employee.manager_id)).map((employee) => ({ id: `${employee.manager_id}-${employee.id}`, source: employee.manager_id!, target: employee.id, type: "smoothstep" }));
  return <div className="panel h-[560px] overflow-hidden"><ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable nodesConnectable={false} proOptions={{ hideAttribution: true }}><Background color="#e2e5eb" gap={22}/><Controls/></ReactFlow></div>;
}

export function PeopleWorkspace({ employees, offices, tasks, error }: { employees: EmployeeRow[]; offices: OfficeRow[]; tasks: TaskRow[]; error?: string }) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Directory");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<EmployeeRow | null>(null);
  const filtered = useMemo(() => employees.filter((person) => `${person.name} ${person.designation} ${person.office_name} ${person.role}`.toLowerCase().includes(search.toLowerCase())), [employees, search]);

  return <>
    <div className="page-heading"><div><div className="eyebrow">Pension & Public Grievances · Assam</div><h1>People</h1><p className="mt-2 text-sm text-secondary">Officers, offices, responsibilities and records within your access scope.</p></div><input className="field max-w-64" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people or offices..." aria-label="Search people or offices"/></div>
    <div className="mb-4 flex flex-wrap gap-1 border-b border-border">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`px-3 py-2 text-sm ${tab === item ? "border-b-2 border-primary font-medium text-primary" : "text-secondary"}`} aria-pressed={tab === item}>{item}</button>)}</div>
    {error && <p role="alert" className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm">Could not load the officer directory: {error}</p>}
    {tab === "Directory" && <div className="panel overflow-x-auto"><table className="table"><thead><tr><th>Employee</th><th>Designation</th><th>Office</th><th>Responsibilities</th><th>Assigned work</th><th></th></tr></thead><tbody>{filtered.map((employee) => <tr key={employee.id}><td><button className="flex items-center gap-3 text-left" onClick={() => setSelected(employee)}><span className="grid size-9 place-items-center rounded-full bg-violet-100 text-xs font-semibold text-primary">{employee.name.split(/\s+/).slice(0,2).map((part) => part[0]).join("")}</span><span><strong className="block">{employee.name}</strong><small className="text-secondary">{employee.id} · {employee.role.replaceAll("_", " ")}</small></span></button></td><td>{employee.designation}</td><td>{employee.office_name}</td><td>{responsibility(employee.role)}</td><td>{employee.assigned_cases} cases · {employee.assigned_tasks} tasks</td><td><button className="text-primary" onClick={() => setSelected(employee)} aria-label={`Open ${employee.name}`}>Open</button></td></tr>)}</tbody></table>{!employees.length && <p className="p-8 text-center text-sm text-secondary">No officers are available in your authorized scope.</p>}</div>}
    {tab === "Organisation" && <OrganisationChart employees={employees} onSelect={setSelected}/>}
    {tab === "Offices" && <div className="panel overflow-x-auto"><table className="table"><thead><tr><th>Office</th><th>Location</th><th>Reports to</th><th>Officers listed</th></tr></thead><tbody>{offices.map((office) => <tr key={office.id}><td>{office.name}</td><td>{office.location}</td><td>{offices.find((parent) => parent.id === office.parent_id)?.name ?? "Department"}</td><td>{employees.filter((person) => person.office_id === office.id).length}</td></tr>)}</tbody></table></div>}
    {tab === "Responsibilities" && <div className="panel overflow-x-auto"><table className="table"><thead><tr><th>Employee</th><th>Office</th><th>Role</th><th>Responsibilities</th></tr></thead><tbody>{filtered.map((person) => <tr key={person.id}><td>{person.name}</td><td>{person.office_name}</td><td>{person.role.replaceAll("_", " ")}</td><td>{responsibility(person.role)}</td></tr>)}</tbody></table></div>}
    {tab === "Workload" && <div className="panel overflow-x-auto"><table className="table"><thead><tr><th>Employee</th><th>Office</th><th>Assigned cases</th><th>Assigned tasks</th></tr></thead><tbody>{filtered.map((person) => <tr key={person.id}><td>{person.name}</td><td>{person.office_name}</td><td>{person.assigned_cases}</td><td>{person.assigned_tasks}</td></tr>)}</tbody></table></div>}
    {tab === "Relationships" && <div className="panel p-5"><h2 className="font-semibold">Reporting relationships</h2><p className="mt-2 text-sm text-secondary">Relationships are drawn from recorded employee and office links.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{filtered.filter((person) => person.manager_id).map((person) => <div key={person.id} className="rounded border border-border p-3 text-sm">{person.name} <span className="text-secondary">reports to</span> {employees.find((manager) => manager.id === person.manager_id)?.name ?? "unresolved profile"}</div>)}</div></div>}
    {tab === "Access" && <div className="panel p-5"><h2 className="font-semibold">Access controls</h2><p className="mt-2 text-sm text-secondary">Records in this view are filtered by Supabase row-level security and the server-side employee profile.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{filtered.map((person) => <div key={person.id} className="rounded border border-border p-3 text-sm">{person.name}<span className="ml-2 pill">{person.role.replaceAll("_", " ")}</span></div>)}</div></div>}
    {tab === "Workload" && tasks.length > 0 && <p className="mt-3 text-xs text-secondary">Task totals include {tasks.length} records in your authorized scope.</p>}
    {selected && <div className="fixed inset-0 z-30 flex justify-end bg-slate-950/20" onClick={() => setSelected(null)}><aside className="h-full w-[min(440px,95vw)] overflow-auto bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}><button className="btn mb-6" onClick={() => setSelected(null)}>Close</button><div className="eyebrow">Officer profile</div><h2 className="mt-2 text-2xl font-semibold">{selected.name}</h2><p className="mt-1 text-sm text-secondary">{selected.designation}</p><dl className="mt-6 grid grid-cols-[140px_1fr] gap-y-3 text-sm"><dt className="text-secondary">Office</dt><dd>{selected.office_name}</dd><dt className="text-secondary">Reports to</dt><dd>{employees.find((manager) => manager.id === selected.manager_id)?.name ?? "No manager recorded"}</dd><dt className="text-secondary">Responsibilities</dt><dd>{responsibility(selected.role)}</dd><dt className="text-secondary">Assigned cases</dt><dd>{selected.assigned_cases}</dd><dt className="text-secondary">Assigned tasks</dt><dd>{selected.assigned_tasks}</dd><dt className="text-secondary">Permissions</dt><dd>{selected.role.replaceAll("_", " ")} · server enforced</dd></dl></aside></div>}
  </>;
}

function responsibility(role: string) {
  const descriptions: Record<string, string> = { leadership: "Department oversight and review", supervisor: "Section supervision and approvals", pension_assistant: "Pension case preparation", grievance_officer: "Grievance coordination", head_of_office: "Office review and case oversight", audit_officer: "Restricted audit review", system_admin: "Workspace administration", staff: "Department support", directorate_officer: "Directorate coordination" };
  return descriptions[role] ?? "Not specified in supplied profile";
}
