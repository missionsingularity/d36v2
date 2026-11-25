import { DEMO_STORAGE_KEYS, type DemoConversation, type DemoDraft, type DemoMeeting, type DemoTask } from "./data";

export type SyncState = "local" | "syncing" | "cloud" | "error";
export type PersistenceReceipt = { localPersisted: boolean; cloudPersisted: boolean };
export function persistenceMessage(receipt: PersistenceReceipt) {
  if (receipt.cloudPersisted) return "Saved to this isolated demo workspace.";
  if (receipt.localPersisted) return "Saved on this device only; cloud storage did not confirm it.";
  return "The save failed; no record was confirmed.";
}
let syncState: SyncState = "local";
const collections = ["conversations", "tasks", "drafts", "meetings", "approvals", "audit_events"] as const;
type Collection = (typeof collections)[number];
let sessionReady: Promise<boolean> | null = null;

function setSyncState(next: SyncState, message?: string) {
  syncState = next;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("singularity:sync-status", { detail: { state: next, message } }));
}
export const getSyncState = () => syncState;

function readRaw<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(key) ?? "[]") as T[]; } catch { return []; }
}
function visible<T>(items: T[]) { return items.filter((item) => !(item as { deleted?: boolean }).deleted); }
function read<T>(key: string): T[] { return visible(readRaw<T>(key)); }
function recordId(collection: Collection, item: Record<string, unknown>) {
  return collection === "drafts" ? `${String(item.id)}:v${String(item.version)}` : String(item.id);
}
function updatedAt(item: Record<string, unknown>) { return String(item.updatedAt ?? item.updated_at ?? item.createdAt ?? new Date().toISOString()); }
function storageKey(collection: Collection) { return DEMO_STORAGE_KEYS[collection]; }

function ensureServerSession() {
  sessionReady ??= fetch("/api/demo-workspace/records", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(2500) })
    .then((response) => response.ok)
    .catch(() => false)
    .then((ready) => ready);
  return sessionReady;
}

async function writeCloud(collection: Collection, items: Array<Record<string, unknown>>): Promise<boolean> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) { setSyncState("local"); return false; }
  if (!await ensureServerSession()) { setSyncState("error", "Saved in this browser; private cloud sync is not available."); return false; }
  setSyncState("syncing");
  const records = items.map((item) => ({ record_id: recordId(collection, item), payload: item, updated_at: updatedAt(item) }));
  const response = await fetch("/api/demo-workspace/records", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ collection, records }), signal: AbortSignal.timeout(3500) }).catch(() => null);
  if (!response?.ok) { setSyncState("error", "Saved in this browser; private cloud sync is not available."); return false; }
  const result = await response.json().catch(() => null) as { saved?: number } | null;
  if (result?.saved !== records.length) { setSyncState("error", "Cloud storage did not confirm every workspace record."); return false; }
  setSyncState("cloud");
  return true;
}

function asyncWrite<T extends Record<string, unknown>>(collection: Collection, items: T[]): Promise<PersistenceReceipt> {
  if (typeof window === "undefined") return Promise.resolve({ localPersisted: false, cloudPersisted: false });
  try {
    window.localStorage.setItem(storageKey(collection), JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("singularity:store", { detail: storageKey(collection) }));
    return writeCloud(collection, items).then((cloudPersisted) => ({ localPersisted: true, cloudPersisted }));
  } catch {
    window.dispatchEvent(new CustomEvent("singularity:storage-error", { detail: "Browser storage is full. Export or remove old demonstration records." }));
    return Promise.resolve({ localPersisted: false, cloudPersisted: false });
  }
}

export async function hydrateDemoStore() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) { setSyncState("local"); return; }
  setSyncState("syncing");
  if (!await ensureServerSession()) { setSyncState("error", "Using this browser’s saved data; private cloud sync is not available."); return; }
  const response = await fetch("/api/demo-workspace/records", { credentials: "same-origin", cache: "no-store" }).catch(() => null);
  if (!response?.ok) { setSyncState("error", "Using this browser’s saved data; private cloud sync is not available."); return; }
  const result = await response.json() as { records?: Array<{ collection: Collection; payload: Record<string, unknown> }> };
  const remoteByCollection = new Map<Collection, Array<Record<string, unknown>>>(collections.map((item) => [item, []]));
  for (const row of result.records ?? []) remoteByCollection.get(row.collection)?.push(row.payload);
  for (const collection of collections) {
    const local = readRaw<Record<string, unknown>>(storageKey(collection));
    const remote = remoteByCollection.get(collection) ?? [];
    const merged = new Map<string, Record<string, unknown>>();
    for (const item of [...remote, ...local]) {
      const id = recordId(collection, item);
      const previous = merged.get(id);
      if (!previous || updatedAt(item) >= updatedAt(previous)) merged.set(id, item);
    }
    const all = [...merged.values()];
    window.localStorage.setItem(storageKey(collection), JSON.stringify(all));
  }
  window.dispatchEvent(new CustomEvent("singularity:store"));
  const backfill = await Promise.all(collections.map((collection) => {
    const local = readRaw<Record<string, unknown>>(storageKey(collection));
    return local.length ? writeCloud(collection, local) : Promise.resolve(true);
  }));
  setSyncState(backfill.every(Boolean) ? "cloud" : "error", backfill.every(Boolean) ? undefined : "Some device records are not synced to the workspace.");
}

export const readConversations = () => read<DemoConversation & { deleted?: boolean }>(DEMO_STORAGE_KEYS.conversations);
export const saveConversation = (conversation: DemoConversation) => asyncWrite("conversations", [conversation, ...readConversations().filter((item) => item.id !== conversation.id)].slice(0, 50));
export const deleteConversation = (id: string) => asyncWrite("conversations", readRaw<DemoConversation & { deleted?: boolean }>(DEMO_STORAGE_KEYS.conversations).map((item) => item.id === id ? { ...item, deleted: true, updatedAt: new Date().toISOString() } : item));
export const renameConversation = (id: string, title: string) => asyncWrite("conversations", readConversations().map((item) => item.id === id ? { ...item, title, updatedAt: new Date().toISOString() } : item));
export const readTasks = () => read<DemoTask>(DEMO_STORAGE_KEYS.tasks);
export const saveTask = async (task: DemoTask): Promise<PersistenceReceipt> => combineReceipts(await asyncWrite("tasks", [task, ...readTasks().filter((item) => item.id !== task.id)]), await appendDemoAudit("task_prepared_or_updated", task.id));
export const readDrafts = () => read<DemoDraft>(DEMO_STORAGE_KEYS.drafts);
export const saveDraft = async (draft: DemoDraft): Promise<PersistenceReceipt> => combineReceipts(await asyncWrite("drafts", [draft, ...readDrafts().filter((item) => item.id !== draft.id || item.version !== draft.version)]), await appendDemoAudit("draft_version_saved", `${draft.id}:v${draft.version}`));

export const readMeetings = () => read<DemoMeeting>(DEMO_STORAGE_KEYS.meetings);
export async function saveMeeting(meeting: DemoMeeting): Promise<PersistenceReceipt> {
  return combineReceipts(await asyncWrite("meetings", [meeting, ...readMeetings().filter((item) => item.id !== meeting.id)]), await appendDemoAudit("meeting_prepared", meeting.id));
}

export async function updateMeeting(meeting: DemoMeeting): Promise<PersistenceReceipt> {
  return combineReceipts(await asyncWrite("meetings", readMeetings().map((item) => item.id === meeting.id ? meeting : item)), await appendDemoAudit(`meeting_${meeting.status}`, meeting.id));
}

export async function saveDemoApproval(approval: { id: string; title: string; target_id: string; target_version: number; reviewer_id: string; status: "pending" | "returned" | "approved" | "rejected"; comment: string; createdAt: string }): Promise<PersistenceReceipt> {
  return combineReceipts(await asyncWrite("approvals", [approval, ...readRaw<Record<string, unknown>>(DEMO_STORAGE_KEYS.approvals).filter((item) => item.id !== approval.id)]), await appendDemoAudit("approval_requested", approval.target_id));
}

async function appendDemoAudit(action: string, recordId: string): Promise<PersistenceReceipt> {
  const events = readRaw<Record<string, unknown>>(DEMO_STORAGE_KEYS.audit_events);
  return asyncWrite("audit_events", [{ id: `AUD-DEMO-${crypto.randomUUID()}`, action, record_id: recordId, timestamp: new Date().toISOString(), classification: "training" }, ...events].slice(0, 500));
}

export function recordDemoExport(format: "pdf" | "docx" | "xlsx" | "pptx", recordId: string): Promise<PersistenceReceipt> {
  return appendDemoAudit(`document_export_${format}`, recordId);
}

function combineReceipts(record: PersistenceReceipt, audit: PersistenceReceipt): PersistenceReceipt { return { localPersisted: record.localPersisted && audit.localPersisted, cloudPersisted: record.cloudPersisted && audit.cloudPersisted }; }
