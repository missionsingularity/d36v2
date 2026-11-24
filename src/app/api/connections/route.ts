import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceProfile } from "@/lib/auth/context";

const allowedApplications = ["Google Drive","Google Docs","Google Sheets","Google Slides","Microsoft 365","Teams","SharePoint","Outlook","Slack","Notion","Kritagyata","eOffice","CPGRAMS","NIC Email","Treasury","Service Book"];
const bodySchema = z.object({ application: z.enum(allowedApplications), purpose: z.string().trim().max(500).optional() });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a supported application." }, { status: 400 });
  const { supabase, profile } = await getWorkspaceProfile();
  if (!supabase || !profile) return NextResponse.json({ error: "A signed-in employee profile is required." }, { status: 401 });
  const { data, error } = await supabase.from("connection_requests").insert({
    application: parsed.data.application,
    purpose: parsed.data.purpose || "Request access to this application for departmental work.",
    requested_by: profile.employee_id,
  }).select("id,application,status,created_at").single();
  if (error) return NextResponse.json({ error: "The access request could not be saved." }, { status: 403 });
  await supabase.rpc("write_audit_event", { p_action: "request_application_access", p_proposal_id: null, p_decision: "allowed", p_external_disclosure_confirmed: false });
  return NextResponse.json({ request: data, notice: "The request is recorded; no external connection has been made." }, { status: 201 });
}
