#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createServer } from "./server.js"

async function main() {
  const server = createServer()
  await server.connect(new StdioServerTransport())
  // stdout carries the protocol, so anything for humans goes to stderr.
  console.error("bharat-mcp is running on stdio (8 offline tools).")
}

main().catch((error) => {
  console.error("bharat-mcp failed to start:", error)
  process.exit(1)
})
