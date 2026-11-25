import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it } from "vitest";
import { createAssistantMcpServer } from "@/lib/agent/mcp";

describe("Singularity MCP protocol", () => {
  let client: Client | undefined;
  let server: ReturnType<typeof createAssistantMcpServer> | undefined;

  afterEach(async () => {
    await client?.close().catch(() => undefined);
    await server?.close().catch(() => undefined);
    client = undefined;
    server = undefined;
  });

  async function connect() {
    server = createAssistantMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "singularity-mcp-test", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return client;
  }

  it("handshakes, lists registered operations, and retrieves exact fixture citations", async () => {
    const mcp = await connect();
    const listed = await mcp.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "search_records", "get_pension_case", "prepare_action",
    ]));

    const result = await mcp.callTool({
      name: "search_records",
      arguments: { query: "Pranab Kumar Deka", scope: "all", limit: 5 },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ ok: true });
    const execution = result.structuredContent as { related: string[]; citations: Array<{ document_id: string; version: number }> };
    expect(execution.related).toContain("PEN-NGN-2026-041");
    expect(execution.citations.length).toBeGreaterThan(0);
    expect(execution.citations.every((citation) => citation.document_id.startsWith("DOC-") && citation.version > 0)).toBe(true);
  });

  it("lists and reads versioned source and case resources", async () => {
    const mcp = await connect();
    const resources = await mcp.listResources();
    expect(resources.resources.some((item) => item.uri === "singularity://sources/DOC-001?version=1")).toBe(true);
    expect(resources.resources.some((item) => item.uri === "singularity://cases/SG-PPG-2026-00481")).toBe(true);

    const source = await mcp.readResource({ uri: "singularity://sources/DOC-001?version=1" });
    const sourceText = source.contents[0] && "text" in source.contents[0] ? source.contents[0].text : "";
    expect(sourceText).toContain('"id":"DOC-001"');
    const caseRecord = await mcp.readResource({ uri: "singularity://cases/SG-PPG-2026-00481" });
    const caseText = caseRecord.contents[0] && "text" in caseRecord.contents[0] ? caseRecord.contents[0].text : "";
    expect(caseText).toContain("SG-PPG-2026-00481");
  });

  it("returns a protocol error for an unregistered operation", async () => {
    const mcp = await connect();
    await expect(mcp.callTool({ name: "run_sql", arguments: { sql: "select 1" } })).rejects.toThrow("Tool run_sql not found");
  });
});
