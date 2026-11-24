import { CasesRegistry } from "@/components/cases-registry";
import { demoPensions } from "@/lib/demo/data";

export default function CasesPage() {
  return <section className="content"><div className="page-heading"><div><div className="eyebrow">Pension & Public Grievances</div><h1>Cases</h1><p className="mt-2 text-sm text-secondary">Search the supplied pension casebook and open a case workspace.</p></div><span className="pill">{demoPensions.length} synthetic records</span></div><CasesRegistry records={demoPensions}/></section>;
}
