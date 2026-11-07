import { execFile, execFileSync } from "node:child_process"
import { mkdtempSync, readdirSync, readFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const run = promisify(execFile)
const script = "bench/llm/ollama.mjs"

/** A tiny stand-in for Ollama: the same HTTP routes, with a "model" that calls the tool when offered one and otherwise always says VALID. */
function fakeOllama(options: { capabilities?: string[] } = {}) {
  const server = createServer((req, res) => {
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", () => {
      const send = (body: unknown) => (res.setHeader("content-type", "application/json"), res.end(JSON.stringify(body)))
      if (req.url === "/api/tags") return send({ models: [{ name: "fake:1b" }] })
      if (req.url === "/api/show") return send({ capabilities: options.capabilities ?? ["completion", "tools"] })
      const body = JSON.parse(raw) as { messages: { role: string; content: string }[]; tools?: unknown[] }
      const toolReply = [...body.messages].reverse().find((m) => m.role === "tool")
      if (body.tools && !toolReply) {
        const gstin = /\b([0-9A-Z]{15})\b/.exec(body.messages[0]!.content)![1]
        return send({ message: { role: "assistant", content: "", tool_calls: [{ function: { name: "validate_gstin", arguments: { gstin } } }] } })
      }
      if (toolReply) {
        const ok = (JSON.parse(toolReply.content) as { valid_format: boolean }).valid_format
        return send({ message: { role: "assistant", content: `${ok ? "VALID" : "INVALID"}\nChecked with the tool.` } })
      }
      return send({ message: { role: "assistant", content: "<think>Maybe INVALID, maybe VALID...</think>\nVALID\nIt looks well formed." } })
    })
  })
  return new Promise<{ server: Server; url: string }>((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` })))
}

let outDir: string
const servers: Server[] = []

beforeAll(() => {
  // The runner imports the built server, so make sure a fresh build exists.
  execFileSync("npm", ["run", "build"], { stdio: "ignore" })
  outDir = mkdtempSync(join(tmpdir(), "bharat-ollama-test-"))
}, 120_000)
afterAll(() => servers.forEach((s) => s.close()))

describe("bench/llm/ollama.mjs", () => {
  it("runs both arms over Ollama's HTTP API, calls the tool through MCP, and ignores <think> blocks", async () => {
    const { server, url } = await fakeOllama()
    servers.push(server)
    await run("node", [script, "--model", "fake:1b", "--host", url, "--limit", "6", "--out-dir", outDir])
    const file = readdirSync(outDir).find((f) => f.startsWith("ollama-fake_1b-"))!
    expect(file).toBeDefined()
    const saved = JSON.parse(readFileSync(join(outDir, file), "utf8"))
    expect(saved.backend).toBe("ollama")
    expect(saved.settings).toEqual({ temperature: 0, seed: 7 })

    const withTool = saved.results.with.summary
    expect(withTool).toMatchObject({ correct: 6, total: 6, tool_use_rate: 1, errors: 0, unparsed: 0 })
    const without = saved.results.without.summary
    expect(without.tool_use_rate).toBe(0)
    expect(without.unparsed).toBe(0)
    // The unaided stand-in always says VALID, so every fake is accepted and no real one is rejected.
    expect(without.fake_accepted).toBe(without.fakes)
    expect(without.real_rejected).toBe(0)
    expect(saved.results.with.rows.every((r: { turns: number }) => r.turns === 2)).toBe(true)
  }, 60_000)

  it("marks mock runs so they stay out of comparisons", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bharat-ollama-mock-"))
    const { stdout } = await run("node", [script, "--model", "stand-in", "--mock", "--limit", "3", "--out-dir", dir])
    expect(readdirSync(dir)[0]).toMatch(/^MOCK-ollama-stand-in-/)
    expect(stdout).toContain("must not be presented as Ollama model performance")
    expect(JSON.parse(readFileSync(join(dir, readdirSync(dir)[0]!), "utf8")).note).toContain("HARNESS TEST ONLY")
  })

  it("stops with a plain message when Ollama is not running", async () => {
    await expect(run("node", [script, "--model", "fake:1b", "--host", "http://127.0.0.1:9", "--limit", "1", "--out-dir", outDir])).rejects.toMatchObject({ stderr: expect.stringContaining("Cannot reach Ollama") })
  })

  it("stops when the model is not installed", async () => {
    const { server, url } = await fakeOllama()
    servers.push(server)
    await expect(run("node", [script, "--model", "nope:7b", "--host", url, "--limit", "1", "--out-dir", outDir])).rejects.toMatchObject({ stderr: expect.stringContaining("ollama pull nope:7b") })
  })

  it("refuses the tool arm for a model without tool-calling, but still runs the unaided arm", async () => {
    const { server, url } = await fakeOllama({ capabilities: ["completion"] })
    servers.push(server)
    await expect(run("node", [script, "--model", "fake:1b", "--host", url, "--limit", "1", "--out-dir", outDir])).rejects.toMatchObject({ stderr: expect.stringContaining("does not list tool-calling support") })
    const ok = await run("node", [script, "--model", "fake:1b", "--host", url, "--arm", "without", "--limit", "2", "--out-dir", outDir])
    expect(ok.stdout).toContain("| without |")
  }, 60_000)
})
