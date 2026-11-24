import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceProfile } from "@/lib/auth/context";
import { contentType, exportFormats, generateDocument } from "@/lib/documents/generate";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const formatParsed = z.enum(exportFormats).safeParse(new URL(request.url).searchParams.get("format"));
  if (!formatParsed.success) return NextResponse.json({ error: "Choose DOCX, PDF, XLSX or PPTX." }, { status: 400 });
  const { supabase, profile } = await getWorkspaceProfile();
  if (!supabase || !profile) return NextResponse.json({ error: "A signed-in employee profile is required." }, { status: 401 });
  const { data: document, error: docError } = await supabase.from("documents").select("id,title,current_version,storage_path").eq("id", documentId).maybeSingle();
  if (docError || !document) return NextResponse.json({ error: "Document is not available in your authorized scope." }, { status: 404 });
  const { data: version, error: versionError } = await supabase.from("document_versions").select("version,storage_path").eq("document_id", documentId).eq("version", document.current_version).maybeSingle();
  if (versionError || !version) return NextResponse.json({ error: "The current immutable document version was not found." }, { status: 404 });
  const exportPath = `${profile.employee_id}/exports/${documentId}/v${version.version}.${formatParsed.data}`;
  const existing = await supabase.from("document_exports").select("storage_path,sha256").eq("document_id", documentId).eq("version", version.version).eq("format", formatParsed.data).maybeSingle();
  let bytes: Buffer;
  if (existing.data) {
    const { data, error } = await supabase.storage.from("singularity-documents").download(existing.data.storage_path);
    if (error || !data) return NextResponse.json({ error: "The saved export could not be retrieved." }, { status: 502 });
    bytes = Buffer.from(await data.arrayBuffer());
  } else {
    const { data: source, error: sourceError } = await supabase.storage.from("singularity-documents").download(version.storage_path ?? document.storage_path ?? "");
    if (sourceError || !source) return NextResponse.json({ error: "The source document could not be retrieved." }, { status: 502 });
    bytes = await generateDocument(formatParsed.data, document.title, await source.text());
    const digest = createHash("sha256").update(bytes).digest("hex");
    const { error: metadataError } = await supabase.from("document_exports").insert({ document_id: documentId, version: version.version, format: formatParsed.data, storage_path: exportPath, sha256: digest, created_by: profile.employee_id });
    if (metadataError) return NextResponse.json({ error: "Export metadata could not be saved." }, { status: 500 });
    const exportArrayBuffer = Uint8Array.from(bytes).buffer as ArrayBuffer;
    const { error: uploadError } = await supabase.storage.from("singularity-documents").upload(exportPath, new Blob([exportArrayBuffer], { type: contentType(formatParsed.data) }), { contentType: contentType(formatParsed.data), upsert: false });
    if (uploadError) {
      await supabase.from("document_exports").delete().eq("document_id", documentId).eq("version", version.version).eq("format", formatParsed.data);
      return NextResponse.json({ error: "The generated file could not be saved in private storage." }, { status: 500 });
    }
    await supabase.rpc("write_audit_event", { p_action: `download_${formatParsed.data}`, p_proposal_id: null, p_decision: "allowed", p_external_disclosure_confirmed: false });
  }
  const safeName = document.title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "Singularity-document";
  return new NextResponse(new Uint8Array(bytes), { status: 200, headers: { "Content-Type": contentType(formatParsed.data), "Content-Disposition": `attachment; filename="${safeName}.${formatParsed.data}"`, "Cache-Control": "private, no-store", "Content-Length": String(bytes.byteLength) } });
}
