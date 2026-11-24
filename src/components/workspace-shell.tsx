"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, ChevronDown, CircleHelp, FileText, Layers3, MessageSquare, MoreHorizontal, Pencil, Plus, Search, SlidersHorizontal, Trash2, Workflow } from "lucide-react";
import type { WorkspaceProfile } from "@/lib/auth/context";
import { demoPeople, DEMO_STORAGE_KEYS, type DemoConversation } from "@/lib/demo/data";
import { BrandMark } from "@/components/brand-mark";
import { deleteConversation, hydrateDemoStore, readConversations, renameConversation, type SyncState } from "@/lib/demo/store";
import { translate, type Language } from "@/lib/demo/i18n";

const navigation = [
  { href: "/search", label: "New chat", icon: MessageSquare, newChat: true },
  { href: "/search", label: "Search", icon: Search },
  { href: "/cases", label: "Cases", icon: Layers3 },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/workflows", label: "Workflows", icon: Workflow },
  { href: "/logs", label: "Logs", icon: SlidersHorizontal },
];

export function WorkspaceShell({ profile, children }: { profile: WorkspaceProfile; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [conversations, setConversations] = useState<DemoConversation[]>([]);
  const [selectedProfile, setSelectedProfile] = useState(profile);
  const [storageNotice, setStorageNotice] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("local");
  const [language, setLanguage] = useState<Language>("en");
  const [profilePhoto, setProfilePhoto] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const sync = () => setConversations(readConversations());
    const savedProfile = window.localStorage.getItem(DEMO_STORAGE_KEYS.persona);
    const persona = demoPeople.find((item) => item.id === savedProfile);
    if (persona) requestAnimationFrame(() => setSelectedProfile({ employee_id: persona.id, name: persona.name, designation: persona.designation, office_id: persona.office_id, role: persona.role }));
    requestAnimationFrame(() => { try { const prefs = JSON.parse(window.localStorage.getItem(DEMO_STORAGE_KEYS.settings) ?? "null"); if (prefs) { if (prefs.language) setLanguage(prefs.language); if (prefs.profile?.name) setSelectedProfile((old) => ({ ...old, ...prefs.profile })); if (prefs.profile?.photo) setProfilePhoto(prefs.profile.photo); document.documentElement.dataset.theme = prefs.appearance ?? "light"; document.documentElement.lang = prefs.language ?? "en"; } } catch { /* keep defaults */ } });
    sync();
    window.addEventListener("singularity:store", sync);
    window.addEventListener("storage", sync);
    const onError = (event: Event) => setStorageNotice((event as CustomEvent<string>).detail);
    window.addEventListener("singularity:storage-error", onError);
    const onSyncStatus = (event: Event) => setSyncState((event as CustomEvent<{ state: SyncState }>).detail.state);
    const onSettings = (event: Event) => { const prefs = (event as CustomEvent<{ language?: Language; appearance?: string; profile?: { name?: string; designation?: string; department?: string; photo?: string } }>).detail; setLanguage(prefs.language ?? "en"); setSelectedProfile((old) => ({ ...old, ...prefs.profile })); setProfilePhoto(prefs.profile?.photo ?? ""); document.documentElement.dataset.theme = prefs.appearance ?? "light"; document.documentElement.lang = prefs.language ?? "en"; };
    const onProfile = (event: Event) => { const value = (event as CustomEvent<{ name?: string; designation?: string; department?: string; photo?: string }>).detail; setSelectedProfile((old) => ({ ...old, ...value })); setProfilePhoto(value.photo ?? ""); };
    window.addEventListener("singularity:sync-status", onSyncStatus);
    window.addEventListener("singularity:settings", onSettings);
    window.addEventListener("singularity:profile", onProfile);
    requestAnimationFrame(() => void hydrateDemoStore());
    return () => { window.removeEventListener("singularity:store", sync); window.removeEventListener("storage", sync); window.removeEventListener("singularity:storage-error", onError); window.removeEventListener("singularity:sync-status", onSyncStatus); window.removeEventListener("singularity:settings", onSettings); window.removeEventListener("singularity:profile", onProfile); };
  }, []);

  function startChat() {
    window.dispatchEvent(new CustomEvent("singularity:new-chat"));
    router.push("/search");
  }

  function openConversation(id: string) {
    window.dispatchEvent(new CustomEvent("singularity:open-conversation", { detail: id }));
    router.push(`/search?conversation=${encodeURIComponent(id)}`);
  }

  function changePersona(id: string) {
    window.localStorage.setItem(DEMO_STORAGE_KEYS.persona, id);
    const person = demoPeople.find((item) => item.id === id);
    if (person) setSelectedProfile({ employee_id: person.id, name: person.name, designation: person.designation, office_id: person.office_id, role: person.role });
  }

  const section = pathname === "/search" ? "Search" : navigation.find((item) => item.href === pathname)?.label ?? ({ "/cases": "Cases", "/documents": "Documents", "/workflows": "Workflows", "/logs": "Logs" } as Record<string, string>)[pathname] ?? "Workspace";
  const recent = [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12);

  return <div className="workspace">
    <header className="government-header">
      <Link href="/search" className="header-brand" aria-label="Singularity home"><BrandMark size={40}/><span>Singularity</span></Link>
      <div className="government-title"><span>Government of Assam</span><small>Pension & Public Grievances</small></div>
      <div className="header-actions"><span className="prototype-label">Prototype</span><button className="icon-button" aria-label="Notifications" title="Notifications" onClick={() => router.push("/settings?section=notifications")}><Bell size={20}/></button><button className="icon-button" aria-label="Help" title="Help" onClick={() => router.push("/settings?section=setup")}><CircleHelp size={20}/></button>
        <details className="profile-menu"><summary className="profile-select"><span className="avatar">{profilePhoto ? <Image src={profilePhoto} width={42} height={42} unoptimized alt=""/> : selectedProfile.name.split(/\s+/).slice(0,2).map((part) => part[0]).join("")}</span><span className="profile-select-text"><b>{selectedProfile.name}</b><small>{selectedProfile.designation}</small></span><ChevronDown size={16}/></summary><div className="profile-menu-items"><Link href="/settings?section=profile">{translate(language, "profile.myProfile")}</Link><Link href="/settings">{translate(language, "profile.settings")}</Link><Link href="/settings?section=language-and-region">{translate(language, "profile.language")}</Link><Link href="/settings?section=appearance">{translate(language, "profile.appearance")}</Link><Link href="/settings?section=setup">{translate(language, "profile.help")}</Link><label>Demonstration persona<select aria-label="Select demonstration persona" value={selectedProfile.employee_id} onChange={(event) => changePersona(event.target.value)}><option value="DEMO-PB">Prabir Borgohain — Deputy Secretary</option>{demoPeople.map((person) => <option key={person.id} value={person.id}>{person.name} — {person.designation}</option>)}</select></label></div></details>
      </div>
    </header>
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <button className="sidebar-collapse" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? "›" : "‹"}</button>
      <nav className="nav" aria-label="Main navigation">{navigation.map(({ href, label, icon: Icon, newChat }) => { const key = ({ "New chat": "nav.newChat", Search: "nav.search", Cases: "nav.cases", Documents: "nav.documents", Workflows: "nav.workflows", Logs: "nav.logs" } as const)[label]!; const text = translate(language, key); return <button key={label} onClick={newChat ? startChat : () => router.push(href)} aria-label={text} title={collapsed ? text : undefined} aria-current={(!newChat && href !== "/search" && pathname === href) || (newChat && pathname === "/search") ? "page" : undefined} className={`nav-link ${((!newChat && href !== "/search" && pathname === href) || (newChat && pathname === "/search")) ? "active" : ""}`}><Icon aria-hidden="true"/><span>{text}</span>{newChat && <Pencil className="nav-pencil" size={17}/>}</button>; })}</nav>
      <div className="recent-heading"><span>{translate(language, "nav.recent")}</span><button aria-label={translate(language, "nav.newChat")} title={translate(language, "nav.newChat")} onClick={startChat}><Plus size={16}/></button></div>
      <div className="recent-list">{recent.length ? recent.map((conversation) => <div className="recent-row" key={conversation.id}><button className="recent-open" onClick={() => openConversation(conversation.id)}><MessageSquare size={16}/><span><b>{conversation.title || "New conversation"}</b><small>{relativeDate(conversation.updatedAt)}</small></span></button><details className="recent-menu"><summary aria-label="Conversation options"><MoreHorizontal size={16}/></summary><div><button onClick={() => { const title = window.prompt("Rename this conversation", conversation.title); if (title?.trim()) renameConversation(conversation.id, title.trim()); }}>Rename</button><button onClick={() => deleteConversation(conversation.id)}><Trash2 size={13}/>Delete chat</button></div></details></div>) : <p className="recent-empty">Your recent conversations will appear here.</p>}</div>
      <div className="sidebar-bottom"><span className={`sync-dot ${syncState}`}/><span>{syncState === "cloud" ? "Synced to demo workspace" : syncState === "syncing" ? "Syncing demo records…" : syncState === "error" ? "Local mode · sync unavailable" : "Local demonstration mode"}</span><small>{storageNotice || (syncState === "cloud" ? "Fictional changes are shared in this demo project" : "Changes stay in this browser until demo cloud sync is configured")}</small><span className="training-label">Synthetic training data</span></div>
    </aside>
    <main className="main"><div className="section-bar"><span>{section}</span><span className="section-path">Search · Context · Act</span></div>{children}</main>
  </div>;
}

function relativeDate(value: string) { const date = new Date(value); if (new Date().toDateString() === date.toDateString()) return "Today"; return date.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
