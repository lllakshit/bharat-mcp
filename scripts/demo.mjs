#!/usr/bin/env node
// A guided tour of bharat-mcp: starts the BUILT server over stdio, exactly as Claude Desktop or Cursor would, and calls each tool.
// Run `npm run build && npm run demo`.
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { fileURLToPath } from "node:url"

const color = (process.stdout.isTTY || process.env.FORCE_COLOR) && !process.env.NO_COLOR
const paint = (code) => (text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text)
const [bold, dim, green, red, cyan, yellow] = [paint("1"), paint("2"), paint("32"), paint("31"), paint("36"), paint("33")]

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url))
const client = new Client({ name: "bharat-demo", version: "1.0.0" })
await client.connect(new StdioClientTransport({ command: process.execPath, args: [cli], stderr: "ignore" }))

const verdict = (ok) => (ok ? green("✔ well-formed") : red("✘ NOT well-formed"))
const row = (label, value) => console.log(`    ${dim(label.padEnd(18))} ${value}`)

async function call(name, args, show) {
  console.log(`\n${cyan("▶")} ${bold(name)} ${dim(JSON.stringify(args))}`)
  const t0 = performance.now()
  const result = await client.callTool({ name, arguments: args })
  const ms = performance.now() - t0
  const data = JSON.parse(result.content[0].text)
  show(data, result.isError)
  console.log(dim(`    (${ms.toFixed(1)} ms, answered offline over stdio)`))
}

const { tools } = await client.listTools()
console.log(bold("bharat-mcp") + dim(" · MCP server for Indian public data · connected over stdio"))
for (let i = 0; i < tools.length; i += 4) console.log(dim(`${i === 0 ? "tools: " : "       "}${tools.slice(i, i + 4).map((t) => t.name).join(", ")}`))

console.log(bold("\n── 1. A real GSTIN and a fake one that differs by ONE character ──"))
for (const gstin of ["29AAGCB7383J1Z4", "29AAGCB7383J1Z5"]) {
  await call("validate_gstin", { gstin }, (d) => {
    row("result", verdict(d.valid_format))
    if (d.errors.length) row("why", yellow(d.errors[0]))
    row("decoded", `${d.state} · PAN ${d.pan} · ${d.holder_type}`)
  })
}

console.log(bold("\n── 2. PAN, Aadhaar (format only), IFSC ──"))
await call("validate_pan", { pan: "ABCPE1234F" }, (d) => (row("result", verdict(d.valid_format)), row("holder type", d.holder_type)))
await call("validate_pan", { pan: "ABCKE1234F" }, (d) => (row("result", verdict(d.valid_format)), row("why", yellow(d.errors[0]))))
for (const aadhaar of ["2345 6789 0124", "2345 6789 0125"]) {
  await call("validate_aadhaar_format", { aadhaar }, (d) => {
    row("format", verdict(d.valid_format))
    if (d.errors.length) row("why", yellow(d.errors[0]))
    row("shown back", d.masked)
  })
}
console.log(dim("    (made-up numbers; the tool checks only the format and never stores or looks anything up)"))
await call("validate_ifsc", { ifsc: "SBIN0001234" }, (d) => (row("result", verdict(d.valid_format)), row("bank", d.bank_name)))

console.log(bold("\n── 3. Lookups ──"))
await call("lookup_pincode", { pincode: "302001" }, (d) => (row("place", `${d.district}, ${d.state}`), row("post offices", `${d.post_offices.length} (${d.post_offices.slice(0, 2).join(", ")}…)`), row("data as of", yellow(d.data_as_of))))
await call("state_info", { query: "27" }, (d) => (row("state", `${d.state.name} (${d.state.type.replace("_", " ")})`), row("RTO prefix", d.state.rto_prefixes.join(", ")), row("QRMP GSTR-3B day", String(d.state.gst_qrmp_due_day))))
await call("india_holidays", { date: "2026-11-08" }, (d) => row("central holiday?", d.is_central_government_holiday ? green(d.holidays[0].name) : "no"))

console.log(bold("\n── 4. What is due next? (GST, Karnataka, November 2026) ──"))
await call("compliance_deadlines", { from: "2026-11-01", to: "2026-11-30", categories: ["gst"], state: "Karnataka" }, (d) => {
  for (const x of d.deadlines) row(`${x.date} ${x.weekday.slice(0, 3)}`, `${x.form} ${dim("· " + x.legal_basis.split(",")[0])}`)
  row("status", yellow(d.status))
})

console.log(bold("\n── 5. Bad input is an error, not a guess ──"))
await call("compliance_deadlines", { from: "2026-02-30" }, (d, isError) => row("isError", isError ? green("true") : red("false")) || row("message", yellow(d.error)))

await client.close()
console.log(`\n${green("✔")} ${bold("done")} ${dim("— every answer above was calculated or read locally; no network was used.")}`)
