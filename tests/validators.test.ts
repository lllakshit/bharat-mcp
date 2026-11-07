import { describe, expect, it } from "vitest"
import { validateAadhaarFormat } from "../src/validators/aadhaar.js"
import { gstinCheckCharacter, validateGstin } from "../src/validators/gstin.js"
import { validateIfsc } from "../src/validators/ifsc.js"
import { validatePan } from "../src/validators/pan.js"
import { verhoeffCheckDigit, verhoeffValid } from "../src/validators/verhoeff.js"

describe("verhoeff", () => {
  it("matches the published reference vectors", () => {
    expect(verhoeffCheckDigit("236")).toBe(3)
    expect(verhoeffCheckDigit("75872")).toBe(2)
    expect(verhoeffCheckDigit("12345")).toBe(1)
    expect(verhoeffCheckDigit("142857")).toBe(0)
    expect(verhoeffValid("2363")).toBe(true)
    expect(verhoeffValid("2364")).toBe(false)
  })
})

describe("validateGstin", () => {
  const valid = ["27AAPFU0939F1ZV", "29AAGCB7383J1Z4", "27AAACR5055K1Z7"]
  it.each(valid)("accepts %s", (gstin) => {
    const result = validateGstin(gstin)
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it("decodes the parts", () => {
    const result = validateGstin("29aagcb7383j1z4")
    expect(result).toMatchObject({ state_code: "29", state: "Karnataka", pan: "AAGCB7383J", holder_type: "Company", registration_number_in_state: 1 })
  })

  it("ignores spaces and hyphens", () => {
    expect(validateGstin("27 AAPFU 0939 F1ZV").valid).toBe(true)
    expect(validateGstin("27-AAPFU0939F1ZV").valid).toBe(true)
  })

  it("rejects a GSTIN with one wrong character (the case models wave through)", () => {
    for (const gstin of valid) {
      for (let i = 0; i < 15; i++) {
        const original = gstin[i]!
        // Only change a character to another one of the same kind, so the shape stays legal and only the checksum can catch it.
        const alphabet = /[0-9]/.test(original) ? "0123456789" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        const swap = alphabet[(alphabet.indexOf(original) + 1) % alphabet.length]!
        const broken = gstin.slice(0, i) + swap + gstin.slice(i + 1)
        expect(validateGstin(broken).valid, `${broken} should be invalid`).toBe(false)
      }
    }
  })

  it("explains a wrong check character", () => {
    const result = validateGstin("27AAPFU0939F1Z1")
    expect(result.valid).toBe(false)
    expect(result.errors.join(" ")).toContain("should be V")
  })

  it("rejects wrong length, shape and state code", () => {
    expect(validateGstin("27AAPFU0939F1Z").valid).toBe(false)
    expect(validateGstin("27AAPFU0939F1ZVV").valid).toBe(false)
    expect(validateGstin("ABAAPFU0939F1ZV").valid).toBe(false)
    expect(validateGstin("27AAPFU0939F1AV").valid).toBe(false)
    const unknownState = "39AAPFU0939F1Z" + gstinCheckCharacter("39AAPFU0939F1Z")
    const result = validateGstin(unknownState)
    expect(result.valid).toBe(false)
    expect(result.errors.join(" ")).toContain("not a GST state code")
  })

  it("accepts the special GST codes 97 and 99", () => {
    for (const code of ["97", "99"]) {
      const first14 = `${code}AAPFU0939F1Z`
      expect(validateGstin(first14 + gstinCheckCharacter(first14)).valid).toBe(true)
    }
  })

  it("rejects a PAN with an unknown holder type inside a GSTIN", () => {
    const first14 = "27AAPKU0939F1Z"
    const result = validateGstin(first14 + gstinCheckCharacter(first14))
    expect(result.valid).toBe(false)
    expect(result.errors.join(" ")).toContain("PAN inside the GSTIN")
  })
})

describe("validatePan", () => {
  it.each([
    ["ABCPE1234F", "P", "Individual (person)"],
    ["AAACR5055K", "C", "Company"],
    ["AAAFX1234Z", "F", "Firm or Limited Liability Partnership"],
    ["AAAHA1234B", "H", "Hindu Undivided Family (HUF)"],
    ["AAATA1234B", "T", "Trust (AOP)"],
    ["AAAGA1234B", "G", "Government"],
  ])("accepts %s", (pan, code, type) => {
    expect(validatePan(pan)).toMatchObject({ valid: true, holder_type_code: code, holder_type: type })
  })

  it("normalises case and spaces", () => {
    expect(validatePan(" abcpe 1234f ")).toMatchObject({ valid: true, pan: "ABCPE1234F" })
  })

  it("rejects bad shapes", () => {
    for (const pan of ["", "ABCPE1234", "ABCPE12345", "ABCPE1234FF", "1BCPE1234F", "ABCPEA234F", "ABCPE1234 1"]) {
      expect(validatePan(pan).valid, pan).toBe(false)
    }
  })

  it("rejects an unknown holder type", () => {
    const result = validatePan("ABCKE1234F")
    expect(result.valid).toBe(false)
    expect(result.errors.join(" ")).toContain("not a recognised holder type")
  })
})

describe("validateAadhaarFormat", () => {
  const withCheck = (payload: string) => payload + verhoeffCheckDigit(payload)

  it("accepts a number with a correct Verhoeff digit, with or without spaces", () => {
    const number = withCheck("23456789012")
    expect(number).toHaveLength(12)
    expect(validateAadhaarFormat(number).valid_format).toBe(true)
    expect(validateAadhaarFormat(`${number.slice(0, 4)} ${number.slice(4, 8)} ${number.slice(8)}`).valid_format).toBe(true)
  })

  it("only ever returns the last four digits", () => {
    const number = withCheck("23456789012")
    const result = validateAadhaarFormat(number)
    expect(result.masked).toBe(`XXXX XXXX ${number.slice(-4)}`)
    expect(JSON.stringify(result)).not.toContain(number)
    expect(JSON.stringify(validateAadhaarFormat("12345"))).not.toContain("12345")
  })

  it("catches every single-digit mistake and every swap of neighbouring digits", () => {
    const number = withCheck("49876543210")
    for (let i = 0; i < 12; i++) {
      for (const digit of "0123456789") {
        if (digit === number[i]) continue
        const broken = number.slice(0, i) + digit + number.slice(i + 1)
        // A leading 0 or 1 is rejected for a different reason, which is also correct.
        expect(validateAadhaarFormat(broken).valid_format, broken).toBe(false)
      }
    }
    for (let i = 0; i < 11; i++) {
      if (number[i] === number[i + 1]) continue
      const swapped = number.slice(0, i) + number[i + 1] + number[i] + number.slice(i + 2)
      expect(validateAadhaarFormat(swapped).valid_format, swapped).toBe(false)
    }
  })

  it("rejects wrong length, letters and a leading 0 or 1", () => {
    expect(validateAadhaarFormat("2345678901").valid_format).toBe(false)
    expect(validateAadhaarFormat("2345678901234").valid_format).toBe(false)
    expect(validateAadhaarFormat("23456789012A").valid_format).toBe(false)
    expect(validateAadhaarFormat(withCheck("03456789012")).valid_format).toBe(false)
    expect(validateAadhaarFormat(withCheck("13456789012")).valid_format).toBe(false)
  })
})

describe("validateIfsc", () => {
  it("accepts a well-formed code and names a known bank", () => {
    expect(validateIfsc("sbin0001234")).toMatchObject({ valid_format: true, ifsc: "SBIN0001234", bank_code: "SBIN", bank_name: "State Bank of India", branch_code: "001234" })
  })

  it("accepts an unknown bank code but gives no name", () => {
    const result = validateIfsc("ZZZZ0ABC123")
    expect(result.valid_format).toBe(true)
    expect(result.bank_name).toBeUndefined()
  })

  it("rejects bad shapes, including a non-zero fifth character", () => {
    for (const code of ["SBIN1001234", "SBIN000123", "SBI00001234", "SBIN00012345", "1BIN0001234", ""]) {
      expect(validateIfsc(code).valid_format, code).toBe(false)
    }
  })
})
