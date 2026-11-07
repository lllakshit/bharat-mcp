import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { tools } from "./tools/index.js"
import { VERSION } from "./version.js"

export function createServer() {
  const server = new McpServer({ name: "bharat-mcp", version: VERSION })
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      },
      // The tool list is a union, so the typed `run` is called through a cast here and checked by the SDK's own validation.
      async (args: unknown) => {
        const result = (tool.run as (input: unknown) => unknown)(args)
        // A tool signals bad input by returning only an `error` message; mark it so clients do not read it as success.
        const failed = typeof result === "object" && result !== null && Object.keys(result).length === 1 && "error" in result
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], ...(failed ? { isError: true } : {}) }
      },
    )
  }
  return server
}
