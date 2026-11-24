"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowUpRight, FileText, MoreHorizontal, Sparkles } from "lucide-react";
import type { demoAuditEvents, demoPensions, demoSources } from "@/lib/demo/data";

type CaseRecord = (typeof demoPensions)[number];
type SourceRecord = (typeof demoSources)[number];
type AuditRecord = (typeof demoAuditEvents)[number];
const tabs = ["Overview", "Precedents", "Rules", "Documents", "Activity", "Audit Log"] as const;

export function CaseWorkspace({ record, sources, events }: { record: CaseRecord; sources: SourceRecord[]; events: AuditRecord[] }) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const claimedMonths = record.claimed_service_months ?? 0;
  const verifiedMonths = record.verified_record_service_months ?? 0;
  const serviceDifference = claimedMonths - verifiedMonths;
  return <>
    <div className="case-back"><Link href="/cases"><ArrowLeft size={19}/>Back to Cases</Link></div>
    <header className="case-header"><div className="case-file-icon"><FileText size={31}/></div><div className="case-title"><div className="eyebrow">{record.case_id ?? record.id}</div><h1>{record.pensioner_name}</h1><p>{record.department} · {record.district} · {record.designation}</p><div className="case-tags"><span>Personnel</span><span>Pension</span><span>{record.district}</span><span className="status-pill">{record.stage.replaceAll("_", " ")}</span></div></div><div className="case-header-actions"><Link className="btn" href={`/workflows?case=${encodeURIComponent(record.id)}`}>View in Workflow <ArrowUpRight size={15}/></Link><details className="case-more"><summary aria-label="More case actions"><MoreHorizontal size={18}/></summary><Link href={`/search?case=${encodeURIComponent(record.id)}`}>Ask Singularity</Link></details></div></header>
    <div className="case-panel">
      <div className="case-tabs" role="tablist" aria-label="Case details">{tabs.map((name) => <button role="tab" aria-selected={tab === name} className={tab === name ? "selected" : ""} key={name} onClick={() => setTab(name)}>{name}</button>)}</div>
      {tab === "Overview" && <div className="case-overview-grid"><div className="case-main-column"><section className="detail-card"><h2>Case Summary</h2><dl><dt>Employee name</dt><dd>{record.pensioner_name}</dd><dt>Case ID</dt><dd>{record.case_id}</dd><dt>Department</dt><dd>{record.department}</dd><dt>District office</dt><dd>{record.office_id}</dd><dt>Retirement date</dt><dd>{record.retirement_date}</dd><dt>Current stage</dt><dd>{record.stage.replaceAll("_", " ")}</dd><dt>Issue</dt><dd>{(record.issue ?? "unspecified").replaceAll("_", " ")}</dd><dt>Claimed service</dt><dd>{Math.floor(claimedMonths / 12)} years, {claimedMonths % 12} months</dd><dt>Verified in record</dt><dd>{Math.floor(verifiedMonths / 12)} years, {verifiedMonths % 12} months</dd><dt>Difference</dt><dd>{serviceDifference} months · unresolved</dd><dt>Leave sanction order</dt><dd>{record.leave_sanction_order_available ? "Present" : "Not available in supplied records"}</dd><dt>Payment status</dt><dd>{(record.payment_status ?? "not established").replaceAll("_", " ")}</dd></dl></section>
        <section className="detail-card"><h2>Relevant Records</h2>{sources.slice(0, 5).map((source) => <Link className="case-source-link" key={source.id} href={`/documents/${source.id}`}><FileText size={19}/><span><b>{source.title}</b><small>{source.logical_location}</small></span><ArrowUpRight size={15}/></Link>)}</section></div>
        <aside className="case-side-column"><section className="recommend-card"><h2><Sparkles size={18}/>Review notes</h2><ul><li>Verify the six-month qualifying-service discrepancy.</li><li>Obtain the 2004 leave sanction order.</li><li>Confirm forwarding and settlement evidence.</li></ul><Link className="btn btn-primary" href={`/search?case=${encodeURIComponent(record.id)}`}>Review evidence <ArrowUpRight size={16}/></Link><small>Evidence review only · not an eligibility decision</small></section><section className="detail-card"><h2>Next Steps</h2><ol className="next-steps"><li>Verify service records</li><li>Draft verification request</li><li>Submit for human review</li></ol></section></aside></div>}
      {tab === "Documents" && <div className="case-tab-content"><div className="page-heading"><div><h2>Documents ({sources.length})</h2><p>Source records linked to this pension proposal.</p></div><Link href="/documents" className="btn">Open repository</Link></div><div className="case-doc-table">{sources.map((source) => <Link className="case-source-link" key={source.id} href={`/documents/${source.id}`}><FileText size={21}/><span><b>{source.title}</b><small>{source.logical_location} · v{source.version}</small></span><span className="source-view">View</span></Link>)}</div></div>}
      {(tab === "Activity" || tab === "Audit Log") && <div className="case-tab-content"><div className="page-heading"><div><h2>{tab}</h2><p>Recorded case events from the supplied synthetic audit dataset.</p></div></div><div className="audit-timeline">{events.map((event) => <article key={event.id}><span className="timeline-dot"/><div><b>{event.action.replaceAll("_", " ")}</b><p>{event.decision}{event.external_disclosure_confirmed ? " · external disclosure confirmed in source record" : ""}</p><small>{event.timestamp} · {event.actor_id}</small></div></article>)}</div></div>}
      {(tab === "Rules" || tab === "Precedents") && <div className="case-tab-content"><h2>{tab}</h2><p className="text-sm text-secondary">No verified {tab.toLowerCase()} are linked to this case in the supplied source manifest. Review the indexed case evidence and verify current authority before relying on a legal provision.</p><div className="mt-4">{sources.filter((source) => /clarification|service|leave|proposal/i.test(source.title)).map((source) => <Link className="case-source-link" key={source.id} href={`/documents/${source.id}`}><FileText size={18}/><span><b>{source.title}</b><small>{source.logical_location}</small></span></Link>)}</div></div>}
    </div>
  </>;
}
