import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createServer } from "../src/server.js"

let client: Client

beforeAll(async () => {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await createServer().connect(serverSide)
  client = new Client({ name: "test", version: "0.0.0" })
  await client.connect(clientSide)
})

afterAll(async () => {
  await client.close()
})

async function call(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args })
  const first = (result.content as { type: string; text: string }[])[0]!
  return { isError: result.isError, data: JSON.parse(first.text) as Record<string, unknown> }
}

describe("the MCP server", () => {
  it("lists all eight tools, each marked read-only", async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["compliance_deadlines", "india_holidays", "lookup_pincode", "state_info", "validate_aadhaar_format", "validate_gstin", "validate_ifsc", "validate_pan"].sort(),
    )
    for (const tool of tools) {
      expect(tool.description!.length).toBeGreaterThan(40)
      expect(tool.annotations?.readOnlyHint).toBe(true)
    }
  })

  it("validates a real GSTIN and rejects a fake one that looks right", async () => {
    expect((await call("validate_gstin", { gstin: "29AAGCB7383J1Z4" })).data).toMatchObject({ valid_format: true, state: "Karnataka" })
    const fake = (await call("validate_gstin", { gstin: "29AAGCB7383J1Z5" })).data
    expect(fake.valid_format).toBe(false)
    expect(String((fake.errors as string[])[0])).toContain("should be 4")
    expect(String(fake.note)).toContain("does NOT prove")
  })

  it("never returns more than the last four Aadhaar digits", async () => {
    const { data } = await call("validate_aadhaar_format", { aadhaar: "2345 6789 0123" })
    expect(JSON.stringify(data)).not.toContain("23456789")
    expect(data.masked).toBe("XXXX XXXX 0123")
  })

  it("answers the lookup and calendar tools", async () => {
    expect((await call("lookup_pincode", { pincode: "302001" })).data).toMatchObject({ found: true, state: "Rajasthan" })
    expect((await call("state_info", { query: "27" })).data).toMatchObject({ found: true })
    expect(((await call("state_info", {})).data.states as unknown[]).length).toBe(36)
    expect((await call("india_holidays", { date: "2026-08-15" })).data).toMatchObject({ is_central_government_holiday: true })
    expect((await call("india_holidays", { year: 2031 })).data).toMatchObject({ covered: false })
    const deadlines = (await call("compliance_deadlines", { from: "2026-11-01", to: "2026-11-30", categories: ["gst"] })).data
    expect((deadlines.deadlines as { form: string }[]).some((d) => d.form === "GSTR-3B")).toBe(true)
  })

  it("rejects bad input instead of guessing", async () => {
    const empty = await client.callTool({ name: "validate_gstin", arguments: { gstin: "" } })
    expect(empty.isError).toBe(true)
    const wrongType = await client.callTool({ name: "lookup_pincode", arguments: { pincode: 110001 } })
    expect(wrongType.isError).toBe(true)
    const badDate = await call("compliance_deadlines", { from: "2026-02-30" })
    expect(badDate.isError).toBe(true)
    expect(badDate.data).toHaveProperty("error")
    const badHoliday = await call("india_holidays", { date: "tomorrow" })
    expect(badHoliday.isError).toBe(true)
    // A normal answer is never marked as an error.
    expect((await call("validate_gstin", { gstin: "29AAGCB7383J1Z5" })).isError).toBeFalsy()
    expect((await call("lookup_pincode", { pincode: "999999" })).isError).toBeFalsy()
  })
})
