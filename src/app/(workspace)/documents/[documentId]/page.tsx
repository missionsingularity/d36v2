import { notFound } from "next/navigation";
import { DocumentViewer } from "@/components/document-viewer";
import { demoSources } from "@/lib/demo/data";

export default async function DocumentPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const source = demoSources.find((item) => item.id === documentId);
  if (!source && !documentId.startsWith("LOCAL-")) notFound();
  return <section className="content"><DocumentViewer documentId={documentId} source={source ?? null}/></section>;
}
