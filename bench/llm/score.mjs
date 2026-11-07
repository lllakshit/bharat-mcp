#!/usr/bin/env node
// Scores a model's answers to the 40 GSTIN questions against the checksum-derived answer key.
//   node bench/llm/score.mjs answers.json "<label>" [tool-calls-used]
// answers.json is an array like [{"n": 1, "verdict": "VALID"}, ...] in the order of bench/llm/gstin-cases.json.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

const [, , file, label = "model", toolCalls = "unknown"] = process.argv
if (!file) {
  console.error('Usage: node bench/llm/score.mjs answers.json "<label>" [tool-calls-used]')
  process.exit(1)
}
const cases = JSON.parse(readFileSync(new URL("./gstin-cases.json", import.meta.url), "utf8")).cases
const raw = readFileSync(file, "utf8")
const answers = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1))
if (answers.length !== cases.length) throw new Error(`Expected ${cases.length} answers, got ${answers.length}`)

const rows = cases.map((c, i) => {
  const verdict = String(answers.find((a) => a.n === i + 1)?.verdict ?? "").toUpperCase()
  return { n: i + 1, gstin: c.gstin, expected: c.expected, kind: c.kind, answer: verdict, correct: verdict === c.expected }
})
const fakes = rows.filter((r) => r.expected === "INVALID")
const reals = rows.filter((r) => r.expected === "VALID")
const summary = {
  label,
  tool_calls_used: toolCalls,
  accuracy: rows.filter((r) => r.correct).length / rows.length,
  correct: rows.filter((r) => r.correct).length,
  total: rows.length,
  fake_accepted: fakes.filter((r) => r.answer === "VALID").length,
  fakes: fakes.length,
  real_rejected: reals.filter((r) => r.answer === "INVALID").length,
  reals: reals.length,
}
mkdirSync(new URL("../results/", import.meta.url), { recursive: true })
const out = new URL(`../results/no-tool-${label.replace(/[^\w.-]+/g, "_")}.json`, import.meta.url)
writeFileSync(out, JSON.stringify({ summary, rows }, null, 2) + "\n")
console.log(`${label}: ${summary.correct}/${summary.total} correct · fake GSTINs accepted ${summary.fake_accepted}/${summary.fakes} · real GSTINs rejected ${summary.real_rejected}/${summary.reals} · tool calls ${toolCalls}`)
