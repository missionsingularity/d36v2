import { notFound } from "next/navigation";
import Link from "next/link";
import { ApprovalDecisionActions, TaskStatusActions } from "@/components/workflow-record-actions";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspaceProfile } from "@/lib/auth/context";

export default async function WorkflowRecordPage({ params }: { params: Promise<{ module: string; recordId: string }> }) {
  const { module, recordId } = await params;
  const supabase = await createClient();
  if (!supabase) notFound();
  const profile = await requireWorkspaceProfile();

  if (module === "work") {
    const { data: task } = await supabase.from("tasks").select("id,title,case_id,assignee_id,due_date,status,created_by,created_at,updated_at").eq("id", recordId).maybeSingle();
    if (!task) notFound();
    const [assignee, events] = await Promise.all([supabase.from("employees").select("id,name,designation").eq("id", task.assignee_id).maybeSingle(), supabase.from("task_events").select("id,actor_id,event_type,from_status,to_status,detail,created_at").eq("task_id", task.id).order("created_at", { ascending: false })]);
    return <section className="content"><Link href="/work" className="text-sm text-primary hover:underline">← Work</Link><div className="eyebrow mt-5">Task · {task.id}</div><h1 className="mt-2 text-3xl font-semibold">{task.title}</h1><div className="panel mt-6 max-w-3xl p-5"><dl className="grid grid-cols-[150px_1fr] gap-y-3 text-sm"><dt className="text-secondary">Status</dt><dd>{task.status.replaceAll("_", " ")}</dd><dt className="text-secondary">Assignee</dt><dd>{assignee.data?.name ?? task.assignee_id}</dd><dt className="text-secondary">Due</dt><dd>{task.due_date ?? "Not set"}</dd><dt className="text-secondary">Case</dt><dd>{task.case_id ? <Link className="text-primary hover:underline" href={`/pensions/${encodeURIComponent(task.case_id)}`}>{task.case_id}</Link> : "Not linked"}</dd></dl><div className="mt-5"><h2 className="mb-2 font-semibold">Update status</h2><TaskStatusActions taskId={task.id} status={task.status} canUpdate={task.assignee_id === profile.employee_id}/></div></div><h2 className="section-title">Task history</h2><div className="panel divide-y divide-border">{events.data?.length ? events.data.map((event) => <div key={event.id} className="p-3 text-sm"><b>{event.event_type.replaceAll("_", " ")}</b><div className="mt-1 text-xs text-secondary">{event.from_status ?? ""} {event.to_status ? `→ ${event.to_status}` : ""} · {event.created_at}</div>{event.detail && <p className="mt-1 text-secondary">{event.detail}</p>}</div>) : <p className="p-4 text-sm text-secondary">No task history was recorded.</p>}</div></section>;
  }

  if (module === "approvals") {
    const { data: approval } = await supabase.from("approval_requests").select("id,target_type,target_id,target_version,requested_by,reviewer_id,status,comment,created_at,decided_at").eq("id", recordId).maybeSingle();
    if (!approval) notFound();
    const { data: events } = await supabase.from("approval_events").select("id,actor_id,action,comment,created_at").eq("approval_id", recordId).order("created_at", { ascending: false });
    return <section className="content"><Link href="/approvals" className="text-sm text-primary hover:underline">← Approvals</Link><div className="eyebrow mt-5">Approval request · {approval.id}</div><h1 className="mt-2 text-3xl font-semibold">{approval.target_type} review</h1><div className="panel mt-6 max-w-3xl p-5"><dl className="grid grid-cols-[160px_1fr] gap-y-3 text-sm"><dt className="text-secondary">Status</dt><dd>{approval.status}</dd><dt className="text-secondary">Target</dt><dd><Link className="text-primary hover:underline" href={`/documents/${encodeURIComponent(approval.target_id)}`}>{approval.target_id} · version {approval.target_version}</Link></dd><dt className="text-secondary">Requested by</dt><dd>{approval.requested_by}</dd><dt className="text-secondary">Reviewer</dt><dd>{approval.reviewer_id}</dd><dt className="text-secondary">Requested</dt><dd>{approval.created_at}</dd><dt className="text-secondary">Comment</dt><dd>{approval.comment ?? "No review instruction"}</dd></dl>{approval.status === "pending" && <ApprovalDecisionActions approvalId={approval.id} canReview={approval.reviewer_id === profile.employee_id}/>}</div><h2 className="section-title">Approval history</h2><div className="panel divide-y divide-border">{events?.length ? events.map((event) => <div key={event.id} className="p-3 text-sm"><b>{event.action}</b><span className="ml-2 text-xs text-secondary">{event.actor_id} · {event.created_at}</span>{event.comment && <p className="mt-1">{event.comment}</p>}</div>) : <p className="p-4 text-sm text-secondary">No approval events were recorded.</p>}</div></section>;
  }

  if (module === "knowledge") {
    const { data: record } = await supabase.from("knowledge_changes").select("id,source_id,requester_id,reviewer_id,state,authority_verified,signature_verified,effective_date_verified,rule_compatibility_verified,publication_approved,payload").eq("id", recordId).maybeSingle();
    if (!record) notFound();
    return <section className="content"><Link href="/knowledge" className="text-sm text-primary hover:underline">← Knowledge</Link><div className="eyebrow mt-5">Knowledge change · {record.id}</div><h1 className="mt-2 text-3xl font-semibold">Verification and impact review</h1><div className="panel mt-6 max-w-3xl p-5"><p>State: <b>{record.state}</b>. A proposal is not an approved or published rule.</p><dl className="mt-5 grid grid-cols-[220px_1fr] gap-y-3 text-sm">{[["Authority verified",record.authority_verified],["Signature verified",record.signature_verified],["Effective date verified",record.effective_date_verified],["Rule compatibility verified",record.rule_compatibility_verified],["Publication approved",record.publication_approved]].map(([label,value]) => <div key={String(label)} className="contents"><dt className="text-secondary">{String(label)}</dt><dd>{value ? "Verified" : "Requires verification"}</dd></div>)}</dl><pre className="mt-5 whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{JSON.stringify(record.payload, null, 2)}</pre></div></section>;
  }

  if (module === "audit") {
    const { data: event } = await supabase.from("audit_events").select("id,proposal_id,timestamp,actor_id,action,decision,external_disclosure_confirmed,classification,payload").eq("id", recordId).maybeSingle();
    if (!event) notFound();
    return <section className="content"><Link href="/audit" className="text-sm text-primary hover:underline">← Audit</Link><div className="eyebrow mt-5">Audit event · {event.id}</div><h1 className="mt-2 text-3xl font-semibold">{event.action}</h1><div className="panel mt-6 max-w-3xl p-5"><dl className="grid grid-cols-[180px_1fr] gap-y-3 text-sm"><dt className="text-secondary">Time</dt><dd>{event.timestamp}</dd><dt className="text-secondary">Actor</dt><dd>{event.actor_id ?? "Not recorded"}</dd><dt className="text-secondary">Decision</dt><dd>{event.decision}</dd><dt className="text-secondary">Case</dt><dd>{event.proposal_id ?? "Not linked"}</dd><dt className="text-secondary">External disclosure confirmed</dt><dd>{event.external_disclosure_confirmed ? "Yes" : "No"}</dd><dt className="text-secondary">Classification</dt><dd>{event.classification}</dd></dl><pre className="mt-5 whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{JSON.stringify(event.payload, null, 2)}</pre></div></section>;
  }
  notFound();
}
