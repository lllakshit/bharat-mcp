#!/usr/bin/env node
// Compare a model served by Ollama on the same 40 GSTIN cases, with and without bharat-mcp.
// Ollama only runs the model, so the MCP server is connected in-process here and its tools are offered to the model through Ollama's
// tool-calling. The model needs tool-calling support (see `ollama show <model>`).
//
//   node bench/llm/ollama.mjs --model qwen3:8b
//   node bench/llm/ollama.mjs --model qwen3:8b --arm with --limit 5
//   node bench/llm/ollama.mjs --model stand-in --mock --limit 5     (harness check only, no Ollama needed)
//
// Options: --host <url> (or OLLAMA_HOST), --arm with|without, --limit <n>, --out-dir <folder> (default bench/results)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const args = Object.fromEntries(
  process.argv.slice(2).reduce(
    (out, token, i, all) => (token.startsWith("--") ? [...out, [token.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? "true" : all[i + 1]]] : out),
    [],
  ),
)
const mock = args.mock === "true"
const model = args.model ?? ""
if (!model) {
  console.error("Pass --model <ollama-model-name>, for example --model qwen3:8b")
  process.exit(1)
}
const host = (args.host ?? process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/$/, "").replace(/^(?!https?:\/\/)/, "http://")
const arms = args.arm === "with" || args.arm === "without" ? [args.arm] : ["without", "with"]
const limit = Number(args.limit ?? 0)
const root = fileURLToPath(new URL("../../", import.meta.url))
const outDir = resolve(args["out-dir"] ?? join(root, "bench/results"))
const cases = JSON.parse(readFileSync(new URL("./gstin-cases.json", import.meta.url), "utf8")).cases.slice(0, limit || undefined)
const REQUEST_TIMEOUT_MS = 300_000
const prompt = (gstin) => `Is this GSTIN valid? ${gstin}\nAnswer on the first line with exactly VALID or INVALID, then give one short reason.`

// Some models print their reasoning inside <think> tags; the verdict is what comes after it.
const parseVerdict = (text) => {
  const answer = String(text ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
  const match = /\b(INVALID|VALID)\b/i.exec((answer.split("\n")[0] ?? "").replace(/[*_`]/g, ""))
  return match ? match[1].toUpperCase() : "UNPARSED"
}
const summarise = (rows) => ({
  total: rows.length,
  correct: rows.filter((r) => r.correct).length,
  accuracy: rows.length ? rows.filter((r) => r.correct).length / rows.length : 0,
  fake_accepted: rows.filter((r) => r.expected === "INVALID" && r.answer === "VALID").length,
  fakes: rows.filter((r) => r.expected === "INVALID").length,
  real_rejected: rows.filter((r) => r.expected === "VALID" && r.answer === "INVALID").length,
  reals: rows.filter((r) => r.expected === "VALID").length,
  unparsed: rows.filter((r) => r.answer === "UNPARSED").length,
  errors: rows.filter((r) => r.answer === "ERROR").length,
  tool_use_rate: rows.length ? rows.filter((r) => r.used_tool).length / rows.length : 0,
})

async function ollama(path, body) {
  const response = await fetch(`${host}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status} on ${path}: ${(await response.text()).slice(0, 300)}`)
  return response.json()
}

// Fail early, with a plain message, instead of 40 identical errors.
async function preflight() {
  let tags
  try {
    tags = await (await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(10_000) })).json()
  } catch {
    throw new Error(`Cannot reach Ollama at ${host}. Start it (open the Ollama app, or run \`ollama serve\`) or pass --host.`)
  }
  const names = (tags.models ?? []).map((m) => m.name)
  if (!names.some((n) => n === model || n === `${model}:latest`)) {
    throw new Error(`Ollama has no model "${model}". Installed: ${names.join(", ") || "none"}. Run \`ollama pull ${model}\`.`)
  }
  if (arms.includes("with")) {
    try {
      const info = await ollama("/api/show", { model })
      if (Array.isArray(info.capabilities) && !info.capabilities.includes("tools")) {
        throw new Error(`Model "${model}" does not list tool-calling support, so the "with" arm cannot work. Pick a model tagged "tools" in the Ollama library, or use --arm without.`)
      }
    } catch (error) {
      if (String(error.message).includes("tool-calling")) throw error // an older Ollama that cannot report capabilities is let through
    }
  }
}

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
    // Temperature 0 and a fixed seed, so a rerun on the same model gives the same answers.
    const body = await ollama("/api/chat", { model, stream: false, messages, options: { temperature: 0, seed: 7 }, ...(arm === "with" ? { tools: ollamaTools } : {}) })
    const message = body.message ?? {}
    const calls = message.tool_calls ?? []
    if (!calls.length) return { text: message.content ?? "", used_tool: usedTool, turns: turn + 1 }
    usedTool = true
    messages.push(message)
    for (const call of calls) {
      const name = call.function?.name
      let input = call.function?.arguments ?? {}
      if (typeof input === "string") {
        try {
          input = JSON.parse(input)
        } catch {
          input = {}
        }
      }
      if (!ollamaTools.some((t) => t.function.name === name)) {
        messages.push({ role: "tool", tool_name: name, content: `Unknown tool: ${name}` })
        continue
      }
      const result = await mcpClient.callTool({ name, arguments: input })
      messages.push({ role: "tool", tool_name: name, content: (result.content ?? []).map((part) => part.text ?? "").join("\n") })
    }
  }
  return { text: "", used_tool: usedTool, error: "Exceeded six tool-call turns" }
}

// Harness-only stand-in: it exercises scoring and result files without Ollama. It is NOT a model.
async function askMock(arm, gstin) {
  if (arm === "with") {
    const { validateGstin } = await import(join(root, "dist/validators/gstin.js"))
    return { text: `${validateGstin(gstin).valid_format ? "VALID" : "INVALID"}\nchecked with bharat-mcp`, used_tool: true, turns: 2 }
  }
  return { text: `${/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin) ? "VALID" : "INVALID"}\nshape-only stand-in`, used_tool: false, turns: 1 }
}

const started = new Date().toISOString()
try {
  if (!mock) await preflight()
  if (arms.includes("with") && !mock) await connectTools()
} catch (error) {
  console.error(error.message)
  process.exit(1)
}

const results = {}
for (const arm of arms) {
  const rows = []
  for (let i = 0; i < cases.length; i++) {
    let result
    try {
      result = mock ? await askMock(arm, cases[i].gstin) : await askOllama(arm, cases[i].gstin)
    } catch (error) {
      result = { text: "", used_tool: false, error: String(error?.message ?? error).slice(0, 300) }
    }
    const answer = result.error ? "ERROR" : parseVerdict(result.text)
    rows.push({ gstin: cases[i].gstin, expected: cases[i].expected, kind: cases[i].kind, answer, correct: answer === cases[i].expected, used_tool: !!result.used_tool, turns: result.turns, error: result.error, reply: String(result.text ?? "").slice(0, 400) })
    process.stderr.write(`\r${arm}: ${i + 1}/${cases.length}`)
  }
  process.stderr.write("\n")
  results[arm] = { rows, summary: summarise(rows) }
  const failed = rows.find((r) => r.answer === "ERROR")
  if (failed) console.error(`WARNING: ${results[arm].summary.errors} calls failed in the "${arm}" arm. First error: ${failed.error}`)
}
await mcpClient?.close().catch(() => {})

mkdirSync(outDir, { recursive: true })
// The MOCK- prefix keeps harness runs out of git (see .gitignore) and out of any comparison.
const filepath = join(outDir, `${mock ? "MOCK-" : ""}ollama-${model.replace(/[^\w.:-]+/g, "_").replace(/:/g, "_")}-${started.replace(/[:.]/g, "-")}.json`)
writeFileSync(
  filepath,
  JSON.stringify({ backend: mock ? "mock" : "ollama", model, host: mock ? undefined : host, started, finished: new Date().toISOString(), note: mock ? "HARNESS TEST ONLY: not a real model or Ollama run" : undefined, settings: mock ? undefined : { temperature: 0, seed: 7 }, cases: cases.length, results }, null, 2) + "\n",
)
console.log("| arm | accuracy | fake GSTINs accepted | real GSTINs rejected | used the tool |")
console.log("|---|---|---|---|---|")
for (const arm of arms) {
  const s = results[arm].summary
  console.log(`| ${arm === "with" ? "with bharat-mcp" : "without"} | ${s.correct}/${s.total} | ${s.fake_accepted}/${s.fakes} | ${s.real_rejected}/${s.reals} | ${(s.tool_use_rate * 100).toFixed(0)}% |`)
}
console.log(`\nSaved ${filepath}`)
if (mock) console.log("Stand-in run only. These results must not be presented as Ollama model performance.")
