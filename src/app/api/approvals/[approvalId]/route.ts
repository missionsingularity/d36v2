import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceProfile } from "@/lib/auth/context";

const schema = z.object({ action: z.enum(["approved", "rejected", "returned"]), comment: z.string().max(1200).optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ approvalId: string }> }) {
  const { approvalId } = await params;
  if (!z.string().uuid().safeParse(approvalId).success) return NextResponse.json({ error: "Approval not found." }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose approve, reject or return." }, { status: 400 });
  const { supabase, profile } = await getWorkspaceProfile();
  if (!supabase || !profile) return NextResponse.json({ error: "A signed-in employee profile is required." }, { status: 401 });
  const { data, error } = await supabase.rpc("decide_approval", { p_approval_id: approvalId, p_action: parsed.data.action, p_comment: parsed.data.comment ?? null });
  if (error) return NextResponse.json({ error: "Approval decision was denied or could not be completed." }, { status: 403 });
  return NextResponse.json({ approval: data });
}
