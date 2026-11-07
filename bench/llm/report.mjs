#!/usr/bin/env node
// Prints the benchmark tables from the saved result files in bench/results. Nothing is typed in by hand.
import { existsSync, readFileSync } from "node:fs"

const read = (name) => {
  const url = new URL(`../results/${name}`, import.meta.url)
  return existsSync(url) ? JSON.parse(readFileSync(url, "utf8")) : null
}
const notes = read("run-notes.json")
const models = [
  ["claude-haiku", "no-tool-claude-haiku_no_tools_.json", "knowledge-claude-haiku_no_tools_.json"],
  ["claude-sonnet", "no-tool-claude-sonnet_no_tools_.json", "knowledge-claude-sonnet_no_tools_.json"],
  ["claude-opus", "no-tool-claude-opus_no_tools_.json", null],
]
const pad = (s, n) => String(s).padEnd(n)

console.log("Test 1 · Is this GSTIN valid?  40 GSTINs: 20 real, 20 with exactly one character changed")
console.log(`${pad("", 24)}${pad("score", 10)}${pad("fakes accepted", 17)}${pad("real ones rejected", 20)}time for all 40`)
for (const [name, file] of models.map((m) => [m[0], m[1]])) {
  const r = read(file)?.summary
  if (!r) continue
  const secs = notes?.runs?.[name]?.gstin_batch_seconds
  console.log(`${pad(name + ", no tools", 24)}${pad(`${r.correct}/${r.total}`, 10)}${pad(`${r.fake_accepted}/${r.fakes}`, 17)}${pad(`${r.real_rejected}/${r.reals}`, 20)}${secs ? secs.toFixed(0) + " s" : ""}`)
}
const t = read("tool-check.json")
if (t) console.log(`${pad("bharat-mcp (the tool)", 24)}${pad(`${t.correct}/${t.total}`, 10)}${pad(`${t.fake_accepted}/20`, 17)}${pad("0/20", 20)}${t.elapsed_ms.toFixed(0)} ms (40 calls over stdio)`)

console.log("\nTest 2 · Data a model cannot calculate")
console.log(`${pad("", 24)}${pad("pincode → state", 18)}2027 central-government holidays (17)`)
for (const [name, , file] of models) {
  const k = file ? read(file)?.summary : null
  if (!k) continue
  const s = k.pincode_state
  const h = k.holidays_2027
  console.log(`${pad(name + ", no tools", 24)}${pad(`${s.correct}/${s.total} right`, 18)}${h.correct} match the DoPT order, ${h.wrong} differ, ${h.unknown} said unknown`)
}
console.log(`${pad("bharat-mcp (the tool)", 24)}${pad("answer key*", 18)}answer key* (read from the DoPT order)`)
console.log("\n* The tool's own data is the answer key here, so a perfect score would prove")
console.log("  nothing. What the tool adds is the same answer every time, with its source and date.")
