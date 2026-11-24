"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { demoPensions } from "@/lib/demo/data";

type CaseRecord = (typeof demoPensions)[number];
export function CasesRegistry({ records }: { records: CaseRecord[] }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => records.filter((record) => `${record.id} ${record.case_id} ${record.pensioner_name} ${record.district} ${record.issue ?? ""} ${record.stage}`.toLowerCase().includes(query.toLowerCase())).slice(0, 100), [records, query]);
  return <>
    <label className="registry-search"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by pensioner, case ID, district or issue" aria-label="Search cases"/></label>
    <div className="panel mt-4 overflow-x-auto"><table className="table"><thead><tr><th>Case</th><th>Pensioner</th><th>District</th><th>Issue</th><th>Workflow stage</th><th>Status</th></tr></thead><tbody>{shown.map((record) => <tr key={record.id}><td><Link className="text-primary hover:underline" href={`/cases/${encodeURIComponent(record.id)}`}>{record.id}</Link><div className="text-xs text-secondary">{record.case_id}</div></td><td>{record.pensioner_name}</td><td>{record.district}</td><td>{(record.issue ?? "unspecified").replaceAll("_", " ")}</td><td>{record.stage.replaceAll("_", " ")}</td><td><span className="status-pill">{record.unresolved ? "In progress" : "Recorded"}</span></td></tr>)}</tbody></table>{shown.length === 0 && <p className="p-7 text-center text-sm text-secondary">No cases match that search.</p>}</div>
    <p className="mt-3 text-xs text-secondary">Showing {shown.length} of {records.length} records · Synthetic training data</p>
  </>;
}
