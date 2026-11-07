#!/usr/bin/env node
// Speed and size of bharat-mcp on this machine. Run `npm run build` first, then `node bench/perf.mjs`.
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import os from "node:os"
import { fileURLToPath } from "node:url"
import { performance } from "node:perf_hooks"

const dist = (p) => new URL(`../dist/${p}`, import.meta.url)
const cli = fileURLToPath(dist("cli.js"))
const { validateGstin } = await import(dist("validators/gstin.js"))
const { validatePan } = await import(dist("validators/pan.js"))
const { validateAadhaarFormat } = await import(dist("validators/aadhaar.js"))
const { validateIfsc } = await import(dist("validators/ifsc.js"))
const { lookupPincode } = await import(dist("pincode.js"))
const { findState } = await import(dist("data/states.js"))
const { computeDeadlines } = await import(dist("deadlines.js"))

const pctile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
const fmt = (n, d = 0) => n.toLocaleString("en-US", { maximumFractionDigits: d })

function opsPerSecond(name, fn, iterations = 200_000) {
  for (let i = 0; i < 2000; i++) fn(i) // warm up
  const t0 = performance.now()
  for (let i = 0; i < iterations; i++) fn(i)
  const ms = performance.now() - t0
  return { name, iterations, ops_per_sec: Math.round((iterations / ms) * 1000), micros_per_call: (ms * 1000) / iterations }
}

const GSTINS = ["29AAGCB7383J1Z4", "27AAPFU0939F1ZV", "27AAACR5055K1Z7", "29AAGCB7383J1Z5"]
const functions = [
  opsPerSecond("validate_gstin", (i) => validateGstin(GSTINS[i % 4])),
  opsPerSecond("validate_pan", () => validatePan("ABCPE1234F")),
  opsPerSecond("validate_aadhaar_format", () => validateAadhaarFormat("2345 6789 0123")),
  opsPerSecond("validate_ifsc", () => validateIfsc("SBIN0001234")),
  opsPerSecond("lookup_pincode", (i) => lookupPincode(["110001", "302001", "400001", "560001"][i % 4]), 100_000),
  opsPerSecond("state_info", (i) => findState(["27", "Karnataka", "MH", "IN-DL"][i % 4]), 100_000),
  opsPerSecond("compliance_deadlines (31 days)", () => computeDeadlines({ from: "2026-11-01", to: "2026-12-01" }), 5_000),
]

// Cold start: spawn the server, finish the MCP handshake, list the tools.
const startups = []
for (let i = 0; i < 10; i++) {
  const t0 = performance.now()
  const c = new Client({ name: "perf", version: "0" })
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [cli], stderr: "ignore" }))
  await c.listTools()
  startups.push(performance.now() - t0)
  await c.close()
}
startups.sort((a, b) => a - b)

// Latency of real tool calls over stdio, on one long-lived server.
const client = new Client({ name: "perf", version: "0" })
const transport = new StdioClientTransport({ command: process.execPath, args: [cli], stderr: "ignore" })
await client.connect(transport)
const call = (name, args) => client.callTool({ name, arguments: args })
let t0 = performance.now()
await call("lookup_pincode", { pincode: "110001" })
const firstPincode = performance.now() - t0 // includes reading the 4.4 MB data file once

async function latency(name, makeArgs, n = 1000) {
  for (let i = 0; i < 50; i++) await call(name, makeArgs(i))
  const times = []
  for (let i = 0; i < n; i++) {
    const s = performance.now()
    await call(name, makeArgs(i))
    times.push(performance.now() - s)
  }
  times.sort((a, b) => a - b)
  return { name, calls: n, p50_ms: pctile(times, 50), p95_ms: pctile(times, 95), p99_ms: pctile(times, 99) }
}
const stdio = [
  await latency("validate_gstin", (i) => ({ gstin: GSTINS[i % 4] })),
  await latency("lookup_pincode", (i) => ({ pincode: ["110001", "302001", "400001", "560001"][i % 4] })),
  await latency("compliance_deadlines", () => ({ from: "2026-11-01", to: "2026-12-01" }), 300),
]
const pid = transport.pid
const rssMb = pid ? Number(execFileSync("ps", ["-o", "rss=", "-p", String(pid)]).toString().trim()) / 1024 : null
await client.close()

const pack = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: fileURLToPath(new URL("..", import.meta.url)) }).toString())[0]
const machine = { node: process.version, platform: `${os.platform()} ${os.arch()}`, cpu: os.cpus()[0]?.model, cores: os.cpus().length, memory_gb: Math.round(os.totalmem() / 2 ** 30) }

const result = {
  measured_at: new Date().toISOString(),
  machine,
  in_process: functions,
  over_stdio: { first_pincode_call_ms: firstPincode, calls: stdio, server_rss_mb_after_pincode_load: rssMb, cold_start_ms: { median: pctile(startups, 50), p95: pctile(startups, 95), runs: startups.length } },
  package: { tarball_kb: Math.round(pack.size / 1024), unpacked_mb: Number((pack.unpackedSize / 2 ** 20).toFixed(1)), files: pack.entryCount },
}
mkdirSync(fileURLToPath(new URL("./results", import.meta.url)), { recursive: true })
writeFileSync(fileURLToPath(new URL("./results/perf.json", import.meta.url)), JSON.stringify(result, null, 2) + "\n")

console.log(`Machine: ${machine.cpu}, ${machine.cores} cores, ${machine.memory_gb} GB, ${machine.platform}, Node ${machine.node}\n`)
console.log("In-process (the functions, no MCP):")
for (const f of functions) console.log(`  ${f.name.padEnd(34)} ${fmt(f.ops_per_sec).padStart(12)} calls/s   ${f.micros_per_call.toFixed(2).padStart(9)} µs each`)
console.log("\nOver stdio (a real MCP client talking to the server):")
console.log(`  cold start to tool list (median of ${startups.length}): ${pctile(startups, 50).toFixed(0)} ms (p95 ${pctile(startups, 95).toFixed(0)} ms)`)
console.log(`  first lookup_pincode (reads the data file once): ${firstPincode.toFixed(1)} ms`)
for (const s of stdio) console.log(`  ${s.name.padEnd(22)} p50 ${s.p50_ms.toFixed(2).padStart(6)} ms   p95 ${s.p95_ms.toFixed(2).padStart(6)} ms   p99 ${s.p99_ms.toFixed(2).padStart(6)} ms   (${s.calls} calls)`)
console.log(`  server memory after loading all data: ${rssMb ? rssMb.toFixed(0) + " MB" : "n/a"}`)
console.log(`\nPackage: ${result.package.tarball_kb} KB download, ${result.package.unpacked_mb} MB unpacked, ${result.package.files} files`)
