#!/usr/bin/env node
// Compare an Ollama model on the same GSTIN cases, with and without bharat-mcp.
// Requires a running Ollama server and a model with tool-calling support.
//   node bench/llm/ollama.mjs --model qwen3:8b
//   node bench/llm/ollama.mjs --model qwen3:8b --arm with
//   node bench/llm/ollama.mjs --model test --mock
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const args = Object.fromEntries(process.argv.slice(2).reduce((out, token, i, all) =>
  token.startsWith("--") ? [...out, [token.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? "true" : all[i + 1]]] : out, []))
const model = args.model ?? ""
if (!model) throw new Error("Pass --model <ollama-model-name>")
const host = (args.host ?? process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/$/, "")
const arms = args.arm === "with" || args.arm === "without" ? [args.arm] : ["without", "with"]
const limit = Number(args.limit ?? 0)
const root = fileURLToPath(new URL("../../", import.meta.url))
const cases = JSON.parse(readFileSync(new URL("./gstin-cases.json", import.meta.url), "utf8")).cases.slice(0, limit || undefined)
const prompt = (gstin) => `Is this GSTIN valid? ${gstin}\nAnswer on the first line with exactly VALID or INVALID, then give one short reason.`
const parseVerdict = (text) => {
  const match = /\b(INVALID|VALID)\b/i.exec(String(text ?? "").trim().split("\n")[0].replace(/[*_`]/g, ""))
  return match ? match[1].toUpperCase() : "UNPARSED"
}
const summarise = (rows) => ({
  total: rows.length,
  correct: rows.filter((r) => r.correct).length,
  fake_accepted: rows.filter((r) => r.expected === "INVALID" && r.answer === "VALID").length,
  fakes: rows.filter((r) => r.expected === "INVALID").length,
  real_rejected: rows.filter((r) => r.expected === "VALID" && r.answer === "INVALID").length,
  reals: rows.filter((r) => r.expected === "VALID").length,
  unparsed: rows.filter((r) => r.answer === "UNPARSED").length,
  tool_use_rate: rows.length ? rows.filter((r) => r.used_tool).length / rows.length : 0,
})

let mcpClient
let ollamaTools = []
async function connectTools() {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js")
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js")
  const { createServer } = await import(join(root, "dist/server.js"))
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  mcpClient = new Client({ name: "bharat-ollama-benchmark", version: "0.1.0" })
  await createServer().connect(serverTransport)
  await mcpClient.connect(clientTransport)
  ollamaTools = (await mcpClient.listTools()).tools.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  }))
}

async function askOllama(arm, gstin) {
  const messages = [{ role: "user", content: prompt(gstin) }]
  let usedTool = false
  for (let turn = 0; turn < 6; turn++) {
    const response = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, stream: false, messages, ...(arm === "with" ? { tools: ollamaTools } : {}) }),
    })
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
    const body = await response.json()
    const message = body.message ?? {}
    const calls = message.tool_calls ?? []
    if (!calls.length) return { text: message.content ?? "", used_tool: usedTool, turns: turn + 1 }
    usedTool = true
    messages.push(message)
    for (const call of calls) {
      const name = call.function?.name
      const input = call.function?.arguments ?? {}
      if (!mcpClient || !ollamaTools.some((t) => t.function.name === name)) {
        messages.push({ role: "tool", content: `Unknown tool: ${name}` })
        continue
      }
      const result = await mcpClient.callTool({ name, arguments: input })
      messages.push({ role: "tool", content: result.content?.map((part) => part.text ?? "").join("\n") ?? "" })
    }
  }
  return { text: "", used_tool: usedTool, error: "Exceeded six tool-call turns" }
}

// Harness-only stand-in. It exercises scoring and MCP wiring without requiring Ollama.
async function askMock(arm, gstin) {
  if (arm === "with") {
    const { validateGstin } = await import(join(root, "dist/validators/gstin.js"))
    return { text: `${validateGstin(gstin).valid_format ? "VALID" : "INVALID"}\nchecked with bharat-mcp`, used_tool: true, turns: 2 }
  }
  return { text: `${/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin) ? "VALID" : "INVALID"}\nshape-only stand-in`, used_tool: false, turns: 1 }
}

const results = {}
for (const arm of arms) {
  const rows = []
  for (let i = 0; i < cases.length; i++) {
    let result
    try {
      result = args.mock === "true" ? await askMock(arm, cases[i].gstin) : await askOllama(arm, cases[i].gstin)
    } catch (error) {
      result = { text: "", used_tool: false, error: String(error).slice(0, 300) }
    }
    const answer = result.error ? "ERROR" : parseVerdict(result.text)
    rows.push({ gstin: cases[i].gstin, expected: cases[i].expected, kind: cases[i].kind, answer, correct: answer === cases[i].expected, used_tool: !!result.used_tool, turns: result.turns, error: result.error, reply: String(result.text ?? "").slice(0, 400) })
    process.stderr.write(`\r${arm}: ${i + 1}/${cases.length}`)
  }
  process.stderr.write("\n")
  results[arm] = { rows, summary: summarise(rows) }
}
await mcpClient?.close().catch(() => {})
const started = new Date().toISOString()
mkdirSync(join(root, "bench/results"), { recursive: true })
const filename = `ollama-${model.replace(/[^\w.-]+/g, "_")}-${started.replace(/[:.]/g, "-")}.json`
const filepath = join(root, "bench/results", filename)
writeFileSync(filepath, JSON.stringify({ backend: args.mock === "true" ? "mock" : "ollama", model, host: args.mock === "true" ? undefined : host, started, finished: new Date().toISOString(), note: args.mock === "true" ? "HARNESS TEST ONLY: not a real model or Ollama run" : undefined, cases: cases.length, results }, null, 2) + "\n")
console.log("| arm | accuracy | fake GSTINs accepted | real GSTINs rejected | used the tool |")
console.log("|---|---|---|---|---|")
for (const arm of arms) {
  const s = results[arm].summary
  console.log(`| ${arm === "with" ? "with bharat-mcp" : "without"} | ${s.correct}/${s.total} | ${s.fake_accepted}/${s.fakes} | ${s.real_rejected}/${s.reals} | ${(s.tool_use_rate * 100).toFixed(0)}% |`)
}
console.log(`\nSaved ${filepath}`)
if (args.mock === "true") console.log("Stand-in run only. These results must not be presented as Ollama model performance.")
