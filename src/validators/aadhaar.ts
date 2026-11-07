import { verhoeffValid } from "./verhoeff.js"

export type AadhaarResult = {
  valid_format: boolean
  /** Only the last 4 digits are ever returned. */
  masked: string
  errors: string[]
}

/**
 * Format check only: 12 digits, not starting with 0 or 1, passing the Verhoeff checksum. Nothing is stored,
 * logged or looked up, and a pass does not mean the number was issued to anyone.
 */
export function validateAadhaarFormat(input: string): AadhaarResult {
  const digits = input.replace(/[\s-]+/g, "")
  // The last four digits are shown only for a full 12-digit number; anything else is masked completely.
  const masked = digits.length === 12 && /^\d+$/.test(digits) ? `XXXX XXXX ${digits.slice(-4)}` : "XXXX XXXX XXXX"
  const errors: string[] = []
  if (!/^\d+$/.test(digits)) {
    errors.push("An Aadhaar number has digits only (spaces and hyphens are ignored).")
    return { valid_format: false, masked: "XXXX XXXX XXXX", errors }
  }
  if (digits.length !== 12) errors.push(`An Aadhaar number has 12 digits; this has ${digits.length}.`)
  if (digits.length > 0 && (digits[0] === "0" || digits[0] === "1")) errors.push("An Aadhaar number never starts with 0 or 1.")
  if (digits.length === 12 && !verhoeffValid(digits)) errors.push("The Verhoeff check digit does not match.")
  return { valid_format: errors.length === 0, masked, errors }
}
