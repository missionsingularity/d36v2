export type ActionIntent = { action: "draft_office_note" | "create_follow_up_task" | "prepare_meeting"; title: string; description: string };

export function detectActionIntents(query: string): ActionIntent[] {
  const text = query.trim();
  const lower = text.toLocaleLowerCase();
  const intents: ActionIntent[] = [];
  if (/\b(draft|prepare|write|generate|revise|office note|speaking note|document|report|outline)\b/.test(lower)) intents.push({ action: "draft_office_note", title: "Office note draft", description: text.slice(0, 1200) });
  if (/\b(task|assign|follow[ -]?up)\b/.test(lower)) intents.push({ action: "create_follow_up_task", title: "Follow-up task proposal", description: text.slice(0, 1200) });
  if (/\b(meeting|agenda|schedule|arrange)\b/.test(lower)) intents.push({ action: "prepare_meeting", title: "Review meeting proposal", description: text.slice(0, 1200) });
  return intents;
}

export function detectActionIntent(query: string): ActionIntent | null {
  const intents = detectActionIntents(query);
  return intents.find((intent) => intent.action === "prepare_meeting") ?? intents.find((intent) => intent.action === "draft_office_note") ?? intents[0] ?? null;
}

export function caseReferenceFromContext(query: string, history: Array<{ role: string; content: string }>) {
  const context = [query, ...history.slice(-8).map((message) => message.content)].join("\n");
  const reference = context.match(/\b(?:PEN-[A-Z]+-\d{4}-\d{3,}|SG-PPG-\d{4}-\d{5})\b/i);
  if (reference) return reference[0];
  if (/pranab\s+kumar\s+deka/i.test(context)) return "Pranab Kumar Deka";
  return null;
}
