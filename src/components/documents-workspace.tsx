"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FileText, Search, Upload } from "lucide-react";
import type { demoSources } from "@/lib/demo/data";
import type { DemoDraft } from "@/lib/demo/data";
import { readDrafts, saveDraft } from "@/lib/demo/store";

type SourceRecord = (typeof demoSources)[number];
export function DocumentsWorkspace({ sources }: { sources: SourceRecord[] }) {
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<DemoDraft[]>([]);
  const [notice, setNotice] = useState("");
  useEffect(() => { const sync = () => setDrafts(readDrafts()); sync(); window.addEventListener("singularity:store", sync); window.addEventListener("storage", sync); return () => { window.removeEventListener("singularity:store", sync); window.removeEventListener("storage", sync); }; }, []);
  const latestDrafts = useMemo(() => [...new Map([...drafts].sort((a,b) => b.version-a.version).map((item) => [item.id, item])).values()], [drafts]);
  const filtered = sources.filter((source) => `${source.id} ${source.title} ${source.logical_location}`.toLowerCase().includes(query.toLowerCase()));
  async function upload(file?: File) {
    if (!file) return;
    if (!/\.(txt|md|csv)$/i.test(file.name) || file.size > 2_000_000) { setNotice("Choose a TXT, Markdown or CSV document under 2 MB."); return; }
    const id = `LOCAL-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
    saveDraft({ id, title: file.name.replace(/\.[^.]+$/, ""), content: await file.text(), version: 1, caseId: "PEN-NGN-2026-041", updatedAt: new Date().toISOString(), comments: [] });
    setNotice(`${file.name} was added as a local working document. The original file was not changed.`);
  }
  return <><div className="page-heading"><div><div className="eyebrow">Pension & Public Grievances</div><h1>Documents</h1><p className="mt-2 text-sm text-secondary">Source records stay unchanged. Edits are saved as local working revisions.</p></div><label className="btn upload-control"><Upload size={16}/>Upload working copy<input type="file" accept=".txt,.md,.csv,text/plain,text/markdown,text/csv" onChange={(event) => void upload(event.target.files?.[0])}/></label></div>
    {notice && <p role="status" className="inline-notice">{notice}</p>}
    <label className="registry-search"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the source repository" aria-label="Search documents"/></label>
    <div className="panel mt-4 overflow-x-auto"><table className="table"><thead><tr><th>Name</th><th>Type</th><th>Source location</th><th>Version</th><th>Classification</th><th></th></tr></thead><tbody>{filtered.map((source) => <tr key={source.id}><td><Link className="document-name" href={`/documents/${source.id}`}><FileText size={18}/>{source.title}</Link><small className="table-subline">{source.id}</small></td><td>Source record</td><td>{source.logical_location}</td><td>v{source.version}</td><td><span className="pill">Synthetic training</span></td><td><Link className="btn" href={`/documents/${source.id}`}>Open</Link></td></tr>)}{latestDrafts.map((draft) => <tr key={`${draft.id}-${draft.version}`}><td><Link className="document-name" href={`/documents/${encodeURIComponent(draft.id)}`}><FileText size={18}/>{draft.title}</Link><small className="table-subline">Working document</small></td><td>Draft</td><td>Local working copy</td><td>v{draft.version}</td><td><span className="pill">Not approved</span></td><td><Link className="btn" href={`/documents/${encodeURIComponent(draft.id)}`}>Edit</Link></td></tr>)}</tbody></table>{filtered.length === 0 && latestDrafts.length === 0 && <p className="p-6 text-center text-sm text-secondary">No documents match that search.</p>}</div>
    <p className="mt-3 text-xs text-secondary">{filtered.length} immutable source records · {latestDrafts.length} local working documents</p></>;
}
