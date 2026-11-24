import { DocumentsWorkspace } from "@/components/documents-workspace";
import { demoSources } from "@/lib/demo/data";

export default function DocumentsPage() {
  return <section className="content"><DocumentsWorkspace sources={demoSources}/></section>;
}
