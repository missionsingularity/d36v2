import { notFound } from "next/navigation";
import { CaseWorkspace } from "@/components/case-workspace";
import { demoAuditEvents, demoPensions, demoSources } from "@/lib/demo/data";

export default async function CasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const record = demoPensions.find((item) => item.id === caseId || item.case_id === caseId);
  if (!record) notFound();
  const sources = demoSources.filter((item) => item.proposal_id === record.id);
  const events = demoAuditEvents.filter((item) => item.proposal_id === record.id);
  return <section className="content"><CaseWorkspace record={record} sources={sources} events={events}/></section>;
}
