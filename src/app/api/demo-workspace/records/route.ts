import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createTrainingClient } from "@/lib/supabase/training";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cookieName = "singularity_demo_session";
const collections = ["conversations", "tasks", "drafts", "meetings", "approvals", "audit_events"] as const;
const writeSchema = z.object({
  collection: z.enum(collections),
  records: z.array(z.object({
    record_id: z.string().min(1).max(220),
    payload: z.record(z.string(), z.unknown()),
    updated_at: z.string().datetime().optional(),
  })).max(500),
});

function getSession(request: Request) {
  const current = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const session = current && /^[A-Za-z0-9_-]{40,60}$/.test(current) ? current : randomBytes(32).toString("base64url");
  return { session, needsCookie: session !== current };
}

function attachSessionCookie(response: NextResponse, session: string, needsCookie: boolean) {
  if (needsCookie) response.cookies.set(cookieName, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  return response;
}


function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function unavailable(response?: NextResponse, message = "Cloud workspace sync is not configured.") {
  // Keep the newly issued, opaque demo-session cookie even when the database is
  // unavailable. Otherwise a retry can silently start under a different ID.
  return NextResponse.json({ error: message }, { status: 503, headers: response?.headers });
}

export async function GET(request: Request) {
  const { session, needsCookie } = getSession(request);
  const db = createTrainingClient(session);
  if (!db) return attachSessionCookie(unavailable(), session, needsCookie);
  const { data, error } = await db.from("demo_workspace_records")
    .select("collection,record_id,payload,updated_at")
    .eq("session_id", session)
    .in("collection", [...collections])
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (error) { console.error("[demo-workspace] read failed", error.code, error.message); return attachSessionCookie(unavailable(undefined, "Cloud workspace records could not be loaded."), session, needsCookie); }
  return attachSessionCookie(NextResponse.json({ records: data ?? [] }), session, needsCookie);
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1_500_000) return NextResponse.json({ error: "Workspace update is too large." }, { status: 413 });
  const rawBody = await request.text().catch(() => "");
  if (rawBody.length > 1_500_000) return NextResponse.json({ error: "Workspace update is too large." }, { status: 413 });
  let body: unknown = null;
  try { body = rawBody ? JSON.parse(rawBody) : null; } catch { return NextResponse.json({ error: "Workspace record payload is invalid." }, { status: 400 }); }
  const parsed = writeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Workspace record payload is invalid." }, { status: 400 });
  if (parsed.data.records.some((record) => JSON.stringify(record.payload).length > 100_000)) return NextResponse.json({ error: "A workspace record is too large." }, { status: 413 });
  const { session, needsCookie } = getSession(request);
  const db = createTrainingClient(session);
  if (!db) return attachSessionCookie(unavailable(), session, needsCookie);
  const rows = parsed.data.records.map((record) => ({
    session_id: session,
    classification: "workspace",
    collection: parsed.data.collection,
    record_id: record.record_id,
    payload: record.payload,
    updated_at: record.updated_at ?? new Date().toISOString(),
  }));
  if (rows.length) {
    const { error } = await db.from("demo_workspace_records").upsert(rows, { onConflict: "session_id,collection,record_id" });
    if (error) { console.error("[demo-workspace] write failed", error.code, error.message); return attachSessionCookie(unavailable(undefined, "Cloud workspace records could not be saved."), session, needsCookie); }
  }
  const ids = rows.map((row) => row.record_id);
  const { data: persisted, error: verifyError } = ids.length
    ? await db.from("demo_workspace_records").select("record_id,payload,updated_at").eq("session_id", session).eq("collection", parsed.data.collection).in("record_id", ids)
    : { data: [], error: null };
  if (verifyError || (persisted ?? []).length !== rows.length) return attachSessionCookie(unavailable(undefined, "The database did not confirm every workspace record."), session, needsCookie);
  const verified = (persisted ?? []).every((row) => {
    const expected = rows.find((candidate) => candidate.record_id === row.record_id);
    return Boolean(expected && JSON.stringify(row.payload) === JSON.stringify(expected.payload));
  });
  if (!verified) return attachSessionCookie(unavailable(undefined, "The stored workspace values did not match the submitted records."), session, needsCookie);
  const receipts = (persisted ?? []).map((row) => ({ record_id: row.record_id, collection: parsed.data.collection, updated_at: row.updated_at, verified: true }));
  return attachSessionCookie(NextResponse.json({ saved: receipts.length, verified: true, receipts }), session, needsCookie);
}
