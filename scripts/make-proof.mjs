#!/usr/bin/env node
// Regenerates everything under docs/proof and docs/img from real runs on this machine: build, tests, demo, speed benchmark.
// Run with `npm run proof`. The README's screenshots are these files; none of the text is written by hand.
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"

mkdirSync("docs/proof", { recursive: true })
mkdirSync("docs/img", { recursive: true })
const env = { ...process.env, FORCE_COLOR: "1" }
const run = (cmd, args, extraEnv = {}) => {
  const r = spawnSync(cmd, args, { env: { ...env, ...extraEnv }, encoding: "utf8" })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed:\n${r.stdout}${r.stderr}`)
  return r.stdout + (cmd === "npx" ? r.stderr : "")
}
const strip = (t) => t.replace(/\x1b\[[0-9;]*m/g, "")
const save = (name, text) => (writeFileSync(`docs/proof/${name}.ansi.txt`, text), writeFileSync(`docs/proof/${name}.txt`, strip(text)))
const render = (name, out, title, ...markers) => execFileSync("node", ["scripts/render-proof.mjs", `docs/proof/${name}.ansi.txt`, `docs/img/${out}.svg`, title, ...markers], { stdio: "inherit" })

run("npm", ["run", "build"])
save("tests", run("npx", ["vitest", "run", "--reporter=verbose"], { NO_COLOR: "" }))
render("tests", "tests", "npm test · 57 tests, all passing")

save("demo", run("node", ["scripts/demo.mjs"]))
render("demo", "demo-gstin", "bharat-mcp · real GSTIN vs a fake one (1 character different)", "bharat-mcp ·", "── 2.")
render("demo", "demo-tools", "bharat-mcp · PAN, Aadhaar format, IFSC, pincode, state, holidays", "── 2.", "── 4.")
render("demo", "demo-deadlines", "bharat-mcp · compliance deadlines and bad input", "── 4.")

save("llm-benchmark", run("node", ["bench/llm/tool-check.mjs"]) + "\n" + run("node", ["bench/llm/report.mjs"]))
render("llm-benchmark", "llm-benchmark", "benchmark · Claude models without tools vs the bharat-mcp tool")
save("crosscheck", run("python3", ["bench/crosscheck.py"]))
render("crosscheck", "crosscheck", "independent cross-check · Python vs TypeScript, 20,000 GSTINs")

save("perf", run("node", ["bench/perf.mjs"], { FORCE_COLOR: "" }))
render("perf", "perf", "npm run bench · speed and size on this machine")
console.log("Proof regenerated in docs/proof and docs/img")
