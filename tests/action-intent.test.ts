import { describe, expect, it } from "vitest";
import { caseReferenceFromContext, detectActionIntent, detectActionIntents } from "@/lib/agent/action-intent";

describe("five demo follow-up action intents", () => {
  it.each([
    ["Prepare a verification note for the missing service order.", "draft_office_note"],
    ["Prepare a follow-up draft for review.", "draft_office_note"],
    ["Create the Secretary report outline.", "draft_office_note"],
    ["Assign a review task based on the recorded events.", "create_follow_up_task"],
    ["Prepare a review meeting agenda.", "prepare_meeting"],
  ] as const)("detects a validated operation for %s", (query, action) => {
    expect(detectActionIntent(query)?.action).toBe(action);
  });

  it("uses a case reference only when it appears in the current conversation", () => {
    expect(caseReferenceFromContext("Prepare a note", [{ role: "assistant", content: "PEN-NGN-2026-041 is awaiting verification." }])).toBe("PEN-NGN-2026-041");
    expect(caseReferenceFromContext("Prepare a note", [])).toBeNull();
  });

  it("preserves three requested preparations as separate actions", () => {
    expect(detectActionIntents("Draft an office note, create a follow-up task, and prepare a review meeting agenda.").map((item) => item.action))
      .toEqual(["draft_office_note", "create_follow_up_task", "prepare_meeting"]);
  });
});
