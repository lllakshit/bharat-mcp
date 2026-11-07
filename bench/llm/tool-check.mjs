#!/usr/bin/env node
// The same 40 questions put to the bharat-mcp tool itself, over a real MCP stdio connection. This measures the tool, not a model:
// if a model calls validate_gstin, this is the answer it gets back.
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const cases = JSON.parse(readFileSync(new URL("./gstin-cases.json", import.meta.url), "utf8")).cases
const client = new Client({ name: "tool-check", version: "0" })
await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../../dist/cli.js", import.meta.url))], stderr: "ignore" }))
const started = performance.now()
let correct = 0
let fakeAccepted = 0
const rows = []
for (const c of cases) {
  const res = JSON.parse((await client.callTool({ name: "validate_gstin", arguments: { gstin: c.gstin } })).content[0].text)
  const answer = res.valid_format ? "VALID" : "INVALID"
  if (answer === c.expected) correct++
  if (c.expected === "INVALID" && answer === "VALID") fakeAccepted++
  rows.push({ gstin: c.gstin, expected: c.expected, answer, reason: res.errors?.[0] })
}
const elapsedMs = performance.now() - started
await client.close()
writeFileSync(new URL("../results/tool-check.json", import.meta.url), JSON.stringify({ correct, total: cases.length, fake_accepted: fakeAccepted, elapsed_ms: Number(elapsedMs.toFixed(1)), rows }, null, 2) + "\n")
console.log(`bharat-mcp validate_gstin over stdio: ${correct}/${cases.length} correct · fake GSTINs accepted ${fakeAccepted}/${cases.filter((c) => c.expected === "INVALID").length} · ${elapsedMs.toFixed(0)} ms for all ${cases.length} calls`)
for (const r of rows.filter((x) => x.expected === "INVALID").slice(0, 3)) console.log(`  e.g. ${r.gstin} → ${r.answer}: ${r.reason}`)
