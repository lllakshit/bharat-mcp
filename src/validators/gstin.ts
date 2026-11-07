import { stateByGstCode } from "../data/states.js"
import { upperAscii, validatePan } from "./pan.js"

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

export type GstinResult = {
  valid_format: boolean
  gstin: string
  errors: string[]
  state_code?: string
  state?: string
  pan?: string
  holder_type?: string
  registration_number_in_state?: number
  expected_check_character?: string
  provided_check_character?: string
}

export const normaliseGstin = (input: string) => upperAscii(input.replace(/[\s-]+/g, ""))

/** The GSTIN check character: a mod-36 checksum over the first 14 characters. */
export function gstinCheckCharacter(first14: string): string {
  let sum = 0
  for (let i = 0; i < first14.length; i++) {
    const value = CHARSET.indexOf(first14[i]!)
    const product = value * (i % 2 === 0 ? 1 : 2)
    sum += Math.floor(product / 36) + (product % 36)
  }
  return CHARSET[(36 - (sum % 36)) % 36]!
}

/**
 * Structure and checksum only, for regular-taxpayer GSTINs. `valid_format: true` means "well formed", never "registered":
 * whether a GSTIN exists, is active or belongs to a given business can only be answered by the GST portal.
 */
export function validateGstin(input: string): GstinResult {
  const gstin = normaliseGstin(input)
  const errors: string[] = []
  if (gstin.length !== 15) {
    errors.push(`A GSTIN has 15 characters; this has ${gstin.length}.`)
    return { valid_format: false, gstin, errors }
  }
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
    errors.push(
      "A regular GSTIN is: 2-digit state code, 10-character PAN, 1 entity number (1-9 or A-Z), the letter Z, and 1 check character.",
    )
    if (/^[0-9]{2}[A-Z0-9]{11}[A-Z][A-Z0-9]$/.test(gstin) && gstin[13] !== "Z") {
      errors.push(
        "The 14th character is not Z. Other ID formats exist (for example TDS and TCS deductors, UN bodies and embassies, and non-resident online service providers) and are not supported here, so this does not prove the number is fake.",
      )
    }
    return { valid_format: false, gstin, errors }
  }

  const stateCode = gstin.slice(0, 2)
  const state = stateByGstCode(stateCode)
  if (!state) errors.push(`"${stateCode}" is not a GST state code.`)

  const pan = gstin.slice(2, 12)
  const panResult = validatePan(pan)
  if (!panResult.valid_format) errors.push(`The PAN inside the GSTIN is not valid: ${panResult.errors.join(" ")}`)

  const expected = gstinCheckCharacter(gstin.slice(0, 14))
  const provided = gstin[14]!
  if (expected !== provided) errors.push(`The check character is wrong: it should be ${expected}, not ${provided}.`)

  const entity = gstin[12]!
  return {
    valid_format: errors.length === 0,
    gstin,
    errors,
    state_code: stateCode,
    state: state?.name,
    pan,
    holder_type: panResult.holder_type,
    registration_number_in_state: CHARSET.indexOf(entity),
    expected_check_character: expected,
    provided_check_character: provided,
  }
}
