"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, ChevronRight, FileText, Network, Plus, Search, UsersRound } from "lucide-react";
import { readTasks, saveTask } from "@/lib/demo/store";
import type { DemoTask } from "@/lib/demo/data";

const workflows = [
  { name: "Pension Processing", description: "Retirement, re-employment and pension cases", icon: UsersRound },
  { name: "Service Book Correction", description: "Update and rectify service records", icon: FileText },
  { name: "Pay Fixation", description: "Revision, anomaly and arrear calculation", icon: BookOpen },
  { name: "Leave and LTC", description: "Leave approval and travel claims", icon: UsersRound },
  { name: "General Administration", description: "Office orders, notes and approvals", icon: Network },
];
const steps = ["Case Intake", "Verify Service", "Apply Rules", "Draft Order", "Approval"];
const taskKey = "singularity:store";

export function WorkflowsWorkspace() {
  const [selected, setSelected] = useState(workflows[0]!);
  const [tab, setTab] = useState("All Workflows");
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<DemoTask[]>([]);
  const [notice, setNotice] = useState("");
  useEffect(() => { const sync = () => setTasks(readTasks()); sync(); window.addEventListener(taskKey, sync); window.addEventListener("storage", sync); return () => { window.removeEventListener(taskKey, sync); window.removeEventListener("storage", sync); }; }, []);
  const filtered = useMemo(() => workflows.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const visibleTasks = tab === "Completed" ? tasks.filter((task) => task.status === "completed") : tab === "My Tasks" ? tasks : [];
  function startWorkflow() {
    const id = `TASK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    saveTask({ id, title: "Verify service records and eligibility", description: "Check the service book, extraordinary leave sanction, qualifying service and supporting evidence.", assignee: "P01", caseId: "PEN-NGN-2026-041", dueDate: "", status: "prepared", createdAt: new Date().toISOString() });
    setNotice("A local task was prepared. It has not been assigned or completed.");
  }
  function updateTask(task: DemoTask, status: string) { saveTask({ ...task, status }); }

  return <>
    <div className="page-heading workflow-heading"><div><h1>Workflows</h1><p>Standard government processes, in one place.</p></div><button className="btn btn-primary" onClick={startWorkflow}><Plus size={17}/>Create workflow</button></div>
    <div className="workflow-tabs"><div>{["All Workflows", "My Tasks", "Templates", "Completed"].map((name) => <button key={name} className={tab === name ? "selected" : ""} onClick={() => setTab(name)}>{name}{name === "My Tasks" && tasks.length ? ` (${tasks.length})` : ""}</button>)}</div><label><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workflows..."/></label></div>
    {notice && <p role="status" className="inline-notice">{notice}</p>}
    {tab === "My Tasks" || tab === "Completed" ? <div className="panel mt-5 divide-y divide-border">{visibleTasks.length ? visibleTasks.map((task) => <article className="task-row" key={task.id}><div><b>{task.title}</b><p>{task.description}</p><small>{task.id} · {task.caseId} · {task.status.replaceAll("_", " ")}</small></div><div className="flex gap-2">{task.status !== "completed" && <button className="btn" onClick={() => updateTask(task, "in_progress")}>Start</button>}{task.status !== "completed" && <button className="btn btn-primary" onClick={() => updateTask(task, "completed")}>Mark complete</button>}<Link className="btn" href={`/cases/${encodeURIComponent(task.caseId)}`}>Open case</Link></div></article>) : <p className="p-7 text-sm text-secondary">No {tab.toLowerCase()} in this browser yet.</p>}</div> : <div className="workflow-layout"><div className="workflow-list">{filtered.map((workflow) => { const Icon = workflow.icon; return <button key={workflow.name} onClick={() => setSelected(workflow)} className={`workflow-option ${selected.name === workflow.name ? "selected" : ""}`}><Icon size={28}/><span><b>{workflow.name}</b><small>{workflow.description}</small></span><ChevronRight size={17}/></button>; })}</div>
      <div className="workflow-detail"><div className="page-heading"><div><h2>{selected.name}</h2><p>{selected.name === "Pension Processing" ? "End-to-end workflow for pension and service-verification cases" : selected.description}</p></div><button className="btn" onClick={startWorkflow}><Plus size={15}/>Start workflow</button></div>
        {selected.name === "Pension Processing" ? <><div className="workflow-steps">{steps.map((name, index) => <div key={name} className={`workflow-step ${index === 0 ? "done" : index === 1 ? "current" : ""}`}><span>{index === 0 ? <Check size={17}/> : index + 1}</span><b>{name}</b><small>{index === 0 ? "Completed" : index === 1 ? "In progress" : "Not started"}</small></div>)}</div><section className="current-task"><h3>Current Task</h3><div><FileText size={21}/><span><b>Verify service records and eligibility</b><small>Check service book, continuity of service and the leave sanction record.</small></span><Link className="btn btn-primary" href="/cases/PEN-NGN-2026-041">Open Task</Link></div></section><h3 className="section-title">Related Resources</h3><div className="resource-grid"><Link href="/documents/DOC-017"><BookOpen/><span><b>Leave clarification</b><small>Unverified training record</small></span></Link><Link href="/cases/PEN-NGN-2026-041"><Network/><span><b>Related case</b><small>PEN-NGN-2026-041</small></span></Link><Link href="/documents"><FileText/><span><b>Templates</b><small>Drafts and source documents</small></span></Link></div></> : <div className="template-note"><p>This workflow is an illustrative template. Its actions are not connected to a government system.</p><button className="btn btn-primary" onClick={startWorkflow}>Prepare local workflow task</button></div>}
      </div>
    </div>}
  </>;
}
