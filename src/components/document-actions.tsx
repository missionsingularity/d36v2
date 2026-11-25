"use client";

import { useState } from "react";
import { FileDown, Send } from "lucide-react";
import { persistenceMessage, saveDemoApproval } from "@/lib/demo/store";

const formats = ["docx", "pdf", "xlsx", "pptx"] as const;
export function DocumentActions({ documentId, version, reviewers }: { documentId: string; version: number; reviewers: { id: string; name: string }[] }) {
  const [reviewer, setReviewer] = useState(reviewers[0]?.id ?? "");
  const [comment, setComment] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    const approval = { id: `APR-${crypto.randomUUID()}`, title: `Review ${documentId} version ${version}`, target_id: documentId, target_version: version, reviewer_id: reviewer, status: "pending" as const, comment, createdAt: new Date().toISOString() };
    try {
      const receipt = await saveDemoApproval(approval);
      setNotice(`${persistenceMessage(receipt)} Version ${version} is a review request, not an official approval.`);
    } catch {
      setNotice("The review request could not be saved.");
    } finally { setBusy(false); }
  }
  return <div className="grid gap-5">
    <div><h2 className="font-semibold">Download this version</h2><div className="mt-3 flex flex-wrap gap-2">{formats.map((format) => <a key={format} className="btn" href={`/api/documents/${encodeURIComponent(documentId)}/download?format=${format}`}><FileDown size={15}/>{format.toUpperCase()}</a>)}</div></div>
    <form onSubmit={submit} className="border-t border-border pt-4"><h2 className="font-semibold">Request human approval</h2><p className="mt-1 text-sm text-secondary">The request is bound to document version {version}.</p><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><select className="field" value={reviewer} onChange={(event) => setReviewer(event.target.value)} required disabled={!reviewers.length}><option value="">Choose reviewer</option>{reviewers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><input className="field" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1200} placeholder="Review instructions"/><button className="btn btn-primary" disabled={busy || !reviewer}><Send size={15}/>Submit</button></div>{notice && <p role="status" className="mt-3 text-sm text-secondary">{notice}</p>}</form>
  </div>;
}
