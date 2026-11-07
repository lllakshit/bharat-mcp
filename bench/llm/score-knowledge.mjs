#!/usr/bin/env node
// Scores a model's no-tools answers to the pincode and 2027-holiday questions against bharat-mcp's bundled data.
//   node bench/llm/score-knowledge.mjs answers.json "<label>"
// answers.json: {"pincodes":[{"n":1,"state":"...","district":"..."}],"holidays":[{"name":"...","date":"YYYY-MM-DD|unknown"}]}
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

const [, , file, label = "model"] = process.argv
if (!file) {
  console.error('Usage: node bench/llm/score-knowledge.mjs answers.json "<label>"')
  process.exit(1)
}
const raw = readFileSync(file, "utf8")
const answers = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1))
const pinKey = JSON.parse(readFileSync(new URL("./pincode-cases.json", import.meta.url), "utf8")).pincodes
const holidays = JSON.parse(readFileSync(new URL("../../data/holidays.json", import.meta.url), "utf8")).years["2027"].holidays
const norm = (s) => String(s ?? "").toLowerCase().replace(/\bdistrict\b/g, "").replace(/[^a-z]/g, "")
const unknown = (s) => !s || /^unknown$/i.test(String(s).trim())

const pins = Object.entries(pinKey).map(([pin, truth], i) => {
  const a = answers.pincodes.find((x) => x.n === i + 1) ?? {}
  const state = unknown(a.state) ? "unknown" : norm(a.state) === norm(truth.state) ? "correct" : "wrong"
  const parts = truth.district.split(" / ").map(norm)
  const d = norm(a.district)
  const district = unknown(a.district) ? "unknown" : parts.some((p) => p === d || (d.length > 3 && (p.includes(d) || d.includes(p)))) ? "correct" : "wrong"
  return { pin, truth, answer: { state: a.state, district: a.district }, state, district }
})
const hol = holidays.map(([date, name]) => {
  const a = answers.holidays.find((x) => norm(x.name) === norm(name)) ?? {}
  const verdict = unknown(a.date) ? "unknown" : a.date === date ? "correct" : "wrong"
  return { name, truth: date, answer: a.date, verdict }
})
const count = (rows, key, v) => rows.filter((r) => (key ? r[key] : r.verdict) === v).length
const summary = {
  label,
  pincode_state: { correct: count(pins, "state", "correct"), wrong: count(pins, "state", "wrong"), unknown: count(pins, "state", "unknown"), total: pins.length },
  pincode_district: { correct: count(pins, "district", "correct"), wrong: count(pins, "district", "wrong"), unknown: count(pins, "district", "unknown"), total: pins.length },
  holidays_2027: { correct: count(hol, null, "correct"), wrong: count(hol, null, "wrong"), unknown: count(hol, null, "unknown"), total: hol.length },
}
mkdirSync(new URL("../results/", import.meta.url), { recursive: true })
writeFileSync(new URL(`../results/knowledge-${label.replace(/[^\w.-]+/g, "_")}.json`, import.meta.url), JSON.stringify({ summary, pins, hol }, null, 2) + "\n")
const f = (o) => `${o.correct} right, ${o.wrong} wrong, ${o.unknown} unknown`
console.log(`${label}\n  pincode → state    (${pins.length}): ${f(summary.pincode_state)}\n  pincode → district (${pins.length}): ${f(summary.pincode_district)}\n  2027 holidays      (${hol.length}): ${f(summary.holidays_2027)}`)
