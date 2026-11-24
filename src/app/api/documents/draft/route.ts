import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceProfile } from "@/lib/auth/context";

export const runtime = "nodejs";
const schema = z.object({ case_id: z.string().min(1).max(80), kind: z.enum(["office_note", "case_summary"]).default("office_note") });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide an accessible pension case." }, { status: 400 });
  const { supabase, profile } = await getWorkspaceProfile();
  if (!supabase || !profile) return NextResponse.json({ error: "A signed-in employee profile is required." }, { status: 401 });
  const { data: record, error: caseError } = await supabase.from("pension_cases").select("id,district,department,stage,issue,unresolved,late_objection,visible_before_retirement,payload,version").eq("id", parsed.data.case_id).maybeSingle();
  if (caseError || !record) return NextResponse.json({ error: "Case was not found in your authorized scope." }, { status: 404 });
  const { data: sources, error: sourceError } = await supabase.from("documents").select("id,title,current_version,source_location,document_passages(section,passage)").eq("case_id", record.id).limit(12);
  if (sourceError) return NextResponse.json({ error: "Authorized source records could not be retrieved." }, { status: 403 });
  const payload = record.payload as Record<string, unknown>;
  const title = `${parsed.data.kind === "office_note" ? "Office note" : "Case summary"} - ${String(payload.pensioner_name ?? record.id)}`;
  const allFacts: [string, unknown][] = [
    ["Proposal ID", record.id], ["Pensioner", payload.pensioner_name], ["District", record.district], ["Department", record.department],
    ["Recorded issue", record.issue.replaceAll("_", " ")], ["Recorded stage", record.stage.replaceAll("_", " ")], ["Registry unresolved", record.unresolved],
    ["Appointment date", payload.appointment_date], ["Retirement date", payload.retirement_date], ["Claimed service months", payload.claimed_service_months],
    ["Verified service months", payload.verified_record_service_months], ["Leave sanction order available", payload.leave_sanction_order_available],
    ["E-file reference", payload.efile], ["PPO status", payload.ppo_status], ["Payment status", payload.payment_status],
  ];
  const facts = allFacts.filter(([, value]) => value !== undefined && value !== null && value !== "");
  const sourceLines = (sources ?? []).flatMap((source) => (source.document_passages as { section: string; passage: string }[]).map((passage) => `- ${source.id}, ${source.title}, version ${source.current_version}, ${passage.section}: “${passage.passage}”`));
  const content = [
    `# ${title}`, "", "Working draft based on authorized workspace records. Verify the original departmental file and applicable rules before any official action.", "",
    "## Recorded case information", ...facts.map(([label, value]) => `- ${label}: ${String(value)}`), "",
    "## Evidence reviewed", ...(sourceLines.length ? sourceLines : ["- No linked source passages were available in this authorized view."]), "",
    "## Items requiring officer verification", "- Confirm the source documents, applicable service rules, calculations, and competent-authority review before issue.",
    "", "Classification: synthetic training record.",
  ].join("\n");
  const documentId = randomUUID();
  const storagePath = `${profile.employee_id}/documents/${documentId}/v1.md`;
  const { error: insertError } = await supabase.from("documents").insert({ id: documentId, title, current_version: 1, case_id: record.id, created_by: profile.employee_id, classification: "training", storage_path: storagePath, source_location: `Draft from ${record.id}` });
  if (insertError) return NextResponse.json({ error: "The document draft could not be recorded." }, { status: 403 });
  const { error: uploadError } = await supabase.storage.from("singularity-documents").upload(storagePath, new Blob([content], { type: "text/markdown; charset=utf-8" }), { contentType: "text/markdown; charset=utf-8", upsert: false });
  if (uploadError) {
    await supabase.from("documents").delete().eq("id", documentId);
    return NextResponse.json({ error: "The document could not be saved to private storage." }, { status: 500 });
  }
  const { error: versionError } = await supabase.from("document_versions").insert({ document_id: documentId, version: 1, storage_path: storagePath, created_by: profile.employee_id, immutable: true });
  if (versionError) {
    await supabase.storage.from("singularity-documents").remove([storagePath]);
    await supabase.from("documents").delete().eq("id", documentId);
    return NextResponse.json({ error: "The immutable document version could not be recorded." }, { status: 500 });
  }
  await supabase.rpc("write_audit_event", { p_action: "create_document_draft", p_proposal_id: record.id, p_decision: "allowed", p_external_disclosure_confirmed: false });
  return NextResponse.json({ document: { id: documentId, title, version: 1, status: "draft" }, notice: "Saved as a versioned working draft. No official action has been performed." }, { status: 201 });
}
