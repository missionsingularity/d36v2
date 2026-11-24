import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceProfile } from "@/lib/auth/context";

const schema = z.object({ title: z.string().trim().min(1).max(240), assignee_id: z.string().min(1).max(80), case_id: z.string().max(80).nullable().optional(), due_date: z.string().date().nullable().optional() });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the task title, assignee and due date." }, { status: 400 });
  const { supabase, profile } = await getWorkspaceProfile();
  if (!supabase || !profile) return NextResponse.json({ error: "A signed-in employee profile is required." }, { status: 401 });
  const { data, error } = await supabase.rpc("create_task_with_event", { p_title: parsed.data.title, p_assignee_id: parsed.data.assignee_id, p_case_id: parsed.data.case_id ?? null, p_due_date: parsed.data.due_date ?? null });
  if (error) return NextResponse.json({ error: "Task creation was denied or could not be completed." }, { status: 403 });
  return NextResponse.json({ task: data }, { status: 201 });
}
