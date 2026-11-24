"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, FilePlus2, FolderOpen, Gavel, LoaderCircle, Paperclip, Search, Square, FileText, PencilLine } from "lucide-react";
import type { DemoConversationMessage } from "@/lib/demo/data";
import { DEMO_STORAGE_KEYS, demoOfficer, demoPeople } from "@/lib/demo/data";
import { BrandMark } from "@/components/brand-mark";
import { readConversations, saveConversation, saveDraft, saveTask, saveMeeting } from "@/lib/demo/store";
import type { Language } from "@/lib/demo/i18n";

type Citation = NonNullable<DemoConversationMessage["citations"]>[number];
type Message = DemoConversationMessage & { kind?: "finding" | "draft" | "task" | "meeting"; related?: string[] };
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
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Record<number, "sources" | "related">>({});
  const [attachment, setAttachment] = useState<{ name: string; text: string } | null>(null);
  const [officerName, setOfficerName] = useState("Prabir Borgohain");
  const [responseLanguage, setResponseLanguage] = useState<Language>("en");
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
      if (found) { setConversationId(found.id); setMessages(found.messages as Message[]); setQuery(""); setError(""); }
    }
    const onNew = () => { aborter.current?.abort(); setConversationId(null); setMessages([]); setQuery(""); setError(""); window.history.replaceState(null, "", "/search"); };
    const onOpen = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      const found = readConversations().find((item) => item.id === id);
      if (found) { setConversationId(found.id); setMessages(found.messages as Message[]); setQuery(""); setError(""); }
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
    const userText = attachment ? `${text || "Review this attachment"}\n\nAttached text file: ${attachment.name}\n${attachment.text}` : text;
    const now = new Date().toISOString();
    const userMessage: Message = { role: "user", content: text || `Review ${attachment?.name}`, timestamp: now };
    const previous = messages;
    const withUser = [...previous, userMessage];
    const id = conversationId ?? crypto.randomUUID();
    const title = previous.length ? (readConversations().find((item) => item.id === id)?.title ?? text.slice(0, 54)) : text.slice(0, 54) || `Review ${attachment?.name}`;
    setConversationId(id); setMessages(withUser); setQuery(""); setError(""); setBusy(true);
    if (attachment) setAttachment(null);
    const controller = new AbortController(); aborter.current = controller;
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ query: userText, conversation_id: id, history: previous.map(({ role, content }) => ({ role, content })), response_language: responseLanguage }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The request could not be completed.");
      const assistant: Message = { role: "assistant", content: result.language_fallback ? `${result.answer}\n\nThe local evidence response is in English; the requested translation service is not configured.` : result.answer, citations: result.citations, related: result.related, kind: result.kind, timestamp: new Date().toISOString() };
      const next = [...withUser, assistant]; setMessages(next);
      saveConversation({ id, title, updatedAt: assistant.timestamp, messages: next });
      window.history.replaceState(null, "", `/search?conversation=${encodeURIComponent(id)}`);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "The request could not be completed.");
    } finally { setBusy(false); aborter.current = null; textarea.current?.focus(); }
  }

  async function attachFile(file?: File) {
    if (!file) return;
    if (!/\.(txt|md|csv)$/i.test(file.name) || file.size > 2_000_000) { setError("Attach a TXT, Markdown, or CSV file under 2 MB."); return; }
    setAttachment({ name: file.name, text: await file.text() }); setError("");
  }

  function saveWorkingDraft(message: Message, index: number) {
    const id = `DRAFT-${conversationId ?? "LOCAL"}-${index}`;
    saveDraft({ id, title: message.content.startsWith("**") ? message.content.split("\n")[0]!.replaceAll("*", "") : "Singularity working draft", content: message.content, version: 1, caseId: "PEN-NGN-2026-041", updatedAt: new Date().toISOString(), comments: [] });
    setError("Draft saved in this browser. It has not been submitted or approved.");
  }

  function createTask() {
    const id = `TASK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    saveTask({ id, title: `Follow up on ${"PEN-NGN-2026-041"}`, description: "Verify the leave sanction order and reconcile qualifying service.", assignee: demoOfficer.id, caseId: "PEN-NGN-2026-041", dueDate: "", status: "prepared", createdAt: new Date().toISOString() });
    setError("Task saved in this browser as Prepared. It has not been assigned or completed.");
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
        {message.role === "user" ? <div className="user-bubble">{message.content}</div> : <div className="assistant-panel"><div className="assistant-answer">{message.content.split(/\n/).map((line, lineIndex) => <p key={lineIndex}>{line.replaceAll("**", "")}</p>)}</div>
          {(message.citations?.length || message.related?.length) ? <><div className="response-tabs"><button className={activeTab[index] !== "related" ? "selected" : ""} onClick={() => setActiveTab((s) => ({ ...s, [index]: "sources" }))}>Sources{message.citations?.length ? ` (${message.citations.length})` : ""}</button><button className={activeTab[index] === "related" ? "selected" : ""} onClick={() => setActiveTab((s) => ({ ...s, [index]: "related" }))}>Related{message.related?.length ? ` (${message.related.length})` : ""}</button></div>
            {activeTab[index] === "related" ? <div className="source-list">{message.related?.map((item) => <Link key={item} href={relatedHref(item)} className="source-item"><FolderOpen size={18}/><span><b>{item}</b><small>Open related record</small></span><ArrowRight size={16}/></Link>)}</div> : <div className="source-list">{message.citations?.map((citation) => <SourceItem key={`${citation.document_id}-${citation.version}`} citation={citation}/>)}</div>}</> : null}
          {message.kind === "draft" && <div className="response-actions"><button className="btn" onClick={() => saveWorkingDraft(message, index)}>Save working draft</button><span>Not submitted for approval</span></div>}
          {message.kind === "task" && <div className="response-actions"><button className="btn btn-primary" onClick={createTask}>Prepare follow-up task</button></div>}
          {message.kind === "meeting" && <div className="response-actions"><button className="btn" onClick={() => { saveMeeting({ id: `MTG-${Date.now()}`, title: "Pension review meeting", participants: "Pension Section, Head of Office", status: "prepared", createdAt: new Date().toISOString() }); setError("Meeting saved as Prepared. No invitation was sent."); }}>Save meeting record</button></div>}
        </div>}
      </article>)}{busy && <div className="assistant-loading"><LoaderCircle className="spin" size={18}/>Searching linked records…</div>}{error && <p role="status" className="inline-notice">{error}</p>}</div>
      <Composer query={query} setQuery={setQuery} onSubmit={() => void send()} busy={busy} onStop={() => aborter.current?.abort()} attachment={attachment?.name} onAttach={attachFile} inputRef={textarea} />
    </>}
    {error && home && <p role="status" className="inline-notice home-notice">{error}</p>}
  </div>;
}

function relatedHref(id: string) { if (id.startsWith("GRV-")) return `/grievances/${encodeURIComponent(id)}`; if (id.startsWith("DOC-")) return `/documents/${encodeURIComponent(id)}`; if (id.startsWith("AUD-")) return "/logs"; return `/cases/${encodeURIComponent(id)}`; }

function SourceItem({ citation }: { citation: Citation }) {
  return <Link className="source-item" href={`/documents/${encodeURIComponent(citation.document_id)}?version=${citation.version}`}><FileText size={20}/><span><b>{citation.title}</b><small>{citation.section} · Version {citation.version}</small></span><span className="source-view">View</span></Link>;
}

function Composer({ query, setQuery, onSubmit, busy, onStop, attachment, onAttach, inputRef, home = false }: { query: string; setQuery: (value: string) => void; onSubmit: () => void; busy: boolean; onStop: () => void; attachment?: string; onAttach: (file?: File) => void; inputRef: React.RefObject<HTMLTextAreaElement | null>; home?: boolean }) {
  return <form className={`composer-shell ${home ? "composer-home" : "composer-followup"}`} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    <Search className="composer-search-icon" size={25}/><textarea ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSubmit(); } }} placeholder={home ? "Ask a question..." : "Ask a follow-up..."} aria-label={home ? "Ask a question" : "Ask a follow-up"} rows={1}/>
    {attachment && <span className="attachment-chip"><Paperclip size={14}/>{attachment}</span>}
    <label className="attach-button" title="Attach TXT, Markdown or CSV"><FilePlus2 size={19}/><input type="file" accept=".txt,.md,.csv,text/plain,text/csv,text/markdown" onChange={(event) => onAttach(event.target.files?.[0])} /></label>
    {busy ? <button className="send-button stop-button" type="button" onClick={onStop} aria-label="Stop generation"><Square size={16}/></button> : <button className="send-button" type="submit" disabled={!query.trim() && !attachment} aria-label="Send"><ArrowRight size={25}/></button>}
  </form>;
}
