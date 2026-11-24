import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { answerFromDemoRecords } from "@/lib/demo/answer";

export const runtime = "nodejs";
export const maxDuration = 45;

const requestSchema = z.object({
  query: z.string().trim().min(1).max(4000),
  conversation_id: z.string().uuid().nullable().optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(20).optional(),
  response_language: z.enum(["en", "as", "hi"]).optional(),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a question up to 4,000 characters." }, { status: 400 });
  const { query, history = [], conversation_id, response_language = "en" } = parsed.data;
  const grounded = answerFromDemoRecords(query, history);
  let answer = grounded.answer;
  let service = "local";

  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
        contents: `Recent conversation context: ${JSON.stringify(history.slice(-8))}\nCurrent request: ${query}\nRetrieved synthetic training records and exact citations: ${JSON.stringify(grounded)}`,
        config: {
          systemInstruction: `You are Singularity, a departmental demonstration workspace. Answer in ${response_language === "as" ? "Assamese" : response_language === "hi" ? "Hindi" : "English"}. Answer only from the supplied fictional training evidence. Do not infer legal eligibility, invent citations, or claim official activity. Preserve uncertainty and distinguish a prepared action from an approved or executed action. Preserve original legal references and official wording.`,
          maxOutputTokens: 1200,
        },
      });
      if (response.text?.trim()) { answer = response.text; service = "assisted"; }
    } catch {
      answer = `${answer}\n\nShowing the evidence-grounded response because the optional writing service is unavailable.`;
    }
  }

  return NextResponse.json({
    conversation_id: conversation_id ?? crypto.randomUUID(),
    answer,
    citations: grounded.citations,
    related: grounded.related,
    kind: grounded.kind,
    stages: ["Search", "Context", "Act"],
    persistence: "local-first",
    service,
    language: service === "assisted" ? response_language : "en",
    language_fallback: service !== "assisted" && response_language !== "en",
  });
}
