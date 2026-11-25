import { describe, expect, it } from "vitest";
import { backlogRequestArguments, isRetryableGeminiError } from "./route";

describe("chat reliability helpers", () => {
  it("limits an ordinary backlog answer while preserving district scope", () => {
    expect(backlogRequestArguments("How many unresolved pension cases are in Nalbari district?")).toEqual({
      district: "Nalbari", unresolved_only: true, page: 1, page_size: 30,
    });
  });

  it("allows a bounded full record list when requested", () => {
    expect(backlogRequestArguments("List all unresolved pension cases")).toEqual({
      unresolved_only: true, page: 1, page_size: 100,
    });
  });

  it("retries transient capacity failures, not permanent request failures", () => {
    expect(isRetryableGeminiError(new Error("503 UNAVAILABLE: high demand"))).toBe(true);
    expect(isRetryableGeminiError(new Error("400 INVALID_ARGUMENT"))).toBe(false);
  });
});
