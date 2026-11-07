// Starts the BUILT server over stdio, exactly as Claude Desktop or Cursor would, and calls a few tools.
// Usage: npm run build && node scripts/smoke.mjs [path-to-cli.js]
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { fileURLToPath } from "node:url"

const cli = process.argv[2] ?? fileURLToPath(new URL("../dist/cli.js", import.meta.url))
const transport = new StdioClientTransport({ command: process.execPath, args: [cli] })
const client = new Client({ name: "smoke", version: "0.0.0" })
await client.connect(transport)

const fail = (message) => {
  console.error("SMOKE FAILED:", message)
  process.exit(1)
}
const call = async (name, args) => JSON.parse((await client.callTool({ name, arguments: args })).content[0].text)

const { tools } = await client.listTools()
if (tools.length !== 8) fail(`expected 8 tools, got ${tools.length}`)
const good = await call("validate_gstin", { gstin: "29AAGCB7383J1Z4" })
if (good.valid !== true || good.state !== "Karnataka") fail("valid GSTIN was not accepted")
const bad = await call("validate_gstin", { gstin: "29AAGCB7383J1Z5" })
if (bad.valid !== false) fail("a GSTIN with a wrong check character was accepted")
const pin = await call("lookup_pincode", { pincode: "110001" })
if (pin.found !== true || pin.state !== "Delhi") fail("pincode lookup failed")
const dl = await call("compliance_deadlines", { from: "2026-11-01", to: "2026-11-30" })
if (!dl.deadlines.some((d) => d.form === "GSTR-3B")) fail("no GSTR-3B deadline in November")

await client.close()
console.log(`OK: ${tools.length} tools, GSTIN, pincode and deadlines answered over stdio`)
