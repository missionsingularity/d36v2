import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import pptxgen from "pptxgenjs";

export type ExportFormat = "docx" | "pdf" | "xlsx" | "pptx";
export const exportFormats: ExportFormat[] = ["docx", "pdf", "xlsx", "pptx"];
const safe = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").trim();
const pdfText = (value: string) => safe(value.normalize("NFKD")).replace(/[^\x20-\x7e]/g, " ");

export async function generateDocument(format: ExportFormat, title: string, markdown: string): Promise<Buffer> {
  const lines = safe(markdown).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (format === "docx") {
    const children = [new Paragraph({ text: safe(title), heading: HeadingLevel.TITLE }), ...lines.map((line) => new Paragraph({ children: [new TextRun(line.replace(/^#+\s*/, ""))] }))];
    return Buffer.from(await Packer.toBuffer(new Document({ sections: [{ children }] })));
  }
  if (format === "pdf") {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    let page = document.addPage([612, 792]);
    let y = 744;
    page.drawText(pdfText(title).slice(0, 105), { x: 52, y, size: 18, font: bold, color: rgb(0.09, 0.1, 0.16) });
    y -= 34;
    for (const sourceLine of lines) {
      const line = pdfText(sourceLine.replace(/^#+\s*/, ""));
      const chunks = line.match(/.{1,92}(?:\s|$)|\S+/g) ?? [line];
      for (const chunk of chunks) {
        if (y < 54) { page = document.addPage([612, 792]); y = 744; }
        page.drawText(chunk.slice(0, 100), { x: 52, y, size: 10, font, color: rgb(0.15, 0.17, 0.2) });
        y -= 16;
      }
      y -= 3;
    }
    return Buffer.from(await document.save());
  }
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Singularity";
    const sheet = workbook.addWorksheet("Document");
    sheet.columns = [{ header: "Section", key: "section", width: 34 }, { header: "Content", key: "content", width: 100 }];
    sheet.addRow({ section: "Document title", content: safe(title) });
    sheet.addRows(lines.map((line) => { const split = line.indexOf(":"); return split > 0 ? { section: line.slice(0, split).replace(/^#+\s*/, ""), content: line.slice(split + 1).trim() } : { section: "", content: line.replace(/^#+\s*/, "") }; }));
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5143E8" } };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  const presentation = new pptxgen();
  presentation.layout = "LAYOUT_WIDE";
  presentation.author = "Singularity";
  presentation.subject = "Department workspace draft";
  const titleSlide = presentation.addSlide();
  titleSlide.background = { color: "FFFFFF" };
  titleSlide.addText(safe(title), { x: 0.8, y: 0.8, w: 11.8, h: 1, fontFace: "Arial", fontSize: 28, bold: true, color: "17191D" });
  titleSlide.addText("Pension & Public Grievances · Assam", { x: 0.8, y: 2, w: 11.8, h: 0.45, fontSize: 16, color: "5143E8" });
  for (let start = 0; start < lines.length; start += 7) {
    const slide = presentation.addSlide();
    slide.addText(safe(title), { x: 0.6, y: 0.35, w: 12, h: 0.4, fontSize: 18, bold: true, color: "17191D" });
    slide.addText(lines.slice(start, start + 7).map((line) => `• ${safe(line.replace(/^#+\s*/, ""))}`).join("\n"), { x: 0.8, y: 1.1, w: 11.5, h: 5.8, fontSize: 16, breakLine: false, color: "334155", valign: "top", paraSpaceAfter: 12, fit: "shrink" });
  }
  const output = await presentation.write({ outputType: "nodebuffer" });
  if (output instanceof Blob) return Buffer.from(await output.arrayBuffer());
  if (output instanceof ArrayBuffer) return Buffer.from(new Uint8Array(output));
  return Buffer.from(output as Uint8Array);
}

export function contentType(format: ExportFormat) {
  return ({ docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" })[format];
}
