import { NextResponse } from "next/server";
import { z } from "zod";
import { contentType, generateDocument, type ExportFormat } from "@/lib/documents/generate";

const schema = z.object({ title: z.string().trim().min(1).max(180), content: z.string().min(1).max(500_000), format: z.enum(["docx", "pdf", "xlsx", "pptx"]) });
const extensionTypes: Record<ExportFormat, string> = { docx: "docx", pdf: "pdf", xlsx: "xlsx", pptx: "pptx" };
export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a supported file format and provide a document under 500 KB." }, { status: 400 });
  try {
    const { title, content, format } = parsed.data;
    const file = await generateDocument(format, title, content);
    const safeName = title.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 90) || "Singularity document";
    return new NextResponse(new Uint8Array(file), { headers: { "content-type": contentType(format), "content-disposition": `attachment; filename="${safeName}.${extensionTypes[format]}"`, "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "This document could not be generated in the selected file format." }, { status: 500 });
  }
}
