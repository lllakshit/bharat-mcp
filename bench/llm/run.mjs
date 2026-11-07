#!/usr/bin/env node
// Does a model tell a real GSTIN from a fake one that differs by one character, with and without bharat-mcp?
//
//   node bench/llm/run.mjs --backend claude-cli --model haiku  --arm both
//   node bench/llm/run.mjs --backend api        --model <id>   --arm both     (needs ANTHROPIC_API_KEY in the environment)
//
// "without": the model gets only the question. "with": the same question, with the bharat-mcp tools attached; the model is NOT told
// to use them. Answers are scored against the checksum (see dataset.mjs). Results are written to bench/results/.
import { spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, token, i, all) => (token.startsWith("--") ? [...acc, [token.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? "true" : all[i + 1]]] : acc), []),
)
const backend = args.backend ?? "claude-cli"
const model = args.model ?? (backend === "claude-cli" ? "haiku" : "")
const arms = args.arm === "without" || args.arm === "with" ? [args.arm] : ["without", "with"]
const limit = Number(args.limit ?? 0)
const concurrency = Number(args.concurrency ?? 4)
const root = fileURLToPath(new URL("../../", import.meta.url))
const cases = JSON.parse(readFileSync(new URL("./gstin-cases.json", import.meta.url), "utf8")).cases.slice(0, limit || undefined)
const PROMPT = (g) => `Is this GSTIN valid? ${g}\nAnswer on the first line with exactly VALID or INVALID, then give one short reason.`
const SYSTEM = "You are a helpful assistant."

export function parseVerdict(text) {
  const first = String(text ?? "").trim().split("\n")[0] ?? ""
  const match = /\b(INVALID|VALID)\b/i.exec(first.replace(/[*_`]/g, ""))
  return match ? match[1].toUpperCase() : "UNPARSED"
}

export function summarise(rows) {
  const total = rows.length
  const correct = rows.filter((r) => r.correct).length
  const invalid = rows.filter((r) => r.expected === "INVALID")
  const valid = rows.filter((r) => r.expected === "VALID")
  return {
    total,
    accuracy: total ? correct / total : 0,
    fake_accepted: invalid.filter((r) => r.answer === "VALID").length,
    fakes: invalid.length,
    real_rejected: valid.filter((r) => r.answer === "INVALID").length,
    reals: valid.length,
    unparsed: rows.filter((r) => r.answer === "UNPARSED").length,
    tool_use_rate: total ? rows.filter((r) => r.used_tool).length / total : 0,
  }
}

const run = (cmd, argv, cwd) =>
  new Promise((resolve) => {
    const child = spawn(cmd, argv, { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let out = ""
    let err = ""
    const timer = setTimeout(() => child.kill("SIGKILL"), 180_000)
    child.stdout.on("data", (d) => (out += d))
    child.stderr.on("data", (d) => (err += d))
    child.on("close", (code) => (clearTimeout(timer), resolve({ code, out, err })))
  })

const scratch = mkdtempSync(join(tmpdir(), "bharat-bench-"))
const emptyConfig = join(scratch, "none.json")
const bharatConfig = join(scratch, "bharat.json")
writeFileSync(emptyConfig, JSON.stringify({ mcpServers: {} }))
writeFileSync(bharatConfig, JSON.stringify({ mcpServers: { bharat: { command: process.execPath, args: [join(root, "dist/cli.js")] } } }))

async function viaClaudeCli(arm, gstin) {
  const bin = process.env.CLAUDE_BIN ?? "claude"
  const base = ["-p", PROMPT(gstin), "--model", model, "--output-format", "json", "--no-session-persistence", "--system-prompt", SYSTEM, "--tools", "", "--strict-mcp-config"]
  const extra = arm === "with" ? ["--mcp-config", bharatConfig, "--allowedTools", "mcp__bharat"] : ["--mcp-config", emptyConfig]
  const { out, err } = await run(bin, [...base, ...extra], scratch)
  let json
  try {
    json = JSON.parse(out)
  } catch {
    return { text: "", used_tool: false, error: (err || out).slice(0, 300) }
  }
  if (json.is_error) return { text: "", used_tool: false, error: String(json.result).slice(0, 300) }
  return { text: json.result, used_tool: (json.num_turns ?? 1) > 1, turns: json.num_turns, cost_usd: json.total_cost_usd }
}

async function viaApi(arm, gstin) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error("Set ANTHROPIC_API_KEY in your shell for --backend api")
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js")
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js")
  const { createServer } = await import(join(root, "dist/server.js"))
  const client = new Client({ name: "bench", version: "0" })
  let tools = []
  if (arm === "with") {
    const [a, b] = InMemoryTransport.createLinkedPair()
    await createServer().connect(b)
    await client.connect(a)
    tools = (await client.listTools()).tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }))
  }
  const messages = [{ role: "user", content: PROMPT(gstin) }]
  let usedTool = false
  for (let turn = 0; turn < 5; turn++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 1024, system: SYSTEM, messages, ...(tools.length ? { tools } : {}) }),
    })
    const body = await res.json()
    if (!res.ok) return { text: "", used_tool: usedTool, error: JSON.stringify(body).slice(0, 300) }
    const calls = body.content.filter((c) => c.type === "tool_use")
    if (calls.length === 0) {
      await client.close().catch(() => {})
      return { text: body.content.filter((c) => c.type === "text").map((c) => c.text).join(""), used_tool: usedTool, turns: turn + 1 }
    }
    usedTool = true
    messages.push({ role: "assistant", content: body.content })
    const results = []
    for (const call of calls) {
      const r = await client.callTool({ name: call.name, arguments: call.input })
      results.push({ type: "tool_result", tool_use_id: call.id, content: r.content[0].text, ...(r.isError ? { is_error: true } : {}) })
    }
    messages.push({ role: "user", content: results })
  }
  return { text: "", used_tool: usedTool, error: "too many tool turns" }
}

// A stand-in "model" used only to test this harness. It checks the shape and never the checksum, like a careless guesser.
async function viaMock(arm, gstin) {
  if (arm === "with") {
    const { validateGstin } = await import(join(root, "dist/validators/gstin.js"))
    return { text: `${validateGstin(gstin).valid_format ? "VALID" : "INVALID"}\nchecked with the tool`, used_tool: true, turns: 2 }
  }
  return { text: `${/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin) ? "VALID" : "INVALID"}\nlooks well formed`, used_tool: false, turns: 1 }
}

const ask = { "claude-cli": viaClaudeCli, api: viaApi, mock: viaMock }[backend]
if (!ask) throw new Error(`Unknown backend: ${backend}`)

async function pool(items, worker) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await worker(items[i], i)
    }
  }))
  return out
}

const started = new Date().toISOString()
const results = {}
for (const arm of arms) {
  let done = 0
  const rows = await pool(cases, async (c) => {
    let res = await ask(arm, c.gstin)
    if (res.error) res = await ask(arm, c.gstin) // one retry for a transient failure
    const answer = res.error ? "ERROR" : parseVerdict(res.text)
    process.stderr.write(`\r${arm}: ${++done}/${cases.length}`)
    return { gstin: c.gstin, expected: c.expected, kind: c.kind, answer, correct: answer === c.expected, used_tool: !!res.used_tool, turns: res.turns, error: res.error, reply: String(res.text).slice(0, 400) }
  })
  process.stderr.write("\n")
  results[arm] = { rows, summary: summarise(rows) }
  const errors = rows.filter((r) => r.answer === "ERROR")
  if (errors.length) console.error(`WARNING: ${errors.length} calls failed in the "${arm}" arm, first error: ${errors[0].error}`)
}

const label = `${backend}-${model || "default"}`.replace(/[^\w.-]+/g, "_")
mkdirSync(join(root, "bench/results"), { recursive: true })
const file = join(root, "bench/results", `${backend === "mock" ? "MOCK-" : ""}${label}-${started.replace(/[:.]/g, "-")}.json`)
writeFileSync(file, JSON.stringify({ backend, model, started, finished: new Date().toISOString(), note: backend === "mock" ? "HARNESS TEST ONLY: not a real model" : undefined, cases: cases.length, results }, null, 2) + "\n")

const pct = (n) => `${(n * 100).toFixed(0)}%`
console.log(`\n| arm | accuracy | fake GSTINs accepted | real GSTINs rejected | used the tool |\n|---|---|---|---|---|`)
for (const arm of arms) {
  const s = results[arm].summary
  console.log(`| ${arm === "with" ? "with bharat-mcp" : "without"} | ${pct(s.accuracy)} (${Math.round(s.accuracy * s.total)}/${s.total}) | ${s.fake_accepted}/${s.fakes} | ${s.real_rejected}/${s.reals} | ${pct(s.tool_use_rate)} |`)
}
console.log(`\nSaved ${file}`)
