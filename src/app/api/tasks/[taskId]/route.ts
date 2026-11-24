import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceProfile } from "@/lib/auth/context";

const schema = z.object({ status: z.enum(["open", "in_progress", "blocked", "complete", "cancelled"]), detail: z.string().max(500).optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  if (!z.string().uuid().safeParse(taskId).success) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a supported task status." }, { status: 400 });
  const { supabase, profile } = await getWorkspaceProfile();
  if (!supabase || !profile) return NextResponse.json({ error: "A signed-in employee profile is required." }, { status: 401 });
  const { data, error } = await supabase.rpc("update_task_status", { p_task_id: taskId, p_status: parsed.data.status, p_detail: parsed.data.detail ?? null });
  if (error) return NextResponse.json({ error: "Task update was denied or could not be completed." }, { status: 403 });
  return NextResponse.json({ task: data });
}
