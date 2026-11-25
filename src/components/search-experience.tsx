"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, FilePlus2, FolderOpen, Gavel, LoaderCircle, Paperclip, Search, Square, FileText, PencilLine, Download } from "lucide-react";
import type { DemoConversationMessage } from "@/lib/demo/data";
import { DEMO_STORAGE_KEYS, demoPeople } from "@/lib/demo/data";
import { BrandMark } from "@/components/brand-mark";
import { readConversations, saveConversation, saveDraft, saveTask, saveMeeting, readDrafts, recordDemoExport, type PersistenceReceipt } from "@/lib/demo/store";
import type { Language } from "@/lib/demo/i18n";
import type { PreparedAction } from "@/lib/agent/tools";

type Citation = NonNullable<DemoConversationMessage["citations"]>[number];
type ConversationContext = { case_ids: string[]; document_ids: string[]; version_ids: string[]; task_ids: string[]; approval_ids: string[] };
type ActionCardResult = { action: PreparedAction; status: "awaiting_explicit_confirmation"; verified: false; receipt: null };
type Message = DemoConversationMessage & { kind?: "finding" | "draft" | "task" | "meeting"; related?: string[]; action?: PreparedAction; actionResults?: ActionCardResult[]; context?: ConversationContext; attachment?: { name: string; text: string } };
const suggestions = [
  { label: "Check applicable rules", prompt: "Check the applicable rules for Pranab Kumar Deka's pension case.", icon: FileText },
  { label: "Find past precedents", prompt: "Find past precedents related to this pension case.", icon: Gavel },
  { label: "Draft office note", prompt: "Draft a verification request for Pranab Kumar Deka.", icon: PencilLine },
  { label: "View related records", prompt: "Show the related case, grievance and source records for Pranab Kumar Deka.", icon: FolderOpen },
];

export function SearchExperience() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Record<number, "sources" | "related">>({});
  const [attachment, setAttachment] = useState<{ name: string; text: string } | null>(null);
  const [officerName, setOfficerName] = useState("Prabir Borgohain");
  const [responseLanguage, setResponseLanguage] = useState<Language>("en");
  const [actionReceipts, setActionReceipts] = useState<Record<string, { id: string; receipt: PersistenceReceipt }>>({});
  const [exportReceipts, setExportReceipts] = useState<Record<string, { file: string; audit: PersistenceReceipt }>>({});
  const [structuredContext, setStructuredContext] = useState<ConversationContext>({ case_ids: [], document_ids: [], version_ids: [], task_ids: [], approval_ids: [] });
  const textarea = useRef<HTMLTextAreaElement>(null);
  const aborter = useRef<AbortController | null>(null);

  useEffect(() => {
    function restoreFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const caseId = params.get("case");
      if (caseId) { setQuery(`Review pension case ${caseId}`); return; }
      const savedPersona = window.localStorage.getItem(DEMO_STORAGE_KEYS.persona);
      const persona = demoPeople.find((item) => item.id === savedPersona);
      if (persona) setOfficerName(persona.name);
      try { const prefs = JSON.parse(window.localStorage.getItem(DEMO_STORAGE_KEYS.settings) ?? "null"); if (prefs) { setOfficerName(prefs.profile?.name || persona?.name || "Prabir Borgohain"); setResponseLanguage(prefs.responseLanguage ?? "en"); } else if (persona) setOfficerName(persona.name); } catch { /* use English defaults */ }
      const id = params.get("conversation");
      if (!id) return;
      const found = readConversations().find((item) => item.id === id);
      if (found) { const restored = found.messages as Message[]; setConversationId(found.id); setMessages(restored); setStructuredContext(restored.toReversed().find((message) => message.context)?.context ?? { case_ids: [], document_ids: [], version_ids: [], task_ids: [], approval_ids: [] }); setQuery(""); setError(""); }
    }
    const onNew = () => { aborter.current?.abort(); setConversationId(null); setMessages([]); setQuery(""); setError(""); window.history.replaceState(null, "", "/search"); };
    const onOpen = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      const found = readConversations().find((item) => item.id === id);
      if (found) { const restored = found.messages as Message[]; setConversationId(found.id); setMessages(restored); setStructuredContext(restored.toReversed().find((message) => message.context)?.context ?? { case_ids: [], document_ids: [], version_ids: [], task_ids: [], approval_ids: [] }); setQuery(""); setError(""); }
    };
    const onProfile = (event: Event) => { const value = (event as CustomEvent<{ name?: string }>).detail; if (value.name) setOfficerName(value.name); };
    const onSettings = (event: Event) => { const value = (event as CustomEvent<{ responseLanguage?: Language }>).detail; setResponseLanguage(value.responseLanguage ?? "en"); };
    restoreFromUrl();
    window.addEventListener("singularity:new-chat", onNew);
    window.addEventListener("singularity:open-conversation", onOpen);
    window.addEventListener("singularity:profile", onProfile);
    window.addEventListener("singularity:settings", onSettings);
    return () => { window.removeEventListener("singularity:new-chat", onNew); window.removeEventListener("singularity:open-conversation", onOpen); window.removeEventListener("singularity:profile", onProfile); window.removeEventListener("singularity:settings", onSettings); aborter.current?.abort(); };
  }, []);

  async function send(value = query) {
    const text = value.trim();
    if ((!text && !attachment) || busy) return;
    const now = new Date().toISOString();
    const userMessage: Message = { role: "user", content: text || `Review ${attachment?.name}`, ...(attachment ? { attachment } : {}), timestamp: now };
    const previous = messages;
    const withUser = [...previous, userMessage];
    const id = conversationId ?? crypto.randomUUID();
    const title = previous.length ? (readConversations().find((item) => item.id === id)?.title ?? text.slice(0, 54)) : text.slice(0, 54) || `Review ${attachment?.name}`;
    setConversationId(id); setMessages(withUser); setQuery(""); setError(""); setBusy(true); setStreamingAnswer("");
    if (attachment) setAttachment(null);
    const controller = new AbortController(); aborter.current = controller;
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, signal: controller.signal, body: JSON.stringify({ query: text, attachment: attachment ? { name: attachment.name, text: attachment.text } : undefined, conversation_id: id, history: previous.map(({ role, content, attachment }) => ({ role, content, ...(attachment ? { attachment } : {}) })), context: structuredContext, response_language: responseLanguage }) });
      if (!response.ok || !response.body) throw new Error("The request could not be completed.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let result: Record<string, unknown> | null = null;
      while (true) { const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const events = buffer.split("\n\n"); buffer = events.pop() ?? ""; for (const event of events) { const data = event.split("\n").find((line) => line.startsWith("data: "))?.slice(6); if (!data) continue; const parsed = JSON.parse(data) as { phase?: string; message?: string; token?: string; status?: number; body?: Record<string, unknown> }; if (parsed.phase) setError(""); if (parsed.token) setStreamingAnswer((answer) => answer + parsed.token); if (parsed.body) result = parsed.body; if (parsed.status && parsed.status >= 400) throw new Error(String(parsed.body?.error ?? "The request could not be completed.")); } }
      if (!result) throw new Error("The streamed response ended before a result was received.");
      const responseData = result as { answer?: string; language_fallback?: boolean; citations?: Message["citations"]; related?: string[]; kind?: Message["kind"]; action?: PreparedAction; actionResults?: ActionCardResult[]; context?: ConversationContext; table?: Message["table"] };
      const assistant: Message = { role: "assistant", content: responseData.language_fallback ? `${responseData.answer}\n\nThe local evidence response is in English; the requested translation service is not configured.` : responseData.answer ?? "", citations: responseData.citations, related: responseData.related, table: responseData.table, kind: responseData.kind, action: responseData.action, actionResults: responseData.actionResults, context: responseData.context, timestamp: new Date().toISOString() };
      if (assistant.context) setStructuredContext(assistant.context);
      const next = [...withUser, assistant]; setMessages(next);
      saveConversation({ id, title, updatedAt: assistant.timestamp, messages: next });
      window.history.replaceState(null, "", `/search?conversation=${encodeURIComponent(id)}`);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "The request could not be completed.");
    } finally { setBusy(false); setStreamingAnswer(""); aborter.current = null; textarea.current?.focus(); }
  }

  async function attachFile(file?: File) {
    if (!file) return;
    if (!/\.(txt|md|csv)$/i.test(file.name) || file.size > 80_000) { setError("Attach a TXT, Markdown, or CSV file under 80 KB so its full text can be analyzed."); return; }
    setAttachment({ name: file.name, text: await file.text() }); setError("");
  }

  async function saveWorkingDraft(message: Message, index: number, action = message.action, actionIndex = 0) {
    if (!action) { setError("No prepared document is attached to this response. Ask for a draft first."); return; }
    const id = `DRAFT-${conversationId ?? "LOCAL"}-${index}-${actionIndex}`;
    const existing = readDrafts().filter((draft) => draft.id === id).sort((a, b) => b.version - a.version)[0];
    const version = (existing?.version ?? 0) + 1;
    const receipt = await saveDraft({ id, title: action.title || "Singularity working draft", content: message.content, version, caseId: action.case_id, updatedAt: new Date().toISOString(), comments: [] });
    setActionReceipts((items) => ({ ...items, [`${index}-${actionIndex}`]: { id, receipt } }));
  }

  async function createTask(message: Message, index: number, action = message.action, actionIndex = 0) {
    if (!action) { setError("No prepared task is attached to this response. Ask for a task proposal first."); return; }
    const id = `TASK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const receipt = await saveTask({ id, title: action.title, description: action.description, assignee: action.assignee_id, caseId: action.case_id, dueDate: action.due_date ?? "", status: "prepared", createdAt: new Date().toISOString() });
    setActionReceipts((items) => ({ ...items, [`${index}-${actionIndex}`]: { id, receipt } }));
  }

  async function saveProposedMeeting(message: Message, index: number, action = message.action, actionIndex = 0) {
    if (!action) { setError("No meeting proposal is attached to this response."); return; }
    const id = `MTG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const receipt = await saveMeeting({ id, title: action.title, participants: action.description, status: "prepared", createdAt: new Date().toISOString() });
    setActionReceipts((items) => ({ ...items, [`${index}-${actionIndex}`]: { id, receipt } }));
  }

  async function downloadExport(message: Message, index: number, format: "pdf" | "docx" | "xlsx" | "pptx") {
    const key = `${index}-${format}`;
    try {
      const title = message.action?.title || "Singularity workspace response";
      const response = await fetch("/api/demo/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, content: message.content, format }) });
      if (!response.ok) throw new Error("The requested file could not be generated.");
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `singularity-response.${format}`;
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
      const audit = await recordDemoExport(format, `${conversationId ?? "conversation"}:${index}:${format}`);
      setExportReceipts((items) => ({ ...items, [key]: { file: filename, audit } }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The file could not be generated."); }
  }

  const home = messages.length === 0;
  return <div className={`search-workspace ${home ? "search-home" : "search-conversation"}`}>
    {home ? <>
      <div className="welcome-brand"><BrandMark size={108}/><span>Singularity</span></div>
      <h1 className="welcome-title">Welcome, <strong>{officerName}</strong></h1>
      <Composer query={query} setQuery={setQuery} onSubmit={() => void send()} busy={busy} onStop={() => aborter.current?.abort()} attachment={attachment?.name} onAttach={attachFile} inputRef={textarea} home/>
      <div className="home-suggestions">{suggestions.map(({ label, prompt, icon: Icon }) => <button key={label} className="home-suggestion" onClick={() => void send(prompt)}><Icon size={20}/><span>{label}</span></button>)}</div>
      <div className="wave-decoration" aria-hidden="true"><svg viewBox="0 0 1440 240" preserveAspectRatio="none"><path d="M0,120 C260,145 375,205 640,183 C930,159 1134,40 1440,62 L1440,240 L0,240Z" fill="#e2f0ff"/><path d="M0,154 C270,160 412,232 704,208 C984,185 1186,104 1440,100 L1440,240 L0,240Z" fill="#d4e9ff"/></svg></div>
    </> : <>
      <div className="conversation-scroll" aria-live="polite">{messages.map((message, index) => <article key={`${message.timestamp}-${index}`} className={`message-row ${message.role}`}>
        {message.role === "assistant" && <span className="assistant-mark"><BrandMark size={34}/></span>}
        {message.role === "user" ? <div className="user-bubble">{message.content}{message.attachment && <small className="attachment-chip"><Paperclip size={13}/>{message.attachment.name}</small>}</div> : <div className="assistant-panel"><div className="assistant-answer">{message.content.split(/\n/).map((line, lineIndex) => <p key={lineIndex}>{line.replaceAll("**", "")}</p>)}</div>
          {message.table && <div className="record-table-wrap"><table className="record-table"><caption>{message.table.caption}</caption><thead><tr>{message.table.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{message.table.rows.map((row, rowIndex) => <tr key={rowIndex}>{message.table!.columns.map((column) => <td key={column.key}>{String(row[column.key] ?? "—")}</td>)}</tr>)}</tbody></table></div>}
          {(message.citations?.length || message.related?.length) ? <><div className="response-tabs"><button className={activeTab[index] !== "related" ? "selected" : ""} onClick={() => setActiveTab((s) => ({ ...s, [index]: "sources" }))}>Sources{message.citations?.length ? ` (${message.citations.length})` : ""}</button><button className={activeTab[index] === "related" ? "selected" : ""} onClick={() => setActiveTab((s) => ({ ...s, [index]: "related" }))}>Related{message.related?.length ? ` (${message.related.length})` : ""}</button></div>
            {activeTab[index] === "related" ? <div className="source-list">{message.related?.map((item) => <Link key={item} href={relatedHref(item)} className="source-item"><FolderOpen size={18}/><span><b>{item}</b><small>Open related record</small></span><ArrowRight size={16}/></Link>)}</div> : <div className="source-list">{message.citations?.map((citation) => <SourceItem key={`${citation.document_id}-${citation.version}`} citation={citation}/>)}</div>}</> : null}
          {(message.actionResults?.length ? message.actionResults.map((item) => item.action) : message.action ? [message.action] : []).map((action, actionIndex) => <div className="response-actions" key={`${action.kind}-${action.case_id}-${actionIndex}`}>
            {action.kind === "draft" && <button className="btn" onClick={() => void saveWorkingDraft(message, index, action, actionIndex)}>Save working draft</button>}
            {action.kind === "task" && <button className="btn btn-primary" onClick={() => void createTask(message, index, action, actionIndex)}>Save task proposal</button>}
            {action.kind === "meeting" && <button className="btn" onClick={() => void saveProposedMeeting(message, index, action, actionIndex)}>Save meeting proposal</button>}
            <span>{action.title} · {action.kind === "draft" ? "Saving does not submit or approve it." : action.kind === "meeting" ? "No invitation is sent." : "This records a proposed task in the isolated workspace."}</span>
            {actionReceipts[`${index}-${actionIndex}`] && <p role="status" className="inline-notice mt-3">{receiptMessage(actionReceipts[`${index}-${actionIndex}`]!.receipt)} <Link className="text-primary underline" href={actionLink(action.kind, actionReceipts[`${index}-${actionIndex}`]!.id)}>Open saved record</Link>{action.kind === "draft" ? ` · Version ${readDrafts().find((item) => item.id === actionReceipts[`${index}-${actionIndex}`]!.id)?.version ?? 1}` : ""}</p>}
          </div>)}
          <div className="response-actions export-actions"><Download size={16}/>{(["pdf", "docx", "xlsx", "pptx"] as const).map((format) => <button className="btn" key={format} onClick={() => void downloadExport(message, index, format)}>Download {format.toUpperCase()}</button>)}
            {Object.entries(exportReceipts).filter(([key]) => key.startsWith(`${index}-`)).map(([key, receipt]) => <small role="status" key={key}>{receipt.file} downloaded; {receipt.audit.cloudPersisted ? "audit event confirmed in cloud" : "audit event is local only"}.</small>)}
          </div>
        </div>}
      </article>)}{busy && <div className="assistant-loading"><LoaderCircle className="spin" size={18}/>{streamingAnswer || "Searching linked records…"}</div>}{error && <p role="status" className="inline-notice">{error}</p>}</div>
      <Composer query={query} setQuery={setQuery} onSubmit={() => void send()} busy={busy} onStop={() => aborter.current?.abort()} attachment={attachment?.name} onAttach={attachFile} inputRef={textarea} />
    </>}
    {error && home && <p role="status" className="inline-notice home-notice">{error}</p>}
  </div>;
}

function receiptMessage(receipt: PersistenceReceipt) {
  if (receipt.cloudPersisted) return "Saved to this isolated demo workspace.";
  if (receipt.localPersisted) return "Saved on this device only. Cloud storage did not confirm the save.";
  return "The save failed. No record was confirmed.";
}

function actionLink(kind: Message["kind"], id: string) {
  if (kind === "task") return "/work";
  if (kind === "meeting") return "/calendar";
  return `/documents/${encodeURIComponent(id)}`;
}

function relatedHref(id: string) { if (id.startsWith("GRV-")) return `/grievances/${encodeURIComponent(id)}`; if (id.startsWith("DOC-")) return `/documents/${encodeURIComponent(id)}`; if (id.startsWith("AUD-")) return "/logs"; return `/cases/${encodeURIComponent(id)}`; }

function SourceItem({ citation }: { citation: Citation }) {
  return <Link className="source-item" href={`/documents/${encodeURIComponent(citation.document_id)}?version=${citation.version}`}><FileText size={20}/><span><b>{citation.title}</b><small>{citation.section} · Version {citation.version}</small></span><span className="source-view">View</span></Link>;
}

function Composer({ query, setQuery, onSubmit, busy, onStop, attachment, onAttach, inputRef, home = false }: { query: string; setQuery: (value: string) => void; onSubmit: () => void; busy: boolean; onStop: () => void; attachment?: string; onAttach: (file?: File) => void; inputRef: React.RefObject<HTMLTextAreaElement | null>; home?: boolean }) {
  return <form className={`composer-shell ${home ? "composer-home" : "composer-followup"}`} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    <Search className="composer-search-icon" size={25}/><textarea ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSubmit(); } }} placeholder={home ? "Ask a question..." : "Ask a follow-up..."} aria-label={home ? "Ask a question" : "Ask a follow-up"} rows={1}/>
    {attachment && <span className="attachment-chip"><Paperclip size={14}/>{attachment}</span>}
    <label className="attach-button" title="Attach TXT, Markdown or CSV, up to 80 KB"><FilePlus2 size={19}/><input type="file" accept=".txt,.md,.csv,text/plain,text/csv,text/markdown" onChange={(event) => onAttach(event.target.files?.[0])} /></label>
    {busy ? <button className="send-button stop-button" type="button" onClick={onStop} aria-label="Stop generation"><Square size={16}/></button> : <button className="send-button" type="submit" disabled={!query.trim() && !attachment} aria-label="Send"><ArrowRight size={25}/></button>}
  </form>;
}
