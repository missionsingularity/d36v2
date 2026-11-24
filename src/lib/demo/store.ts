import { createClient } from "@/lib/supabase/browser";
import { DEMO_STORAGE_KEYS, type DemoConversation, type DemoDraft, type DemoTask } from "./data";

export type SyncState = "local" | "syncing" | "cloud" | "error";
let syncState: SyncState = "local";
const collections = ["conversations", "tasks", "drafts", "meetings"] as const;
type Collection = (typeof collections)[number];

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

async function writeCloud(collection: Collection, items: Array<Record<string, unknown>>) {
  const client = createClient();
  if (!client) { setSyncState("local"); return; }
  setSyncState("syncing");
  const records = items.map((item) => ({ collection, record_id: recordId(collection, item), payload: item, updated_at: updatedAt(item) }));
  const { error } = await client.from("demo_workspace_records").upsert(records, { onConflict: "collection,record_id" });
  if (error) { setSyncState("error", "Saved in this browser; online sync needs the demo database migration."); return; }
  setSyncState("cloud");
}

function write<T extends Record<string, unknown>>(collection: Collection, items: T[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(collection), JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("singularity:store", { detail: storageKey(collection) }));
    void writeCloud(collection, items);
  } catch {
    window.dispatchEvent(new CustomEvent("singularity:storage-error", { detail: "Browser storage is full. Export or remove old demonstration records." }));
  }
}

export async function hydrateDemoStore() {
  const client = createClient();
  if (!client) { setSyncState("local"); return; }
  setSyncState("syncing");
  const result = await client.from("demo_workspace_records").select("collection,record_id,payload,updated_at").in("collection", [...collections]).limit(1000);
  if (result.error) { setSyncState("error", "Using this browser’s saved data; cloud sync is not available."); return; }
  const remoteByCollection = new Map<Collection, Array<Record<string, unknown>>>(collections.map((item) => [item, []]));
  for (const row of result.data ?? []) remoteByCollection.get(row.collection as Collection)?.push(row.payload as Record<string, unknown>);
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
    if (local.length) void writeCloud(collection, local);
  }
  window.dispatchEvent(new CustomEvent("singularity:store"));
  setSyncState("cloud");
}

export const readConversations = () => read<DemoConversation & { deleted?: boolean }>(DEMO_STORAGE_KEYS.conversations);
export const saveConversation = (conversation: DemoConversation) => write("conversations", [conversation, ...readConversations().filter((item) => item.id !== conversation.id)].slice(0, 50));
export const deleteConversation = (id: string) => write("conversations", readRaw<DemoConversation & { deleted?: boolean }>(DEMO_STORAGE_KEYS.conversations).map((item) => item.id === id ? { ...item, deleted: true, updatedAt: new Date().toISOString() } : item));
export const renameConversation = (id: string, title: string) => write("conversations", readConversations().map((item) => item.id === id ? { ...item, title, updatedAt: new Date().toISOString() } : item));
export const readTasks = () => read<DemoTask>(DEMO_STORAGE_KEYS.tasks);
export const saveTask = (task: DemoTask) => write("tasks", [task, ...readTasks().filter((item) => item.id !== task.id)]);
export const readDrafts = () => read<DemoDraft>(DEMO_STORAGE_KEYS.drafts);
export const saveDraft = (draft: DemoDraft) => write("drafts", [draft, ...readDrafts().filter((item) => item.id !== draft.id || item.version !== draft.version)]);

export function saveMeeting(meeting: { id: string; title: string; participants: string; status: string; createdAt: string }) {
  write("meetings", [meeting, ...readRaw<Record<string, unknown>>(DEMO_STORAGE_KEYS.meetings).filter((item) => item.id !== meeting.id)]);
}
