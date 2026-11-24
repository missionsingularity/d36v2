import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { demoGrievances, demoSources } from "@/lib/demo/data";

export default async function GrievancePage({ params }: { params: Promise<{ grievanceId: string }> }) {
  const { grievanceId } = await params;
  const record = demoGrievances.find((item) => item.id === grievanceId);
  if (!record) notFound();
  const source = demoSources.find((item) => item.id === (record.id === "GRV-AS-2026-01192" ? "DOC-010" : "DOC-012"));
  return <section className="content"><Link href={`/cases/${record.case_id ?? "PEN-NGN-2026-041"}`} className="back-link"><ArrowLeft size={18}/>Back to case</Link><div className="document-view-heading"><div><div className="eyebrow">{record.id}</div><h1>Public grievance record</h1><p>Linked pension proposal {record.case_id}</p></div><span className="status-pill">{record.status}</span></div><div className="detail-card grievance-card"><h2>Grievance timeline</h2><dl><dt>Received</dt><dd>{record.received}</dd><dt>Recorded status</dt><dd>{record.status}</dd><dt>Administrative disposal date</dt><dd>{record.disposed ? "Recorded as disposed" : "Not disposed"}</dd><dt>Action-taken report</dt><dd>{record.atr_date ?? "Not found in record"}</dd><dt>Outcome verified</dt><dd>{record.outcome_verified ? "Verified" : "Not verified in the supplied record"}</dd></dl>{source && <div className="mt-5"><h3 className="font-semibold">Supporting source</h3><Link className="case-source-link" href={`/documents/${source.id}`}><span><b>{source.title}</b><small>{source.logical_location}</small></span></Link></div>}<p className="mt-5 rounded-lg bg-blue-50 p-4 text-sm leading-6 text-slate-700">Administrative disposal is distinct from proof that pension was settled. No grievance status has been changed by viewing this record.</p><span className="pill mt-4">Synthetic training record</span></div></section>;
}
