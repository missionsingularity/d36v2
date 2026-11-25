import { describe, expect, it } from "vitest";
import { executeAssistantTool } from "@/lib/agent/tools";

describe("validated assistant tools", () => {
  it("searches the supplied pension records and returns only manifest citations", () => {
    const result = executeAssistantTool("search_records", { query: "Pranab Kumar Deka", scope: "all", limit: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.related).toContain("PEN-NGN-2026-041");
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations.every((citation) => citation.document_id.startsWith("DOC-"))).toBe(true);
  });

  it("calculates the unresolved cohort from records instead of fixed answer text", () => {
    const result = executeAssistantTool("calculate_backlog", { unresolved_only: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.unresolved).toBe(41);
    expect(result.output.head_of_office).toBe(23);
    expect((result.output.case_ids as string[]).length).toBe(41);
  });

  it("prepares actions only for real records and known officers", () => {
    const badCase = executeAssistantTool("prepare_action", { action: "create_follow_up_task", case_id: "unknown-case", title: "Follow up", description: "Check the record." });
    expect(badCase.ok).toBe(false);

    const prepared = executeAssistantTool("prepare_action", { action: "create_follow_up_task", case_id: "PEN-NGN-2026-041", title: "Verify service", description: "Check the leave sanction order." });
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.action?.kind).toBe("task");
      expect(prepared.output).toMatchObject({ prepared: true, status: "awaiting_officer_save" });
    }
  });

  it("rejects unregistered tools instead of forwarding arbitrary operations", () => {
    const result = executeAssistantTool("run_sql", { sql: "select * from pension_cases" });
    expect(result.ok).toBe(false);
    expect(result.output.error).toBe("This operation is not registered.");
  });
});
