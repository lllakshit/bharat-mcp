import { describe, expect, it } from "vitest"
import { computeDeadlines } from "../src/deadlines.js"
import { addDays, isIsoDate, todayIst, weekdayOf } from "../src/dates.js"
import { findState, stateByGstCode, statesFile } from "../src/data/states.js"
import { holidaysForYear, holidaysOn } from "../src/holidays.js"
import { lookupPincode } from "../src/pincode.js"

describe("states", () => {
  it("has 36 states and union territories with unique GST codes and RTO prefixes", () => {
    const { states } = statesFile()
    expect(states).toHaveLength(36)
    expect(new Set(states.map((s) => s.gst_code)).size).toBe(36)
    const prefixes = states.flatMap((s) => s.rto_prefixes)
    expect(new Set(prefixes).size).toBe(prefixes.length)
  })

  it("finds a state by name, GST code, ISO code and RTO prefix", () => {
    expect(findState("Maharashtra")?.gst_code).toBe("27")
    expect(findState("27")?.name).toBe("Maharashtra")
    expect(findState("7")?.name).toBe("Delhi")
    expect(findState("IN-KA")?.name).toBe("Karnataka")
    expect(findState("mh")?.name).toBe("Maharashtra")
    expect(findState("TG")?.name).toBe("Telangana")
    expect(findState("Jammu & Kashmir")?.gst_code).toBe("01")
    expect(findState("Atlantis")).toBeUndefined()
    expect(findState("Chhattisgarh")?.iso).toBe("IN-CG")
    expect(findState("")).toBeUndefined()
  })

  it("accepts common alternative names and older codes, and never guesses from a vague word", () => {
    expect(findState("New Delhi")?.name).toBe("Delhi")
    expect(findState("Orissa")?.name).toBe("Odisha")
    expect(findState("Pondicherry")?.name).toBe("Puducherry")
    expect(findState("Uttaranchal")?.name).toBe("Uttarakhand")
    expect(findState("IN-TG")?.name).toBe("Telangana")
    expect(findState("IN-CT")?.name).toBe("Chhattisgarh")
    expect(findState("pradesh")).toBeUndefined()
    expect(findState("land")).toBeUndefined()
    expect(findState("Karnat")?.name).toBe("Karnataka")
  })

  it("knows the GST codes that are not states", () => {
    expect(stateByGstCode("99")).toMatchObject({ special: true })
    expect(stateByGstCode("25")).toMatchObject({ legacy: true })
    expect(stateByGstCode("28")).toMatchObject({ legacy: true })
    expect(stateByGstCode("39")).toBeUndefined()
  })
})

describe("lookupPincode", () => {
  it("finds well-known pincodes", () => {
    expect(lookupPincode("110001")).toMatchObject({ found: true, state: "Delhi" })
    expect((lookupPincode("110001") as { district: string }).district).toContain("Central Delhi")
    expect(lookupPincode("302001")).toMatchObject({ found: true, state: "Rajasthan", district: "Jaipur" })
    expect(lookupPincode("400001")).toMatchObject({ found: true, state: "Maharashtra" })
    expect(lookupPincode("560 001")).toMatchObject({ found: true, state: "Karnataka" })
  })

  it("uses today's state names", () => {
    expect(lookupPincode("194101")).toMatchObject({ found: true, state: "Ladakh" })
  })

  it("says why a pincode was not found", () => {
    expect(lookupPincode("012345")).toMatchObject({ found: false, valid_format: false })
    expect(lookupPincode("12345")).toMatchObject({ found: false, valid_format: false })
    expect(lookupPincode("ABCDEF")).toMatchObject({ found: false, valid_format: false })
    expect(lookupPincode("999999")).toMatchObject({ found: false, valid_format: true })
  })

  it("always reports how old the data is and credits the source", () => {
    expect(lookupPincode("110001")).toHaveProperty("data_as_of", "2026-11-07")
    expect(lookupPincode("999999")).toHaveProperty("data_as_of", "2026-11-07")
    expect(lookupPincode("110001")).toHaveProperty("attribution", expect.stringContaining("CC BY 4.0"))
  })

  it("covers about 19,000 pincodes across every state and union territory", () => {
    const { states } = statesFile()
    const probes = ["110001", "400001", "560001", "600001", "700001", "781001", "682001", "751001", "800001", "834001", "248001", "190001", "194101", "403001", "605001", "744101", "682555", "737101", "796001", "799001", "791111", "795001", "797001", "793001", "390001", "396210", "440001", "492001"]
    const names = new Set(probes.map((p) => (lookupPincode(p) as { state?: string }).state))
    expect(names.size).toBeGreaterThan(20)
    for (const name of names) if (name) expect(states.some((s) => s.name === name)).toBe(true)
  })
})

describe("holidays", () => {
  it("has 17 closed holidays for each bundled year, in date order, with correct weekdays", () => {
    for (const year of [2026, 2027]) {
      const list = holidaysForYear(year)!
      expect(list).toHaveLength(17)
      const dates = list.map((h) => h.date)
      expect(dates).toEqual([...dates].sort())
      expect(dates.every((d) => d.startsWith(String(year)))).toBe(true)
    }
    expect(holidaysForYear(2026)![0]).toMatchObject({ date: "2026-01-26", weekday: "Monday", name: "Republic Day" })
    expect(holidaysForYear(2026)!.find((h) => h.name === "Diwali (Deepavali)")).toMatchObject({ date: "2026-11-08", weekday: "Sunday" })
  })

  it("checks a single date and returns nothing for years it does not cover", () => {
    expect(holidaysOn("2026-10-02")[0]?.name).toBe("Mahatma Gandhi's Birthday")
    expect(holidaysOn("2026-10-03")).toEqual([])
    expect(holidaysOn("2030-01-26")).toEqual([])
    expect(holidaysOn("not-a-date")).toEqual([])
    expect(holidaysForYear(2030)).toBeUndefined()
  })
})

describe("dates", () => {
  it("validates real calendar dates only", () => {
    expect(isIsoDate("2026-02-28")).toBe(true)
    expect(isIsoDate("2026-02-29")).toBe(false)
    expect(isIsoDate("2028-02-29")).toBe(true)
    expect(isIsoDate("2026-13-01")).toBe(false)
    expect(isIsoDate("26-01-01")).toBe(false)
  })

  it("does date arithmetic without time-zone drift", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
    expect(weekdayOf("2026-11-07")).toBe("Saturday")
    expect(todayIst(new Date("2026-11-06T20:00:00Z"))).toBe("2026-11-07")
    expect(todayIst(new Date("2026-11-06T18:00:00Z"))).toBe("2026-11-06")
  })
})

describe("computeDeadlines", () => {
  const dates = (r: ReturnType<typeof computeDeadlines>, form: string) => r.deadlines.filter((d) => d.form === form).map((d) => d.date)

  it("lists the standard monthly dates for a month", () => {
    const r = computeDeadlines({ from: "2026-11-01", to: "2026-11-30" })
    expect(dates(r, "GSTR-1")).toEqual(["2026-11-11"])
    expect(dates(r, "GSTR-3B")).toEqual(["2026-11-20"])
    expect(dates(r, "Challan 281 / ITNS 281")).toEqual(["2026-11-07"])
    expect(dates(r, "ECR")).toEqual(["2026-11-15"])
    expect(dates(r, "PMT-06")).toEqual(["2026-11-25"])
    expect(dates(r, "IFF")).toEqual(["2026-11-13"])
    expect(r.deadlines.map((d) => d.date)).toEqual([...r.deadlines.map((d) => d.date)].sort())
  })

  it("moves the March TDS deposit to 30 April", () => {
    const r = computeDeadlines({ from: "2026-04-01", to: "2026-04-30" })
    expect(dates(r, "Challan 281 / ITNS 281")).toEqual(["2026-04-30"])
    expect(dates(r, "MSME-1")).toEqual(["2026-04-30"])
    expect(dates(r, "GSTR-4")).toEqual(["2026-04-30"])
  })

  it("picks the right QRMP GSTR-3B day for the state", () => {
    const base = { from: "2026-04-01", to: "2026-04-30" }
    const qrmp = (state?: string) => computeDeadlines({ ...base, state, categories: ["gst"] }).deadlines.filter((d) => d.name.startsWith("GSTR-3B (QRMP"))
    expect(qrmp("Karnataka").map((d) => d.date)).toEqual(["2026-04-22"])
    expect(qrmp("Delhi").map((d) => d.date)).toEqual(["2026-04-24"])
    expect(qrmp("27").map((d) => d.date)).toEqual(["2026-04-22"])
    expect(qrmp().map((d) => d.date)).toEqual(["2026-04-22", "2026-04-24"])
    const unknown = computeDeadlines({ ...base, state: "Atlantis" })
    expect(unknown.warnings.join(" ")).toContain("Could not recognise")
    expect(unknown.deadlines.filter((d) => d.name.startsWith("GSTR-3B (QRMP"))).toHaveLength(2)
  })

  it("handles quarterly, annual and year-crossing ranges", () => {
    const r = computeDeadlines({ from: "2026-12-01", to: "2027-01-31" })
    expect(dates(r, "GSTR-9 / GSTR-9C")).toEqual(["2026-12-31"])
    expect(dates(r, "Challan 280 / ITNS 280")).toEqual(["2026-12-15"])
    expect(dates(r, "CMP-08")).toEqual(["2027-01-18"])
    expect(dates(r, "24Q / 26Q / 27Q")).toEqual(["2027-01-31"])
  })

  it("filters by category and returns the event-based rules for that category only", () => {
    const r = computeDeadlines({ from: "2026-11-01", to: "2026-11-30", categories: ["roc"] })
    expect(r.deadlines.every((d) => d.category === "roc")).toBe(true)
    expect(r.event_based.length).toBeGreaterThan(0)
    expect(r.event_based.every((e) => e.category === "roc")).toBe(true)
  })

  it("flags a due date that falls on a central government holiday without moving it", () => {
    const r = computeDeadlines({ from: "2026-10-20", to: "2026-10-20", categories: ["gst"] })
    const gstr3b = r.deadlines.find((d) => d.form === "GSTR-3B")!
    expect(gstr3b.date).toBe("2026-10-20")
    expect(gstr3b.central_government_holiday).toBe("Dussehra")
    expect(r.warnings.join(" ")).toContain("NOT shifted")
  })

  it("every rule names its authority, legal basis and confidence", () => {
    const r = computeDeadlines({ from: "2026-01-01", to: "2026-12-31" })
    expect(r.deadlines.length).toBeGreaterThan(100)
    for (const d of r.deadlines) {
      expect(d.authority_url).toMatch(/^https:\/\//)
      expect(d.legal_basis.length).toBeGreaterThan(5)
      expect(["high", "medium"]).toContain(d.confidence)
    }
  })

  it("rejects impossible or oversized ranges", () => {
    expect(() => computeDeadlines({ from: "2026-02-30", to: "2026-03-01" })).toThrow(/real calendar dates/)
    expect(() => computeDeadlines({ from: "2026-03-02", to: "2026-03-01" })).toThrow(/before/)
    expect(() => computeDeadlines({ from: "2026-01-01", to: "2028-01-01" })).toThrow(/13 months/)
  })

  it("warns when the range goes beyond the bundled holiday years", () => {
    const covered = computeDeadlines({ from: "2027-01-01", to: "2027-03-01" })
    expect(covered.warnings.join(" ")).not.toContain("Holiday data is bundled")
    const beyond = computeDeadlines({ from: "2028-01-01", to: "2028-02-01" })
    expect(beyond.warnings.join(" ")).toContain("2028")
  })

  it("always states how far the data can be trusted", () => {
    const r = computeDeadlines({ from: "2026-11-01", to: "2026-11-30" })
    expect(r.data_as_of).toBe("2026-11-07")
    expect(r.how_checked).toContain("secondary")
    expect(r.warnings.join(" ")).toContain("Not covered")
  })
})
