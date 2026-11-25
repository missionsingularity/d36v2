import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import {
  assistantFunctionDeclarations,
  assistantToolInputSchemas,
  type ToolExecution,
} from "@/lib/agent/tools";
import { executeDatabaseAssistantTool } from "@/lib/agent/database-tools";
import { demoPensions, demoSources } from "@/lib/demo/data";

function textResult(execution: ToolExecution) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(execution) }],
    structuredContent: execution,
  };
}

export function createAssistantMcpServer() {
  const server = new McpServer({ name: "singularity-departmental-workspace", version: "1.0.0" });

  for (const definition of assistantFunctionDeclarations) {
    const name = definition.name;
    if (!name || !(name in assistantToolInputSchemas)) continue;
    const toolName = name as keyof typeof assistantToolInputSchemas;
    const inputSchema = assistantToolInputSchemas[toolName];
    server.registerTool(toolName, {
      description: definition.description ?? "Registered Singularity workspace operation.",
      inputSchema,
    }, async (args: unknown) => textResult(await executeDatabaseAssistantTool(toolName, args)));
  }

  for (const source of demoSources) {
    const uri = `singularity://sources/${encodeURIComponent(source.id)}?version=${source.version}`;
    server.registerResource(`source-${source.id}`, uri, {
      title: source.title,
      description: `${source.logical_location} · ${source.classification} source, version ${source.version}`,
      mimeType: "application/json",
    }, async (requestedUri) => ({
      contents: [{ uri: requestedUri.href, text: JSON.stringify(source) }],
    }));
  }

  for (const record of demoPensions) {
    const id = record.case_id ?? record.id;
    const uri = `singularity://cases/${encodeURIComponent(id)}`;
    server.registerResource(`case-${record.id}`, uri, {
      title: `Pension case ${id}`,
      description: `Synthetic training case for ${record.pensioner_name}`,
      mimeType: "application/json",
    }, async (requestedUri) => ({
      contents: [{ uri: requestedUri.href, text: JSON.stringify(record) }],
    }));
  }

  return server;
}

export async function connectAssistantMcp() {
  const server = createAssistantMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "singularity-chat", version: "1.0.0" });
  await server.connect(serverTransport);
  try {
    await client.connect(clientTransport);
  } catch (error) {
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    throw error;
  }
  return {
    client,
    async close() {
      await client.close();
      await server.close();
    },
  };
}

export async function callAssistantMcpTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolExecution> {
  const result = await client.callTool({ name, arguments: args });
  const execution = result.structuredContent as ToolExecution | undefined;
  if (execution && typeof execution === "object" && "ok" in execution && "output" in execution) return execution;
  const message = result.content.find((part) => part.type === "text")?.text;
  return {
    ok: false,
    output: { error: result.isError ? message ?? "The registered MCP operation failed." : "The MCP operation returned no structured result." },
    citations: [],
    related: [],
  };
}
