import { z } from "zod"
import { complianceMeta, computeDeadlines, CATEGORIES } from "../deadlines.js"
import { addDays, isIsoDate, todayIst } from "../dates.js"
import { findState, statesFile } from "../data/states.js"
import { availableHolidayYears, holidayInfo, holidaysForYear, holidaysOn } from "../holidays.js"
import { lookupPincode } from "../pincode.js"
import { validateAadhaarFormat } from "../validators/aadhaar.js"
import { validateGstin } from "../validators/gstin.js"
import { validateIfsc } from "../validators/ifsc.js"
import { validatePan } from "../validators/pan.js"

/** What every tool returns is a plain object. The server wraps it as JSON text. */
export type ToolDefinition<S extends z.ZodRawShape = z.ZodRawShape> = {
  name: string
  title: string
  description: string
  inputSchema: S
  run: (input: z.infer<z.ZodObject<S>>) => unknown
}

const define = <S extends z.ZodRawShape>(tool: ToolDefinition<S>) => tool

const GSTIN_NOTE = "Well-formed means the structure and checksum are right. It does NOT prove the GSTIN is registered or active: check the GST portal for that."

export const tools = [
  define({
    name: "validate_gstin",
    title: "Validate a GSTIN",
    description:
      "Checks an Indian GSTIN offline: 15-character structure, state code, embedded PAN, and the mod-36 check character. Returns the decoded parts. Use this instead of guessing whether a GSTIN is well-formed; a model cannot calculate the check character reliably. Covers regular-taxpayer GSTINs (14th character Z); TDS/TCS, UN-body and non-resident formats are not supported. A pass only means well-formed, not registered or active.",
    inputSchema: { gstin: z.string().min(1).max(40).describe("The GSTIN, with or without spaces or hyphens") },
    run: ({ gstin }) => ({ ...validateGstin(gstin), note: GSTIN_NOTE }),
  }),
  define({
    name: "validate_pan",
    title: "Validate a PAN",
    description:
      "Checks an Indian PAN offline: the 5 letters, 4 digits, 1 letter shape and the holder type in the 4th character (individual, company, firm, HUF, trust and so on). A pass does not prove the PAN was issued or who owns it.",
    inputSchema: { pan: z.string().min(1).max(30).describe("The 10-character PAN") },
    run: ({ pan }) => ({ ...validatePan(pan), note: "Format and holder type only. Whether a PAN exists or belongs to a person can only be checked with the Income Tax Department." }),
  }),
  define({
    name: "validate_aadhaar_format",
    title: "Check an Aadhaar number's format",
    description:
      "Checks only the FORMAT of an Aadhaar number: 12 digits, not starting with 0 or 1, and the Verhoeff checksum. Nothing is stored, logged or looked up, and only the last 4 digits are returned. A pass does not mean the number was issued to anyone. Do not use this to identify people.",
    inputSchema: { aadhaar: z.string().min(1).max(30).describe("The 12-digit number, spaces allowed") },
    run: ({ aadhaar }) => ({ ...validateAadhaarFormat(aadhaar), note: "Format check only. Nothing is stored or looked up. This does not verify identity." }),
  }),
  define({
    name: "validate_ifsc",
    title: "Check an IFSC code's format",
    description:
      "Checks the format of an IFSC code (4 bank letters, a zero, 6 branch characters) and names the bank for well-known bank codes. It does not confirm that the branch exists or give the branch address.",
    inputSchema: { ifsc: z.string().min(1).max(30).describe("The 11-character IFSC") },
    run: ({ ifsc }) => ({ ...validateIfsc(ifsc), note: "Format and bank code only. Branch details need the live RBI list, which this server does not bundle." }),
  }),
  define({
    name: "lookup_pincode",
    title: "Look up an Indian pincode",
    description:
      "Returns the state, district and post offices for a 6-digit Indian pincode from the bundled GeoNames postal-code list (CC BY 4.0, built from the India Post list). District names can be older than the current official name, and a pincode created after the data date (see data_as_of) will not be found.",
    inputSchema: { pincode: z.string().min(1).max(12).describe("The 6-digit pincode") },
    run: ({ pincode }) => lookupPincode(pincode),
  }),
  define({
    name: "state_info",
    title: "State and union territory codes",
    description:
      "Looks up an Indian state or union territory by name, GST state code (for example 27), ISO code (IN-MH) or vehicle registration prefix (MH). Returns the GST code, RTO prefixes, capital, and the QRMP GSTR-3B due day group. With no query it lists all 36.",
    inputSchema: { query: z.string().max(80).optional().describe("A name, GST code, ISO code or RTO prefix. Leave out to list all.") },
    run: ({ query }) => {
      const file = statesFile()
      const meta = { data_as_of: file._meta.as_of, sources: file._meta.sources, notes: file._meta.notes }
      if (!query || !query.trim()) return { count: file.states.length, states: file.states, gst_special_codes: file.gst_special_codes, ...meta }
      const state = findState(query)
      if (state) return { found: true, state, ...meta }
      const special = file.gst_special_codes.find((item) => item.code === query.trim())
      if (special) return { found: true, gst_special_code: special, ...meta }
      return { found: false, query, reason: "No state, union territory, GST code, ISO code or RTO prefix matched.", ...meta }
    },
  }),
  define({
    name: "india_holidays",
    title: "Indian central government holidays",
    description:
      "Lists the Central Government closed (gazetted) holidays for a year, or checks whether a given date is one (if both are given, `date` is used). Covers 2026 and 2027, from the DoPT order. It does NOT include state holidays, bank holidays or stock-exchange holidays, and moon-dependent festival dates can shift by a day.",
    inputSchema: {
      year: z.number().int().min(2000).max(2100).optional().describe("The year, for example 2026"),
      date: z.string().optional().describe("A date YYYY-MM-DD to check instead of listing a year"),
    },
    run: ({ year, date }) => {
      if (date) {
        if (!isIsoDate(date)) return { error: "`date` must be a real date in YYYY-MM-DD form." }
        const y = Number(date.slice(0, 4))
        const known = holidaysForYear(y)
        if (!known) return { date, covered: false, reason: `Holiday data is bundled for ${availableHolidayYears().join(" and ")} only.`, available_years: availableHolidayYears() }
        const hits = holidaysOn(date)
        return { date, covered: true, is_central_government_holiday: hits.length > 0, holidays: hits, ...holidayInfo(y) }
      }
      const y = year ?? Number(todayIst().slice(0, 4))
      const list = holidaysForYear(y)
      if (!list) return { year: y, covered: false, reason: `Holiday data is bundled for ${availableHolidayYears().join(" and ")} only.`, available_years: availableHolidayYears() }
      return { year: y, covered: true, count: list.length, holidays: list, ...holidayInfo(y) }
    },
  }),
  define({
    name: "compliance_deadlines",
    title: "GST, TDS, ROC and payroll due dates",
    description:
      "Lists standard Indian compliance due dates (GST returns, TDS deposits and returns, advance tax, EPF/ESI, ROC filings) falling between two dates, with the legal basis and official authority for each. Defaults to the next 31 days from today in IST. Pass a state to get the right QRMP GSTR-3B date. These are the standard statutory dates; government extensions are not included, so always confirm with the official notification before relying on a date.",
    inputSchema: {
      from: z.string().optional().describe("Start date YYYY-MM-DD (default: today in IST)"),
      to: z.string().optional().describe("End date YYYY-MM-DD (default: 30 days after `from`)"),
      categories: z.array(z.enum(CATEGORIES as [string, ...string[]])).optional().describe("Limit to: gst, tds, income_tax, roc, labour"),
      state: z.string().max(80).optional().describe("State of GST registration, for the QRMP GSTR-3B date"),
    },
    run: ({ from, to, categories, state }) => {
      const start = from ?? todayIst()
      const end = to ?? addDays(start, 30)
      try {
        return computeDeadlines({ from: start, to: end, categories: categories as never, state })
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Could not work out the deadlines." }
      }
    },
  }),
] as const

export { complianceMeta }
