"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FilePlus2, ListTodo } from "lucide-react";
import { saveTask } from "@/lib/demo/store";

type EmployeeOption = { id: string; name: string; role: string };
export function CaseActions({ caseId, employees }: { caseId: string; employees: EmployeeOption[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(`Follow up on ${caseId}`);
  const [assignee, setAssignee] = useState(employees[0]?.id ?? "");
  const [dueDate, setDueDate] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function prepareNote() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/documents/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ case_id: caseId, kind: "office_note" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save the office note.");
      router.push(`/documents/${encodeURIComponent(result.document.id)}`);
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Could not save the office note."); setBusy(false); }
  }

  async function assignTask(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    saveTask({ id: `TASK-${crypto.randomUUID()}`, title, description: "Prepared follow-up task for officer review.", assignee, caseId, dueDate, status: "prepared", createdAt: new Date().toISOString() });
    setNotice("Task saved in this session as Prepared. It has not been officially assigned or completed.");
    setBusy(false);
  }

  return <div className="panel mt-5 grid gap-5 p-5 lg:grid-cols-2">
    <div><h2 className="font-semibold">Prepare a working document</h2><p className="mt-1 text-sm text-secondary">Create an office-note draft from authorized case fields and exact linked source passages.</p><button className="btn btn-primary mt-3" onClick={() => void prepareNote()} disabled={busy}><FilePlus2 size={15}/>Prepare office note</button></div>
    <form onSubmit={assignTask}><h2 className="font-semibold">Assign follow-up work</h2><div className="mt-3 grid gap-2"><input className="field" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={240} aria-label="Task title"/><select className="field" value={assignee} onChange={(event) => setAssignee(event.target.value)} required aria-label="Task assignee"><option value="">Choose an authorized officer</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.role.replaceAll("_", " ")}</option>)}</select><div className="flex gap-2"><input className="field" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} aria-label="Due date"/><button className="btn btn-primary" disabled={busy || !assignee}><ListTodo size={15}/>Assign task</button></div></div></form>
    {notice && <p role="status" className="text-sm text-secondary lg:col-span-2">{notice} <Link className="text-primary hover:underline" href="/work">Open Work</Link></p>}
  </div>;
}
