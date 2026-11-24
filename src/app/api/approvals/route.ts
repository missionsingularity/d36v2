import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceProfile } from "@/lib/auth/context";

const schema = z.object({ target_type: z.literal("document"), target_id: z.string().min(1).max(100), target_version: z.number().int().positive(), reviewer_id: z.string().min(1).max(80), comment: z.string().max(1200).optional() });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide a saved document version and an eligible reviewer." }, { status: 400 });
  const { supabase, profile } = await getWorkspaceProfile();
  if (!supabase || !profile) return NextResponse.json({ error: "A signed-in employee profile is required." }, { status: 401 });
  const { data, error } = await supabase.rpc("create_approval_request", { p_target_type: parsed.data.target_type, p_target_id: parsed.data.target_id, p_target_version: parsed.data.target_version, p_reviewer_id: parsed.data.reviewer_id, p_comment: parsed.data.comment ?? null });
  if (error) return NextResponse.json({ error: "Approval request was denied or could not be completed." }, { status: 403 });
  return NextResponse.json({ approval: data }, { status: 201 });
}
