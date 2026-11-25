"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, FileText, MessageSquare, Pencil, RotateCcw, Save, Send, Eye } from "lucide-react";
import type { demoSources } from "@/lib/demo/data";
import type { DemoDraft } from "@/lib/demo/data";
import { persistenceMessage, readDrafts, saveDraft, saveDemoApproval } from "@/lib/demo/store";
import { demoPeople } from "@/lib/demo/data";

type SourceRecord = (typeof demoSources)[number];
const extensions = ["pdf", "docx", "xlsx", "pptx"] as const;
export function DocumentViewer({ documentId, source }: { documentId: string; source: SourceRecord | null }) {
  const [drafts, setDrafts] = useState<DemoDraft[]>([]);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState(source?.title ?? "Working document");
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState("");
  const [reviewerId, setReviewerId] = useState(demoPeople.find((person) => ["leadership", "supervisor", "head_of_office"].includes(person.role))?.id ?? "");
  useEffect(() => {
    let cancelled = false;
    const existing = readDrafts().filter((item) => item.id === documentId).sort((a,b) => b.version-a.version);
    queueMicrotask(() => { if (!cancelled) { setDrafts(existing); if (existing[0]) { setTitle(existing[0].title); setContent(existing[0].content); } } });
    if (source) {
      const filename = source.path.split("/").pop();
      void fetch(`/demo-sources/${filename}`).then((response) => response.ok ? response.text() : source.passage).then((text) => { if (!cancelled) { if (!existing[0]) setContent(text); } }).catch(() => { if (!cancelled) { if (!existing[0]) setContent(source.passage); } });
    }
    const sync = () => setDrafts(readDrafts().filter((item) => item.id === documentId).sort((a,b) => b.version-a.version));
    window.addEventListener("singularity:store", sync);
    return () => { cancelled = true; window.removeEventListener("singularity:store", sync); };
  }, [documentId, source]);
  const latest = drafts[0];
  const version = latest?.version ?? 0;
  const originalPath = source ? `/demo-sources/${source.path.split("/").pop()}` : "";

  async function saveRevision(nextContent = content, nextTitle = title, comments = latest?.comments ?? [], status = "draft") {
    const revision: DemoDraft = { id: documentId, title: nextTitle, content: nextContent, version: version + 1, caseId: source?.proposal_id ?? latest?.caseId ?? "PEN-NGN-2026-041", updatedAt: new Date().toISOString(), comments, status };
    const receipt = await saveDraft(revision); setDrafts((items) => [revision, ...items]); setContent(nextContent); setTitle(nextTitle); setEditing(false); setNotice(`${persistenceMessage(receipt)} Version ${revision.version} saved as ${status}. The original source remains unchanged.`); return { revision, receipt };
  }
  function restore(revision: DemoDraft) { void saveRevision(revision.content, title, latest?.comments ?? [], "draft"); }
  function addComment() { if (!comment.trim()) return; void saveRevision(content, title, [...(latest?.comments ?? []), comment.trim()], latest?.status ?? "draft"); setComment(""); }
  async function requestReview() {
    if (!reviewerId) { setNotice("Choose a reviewer before requesting review."); return; }
    const { revision, receipt: documentReceipt } = editing || !latest ? await saveRevision(content, title, latest?.comments ?? [], "draft") : { revision: latest, receipt: { localPersisted: true, cloudPersisted: false } };
    const approval = { id: `APR-${crypto.randomUUID()}`, title: `Review ${revision.title} version ${revision.version}`, target_id: documentId, target_version: revision.version, reviewer_id: reviewerId, status: "pending" as const, comment: "Review requested from the document workspace.", createdAt: new Date().toISOString() };
    const approvalReceipt = await saveDemoApproval(approval);
    const receipt = { localPersisted: documentReceipt.localPersisted && approvalReceipt.localPersisted, cloudPersisted: documentReceipt.cloudPersisted && approvalReceipt.cloudPersisted };
    setNotice(`${persistenceMessage(receipt)} Review request ${approval.id} references version ${revision.version}. This request is not an official approval.`);
  }
  async function exportFile(format: (typeof extensions)[number], showPreview = false) {
    setNotice("");
    try {
      const response = await fetch("/api/demo/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, content, format }) });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error ?? "Document export failed."); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob);
      if (showPreview && format === "pdf") setPreview(url);
      else { const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${title.replace(/[^\w -]/g, "").slice(0,80) || "document"}.${format}`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Document export failed."); }
  }
  const history = useMemo(() => [...drafts].sort((a,b) => b.version-a.version), [drafts]);

  return <><Link href="/documents" className="back-link"><ArrowLeft size={18}/>Back to Documents</Link><div className="document-view-heading"><div><div className="eyebrow">{documentId} {source ? "· Synthetic source" : "· Local working document"}</div><h1>{title}</h1><p>{source ? `${source.logical_location} · Original version ${source.version}` : "Stored in this browser"}</p></div><span className="status-pill">{latest?.status ?? "Source record"}</span></div>
    {notice && <p className="inline-notice" role="status">{notice}</p>}
    <div className="document-toolbar"><button className="btn" onClick={() => { setEditing((value) => !value); if (!editing && !latest) setNotice("You are editing a working copy. The source record cannot be overwritten."); }}><Pencil size={15}/>{editing ? "Stop editing" : "Edit working copy"}</button><button className="btn" onClick={() => void saveRevision()} disabled={!content}><Save size={15}/>Save as new version</button><label className="sr-only" htmlFor="reviewer-select">Select a review officer</label><select id="reviewer-select" className="field max-w-56" value={reviewerId} onChange={(event) => setReviewerId(event.target.value)}><option value="">Choose reviewer</option>{demoPeople.filter((person) => ["leadership", "supervisor", "head_of_office"].includes(person.role)).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><button className="btn" onClick={() => void requestReview()} disabled={!latest && !content}><Send size={15}/>Request human review</button><button className="btn" onClick={() => void exportFile("pdf", true)}><Eye size={15}/>Preview PDF</button><div className="export-menu"><button className="btn"><Download size={15}/>Export</button><div>{extensions.map((format) => <button key={format} onClick={() => void exportFile(format)}>{format.toUpperCase()}</button>)}</div></div>{originalPath && <a className="btn" href={originalPath} target="_blank" rel="noreferrer"><FileText size={15}/>Open original file</a>}</div>
    <div className="document-editor-layout"><div className="document-paper"><div className="document-paper-label"><FileText size={16}/>{editing ? <input aria-label="Working document title" value={title} onChange={(event) => setTitle(event.target.value)}/> : <b>{title}</b>}<span>v{version || source?.version}</span></div>{preview ? <div className="pdf-preview"><div><b>PDF preview</b><button className="btn" onClick={() => { URL.revokeObjectURL(preview); setPreview(""); }}>Close</button></div><iframe src={preview} title="Generated PDF preview"/></div> : editing ? <textarea className="document-text-editor" value={content} onChange={(event) => setContent(event.target.value)} aria-label="Edit working document"/> : <pre className="document-source-text">{content || "Loading source document…"}</pre>}<div className="document-stamp">{source ? "SIMULATED CASE FILE — NOT AN OFFICIAL GOVERNMENT RECORD" : "LOCAL WORKING COPY — NOT AN APPROVED GOVERNMENT DOCUMENT"}</div></div>
      <aside className="document-sidebar"><section className="detail-card"><h2>Source details</h2><dl><dt>Source ID</dt><dd>{source?.id ?? documentId}</dd><dt>Location</dt><dd>{source?.logical_location ?? "Local browser storage"}</dd><dt>Version</dt><dd>{source?.version ?? version}</dd><dt>Linked case</dt><dd>{source?.proposal_id ?? latest?.caseId ?? "Not linked"}</dd><dt>Classification</dt><dd>Synthetic training</dd></dl></section><section className="detail-card"><h2>Version history</h2>{history.length ? history.map((revision) => <div key={revision.version} className="revision-row"><span><b>Version {revision.version}</b><small>{new Date(revision.updatedAt).toLocaleString()}</small></span>{revision.version !== latest?.version && <button title="Restore as a new revision" onClick={() => restore(revision)}><RotateCcw size={15}/></button>}</div>) : <p className="text-sm text-secondary">No working revisions yet.</p>}{source && <div className="revision-row"><span><b>Original version {source.version}</b><small>Immutable source file</small></span></div>}</section><section className="detail-card"><h2><MessageSquare size={16}/>Comments</h2>{latest?.comments.map((item, index) => <p className="document-comment" key={`${index}-${item}`}>{item}</p>)}<textarea className="field mt-3" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a working note" aria-label="Add a comment"/><button className="btn mt-2" onClick={addComment}>Add comment</button></section></aside></div>
  </>;
}
