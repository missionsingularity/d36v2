"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Activity, Archive, BookOpen, BriefcaseBusiness, Building2, CalendarDays, ChartNoAxesCombined, ClipboardList, FileSpreadsheet, Files, FolderKanban, Mail, MessageCircleWarning, NotebookTabs, PanelTop, Search, ShieldCheck, TableProperties, UsersRound, Workflow } from "lucide-react";

const workspace = [
  ["Pensions", "pensions", Building2], ["Grievances", "grievances", MessageCircleWarning], ["Work", "work", BriefcaseBusiness], ["Projects", "projects", FolderKanban],
  ["Documents", "documents", Files], ["Approvals", "approvals", ShieldCheck], ["Knowledge", "knowledge", BookOpen], ["Forms", "forms", ClipboardList],
  ["Analytics", "analytics", ChartNoAxesCombined], ["Meetings", "meetings", CalendarDays], ["Reports", "reports", TableProperties], ["Audit", "audit", Activity],
] as const;
const productivity = [["Google Drive", Files], ["Google Docs", NotebookTabs], ["Google Sheets", FileSpreadsheet], ["Google Slides", PanelTop], ["Microsoft 365", PanelTop], ["Teams", UsersRound], ["SharePoint", Archive], ["Outlook", Mail], ["Slack", MessageCircleWarning], ["Notion", NotebookTabs]] as const;
const government = [["Kritagyata", Building2], ["eOffice", Building2], ["CPGRAMS", MessageCircleWarning], ["NIC Email", Mail], ["Treasury", Building2], ["Service Book", Files]] as const;
const other = [["Local Database", TableProperties], ["File Server", Files], ["Document Archive", Archive], ["Spreadsheet Import", FileSpreadsheet], ["Departmental Software", Workflow]] as const;
type AppItem = { name: string; icon: React.ElementType; href?: string; connected?: boolean; group: string };

function catalog(): AppItem[] {
  return [
    ...workspace.map(([name, slug, icon]) => ({ name, href: `/${slug}`, icon, connected: true, group: "Workspace applications" })),
    ...productivity.map(([name, icon]) => ({ name, icon, group: "Productivity applications" })),
    ...government.map(([name, icon]) => ({ name, icon, group: "Government applications" })),
    ...other.map(([name, icon]) => ({ name, icon, group: "Other applications" })),
  ];
}

export function AppsCatalogue() {
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const items = useMemo(() => catalog(), []);
  const filtered = items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
  const groups = [...new Set(items.map((item) => item.group))];

  async function requestAccess(appName: string) {
    setMessage("");
    try {
      const response = await fetch("/api/connections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ application: appName }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Access request could not be saved.");
      setMessage(`Access request recorded for ${appName}. The external service is not connected yet.`);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Access request could not be saved."); }
  }

  return <>
    <div className="page-heading"><div><div className="eyebrow">Pension & Public Grievances</div><h1>Apps</h1><p className="mt-2 text-sm text-secondary">Department workspaces and applications available to this office.</p></div><label className="relative w-64"><Search className="absolute left-3 top-3.5 text-secondary" size={16}/><input className="field pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an application..." aria-label="Find an application"/></label></div>
    {message && <p role="status" className="mb-4 rounded-lg border border-border bg-slate-50 p-3 text-sm">{message}</p>}
    {groups.map((group) => <section key={group}><h2 className="section-title">{group}</h2><div className="apps-grid">{filtered.filter((item) => item.group === group).map((item) => { const Icon = item.icon; const tile = <><div className="flex items-center justify-between"><Icon aria-hidden="true"/><span className="pill">{item.connected ? "Workspace" : "Not connected"}</span></div><div className="mt-4 font-medium">{item.name}</div>{!item.connected && <div className="mt-2 text-xs text-secondary">Connection not configured</div>}</>;
      return <article key={item.name} className="app-tile">{item.href ? <Link href={item.href} aria-label={`Open ${item.name}`}>{tile}</Link> : <><div>{tile}</div><button className="mt-3 text-xs font-medium text-primary hover:underline" onClick={() => void requestAccess(item.name)}>Request access</button></>}</article>;
    })}</div></section>)}
    {filtered.length === 0 && <div className="panel p-8 text-center text-sm text-secondary">No applications match that search.</div>}
  </>;
}
