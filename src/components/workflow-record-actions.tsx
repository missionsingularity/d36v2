"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TaskStatusActions({ taskId, status, canUpdate }: { taskId: string; status: string; canUpdate: boolean }) {
  const router = useRouter(); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  async function change(next: string) {
    setBusy(true); setNotice("");
    try { const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: next }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setNotice(`Task status saved as ${result.task.status}.`); router.refresh(); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "Task status could not be saved."); }
    finally { setBusy(false); }
  }
  return <div>{canUpdate && <select className="field max-w-xs" value={status} disabled={busy || ["complete", "cancelled"].includes(status)} onChange={(event) => void change(event.target.value)} aria-label="Update task status">{["open", "in_progress", "blocked", "complete", "cancelled"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>}{notice && <p role="status" className="mt-2 text-sm text-secondary">{notice}</p>}</div>;
}

export function ApprovalDecisionActions({ approvalId, canReview }: { approvalId: string; canReview: boolean }) {
  const router = useRouter(); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  async function decide(action: "approved" | "returned" | "rejected") {
    setBusy(true); setNotice("");
    try { const response = await fetch(`/api/approvals/${encodeURIComponent(approvalId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setNotice(`Approval marked ${result.approval.status}.`); router.refresh(); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "Approval action could not be completed."); }
    finally { setBusy(false); }
  }
  return <div>{canReview && <div className="mt-4 flex flex-wrap gap-2"><button className="btn btn-primary" disabled={busy} onClick={() => void decide("approved")}>Approve version</button><button className="btn" disabled={busy} onClick={() => void decide("returned")}>Return for revision</button><button className="btn" disabled={busy} onClick={() => void decide("rejected")}>Reject</button></div>}{notice && <p role="status" className="mt-2 text-sm text-secondary">{notice}</p>}</div>;
}
