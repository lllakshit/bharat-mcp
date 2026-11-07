#!/usr/bin/env node
// Runs the real demo and saves every line of output with the time it actually appeared. The video is built from this file.
// Usage: node scripts/record-demo.mjs [pace-ms]   (writes docs/proof/demo-timing.json)
import { spawn } from "node:child_process"
import { writeFileSync } from "node:fs"

const pace = process.argv[2] ?? "1000"
const started = performance.now()
const child = spawn(process.execPath, ["scripts/demo.mjs"], { env: { ...process.env, FORCE_COLOR: "1", DEMO_PACE_MS: pace }, stdio: ["ignore", "pipe", "inherit"] })
const lines = []
let pending = ""
child.stdout.on("data", (chunk) => {
  const t = Math.round(performance.now() - started)
  pending += chunk.toString()
  const parts = pending.split("\n")
  pending = parts.pop() ?? ""
  for (const line of parts) lines.push({ t, line })
})
child.on("close", (code) => {
  if (pending) lines.push({ t: Math.round(performance.now() - started), line: pending })
  if (code !== 0) throw new Error(`demo exited with ${code}`)
  writeFileSync("docs/proof/demo-timing.json", JSON.stringify({ pace_ms: Number(pace), total_ms: Math.round(performance.now() - started), lines }, null, 1) + "\n")
  console.log(`Recorded ${lines.length} lines over ${((performance.now() - started) / 1000).toFixed(1)} s`)
})
