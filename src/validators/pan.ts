export const PAN_HOLDER_TYPES: Record<string, string> = {
  A: "Association of Persons (AOP)",
  B: "Body of Individuals (BOI)",
  C: "Company",
  F: "Firm or Limited Liability Partnership",
  G: "Government",
  H: "Hindu Undivided Family (HUF)",
  J: "Artificial Juridical Person",
  L: "Local Authority",
  P: "Individual (person)",
  T: "Trust (AOP)",
}

export type PanResult = {
  valid_format: boolean
  pan: string
  errors: string[]
  holder_type_code?: string
  holder_type?: string
  fifth_character_meaning?: string
}

/** Upper-cases ASCII letters only, so look-alike Unicode characters are never folded into valid ones. */
export const upperAscii = (value: string) => value.replace(/[a-z]/g, (c) => c.toUpperCase())

export const normalisePan = (input: string) => upperAscii(input.replace(/\s+/g, ""))

/** Format and holder-type check only. It cannot tell whether a PAN was ever issued or who owns it. */
export function validatePan(input: string): PanResult {
  const pan = normalisePan(input)
  const errors: string[] = []
  if (pan.length !== 10) errors.push(`A PAN has 10 characters; this has ${pan.length}.`)
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
    errors.push("A PAN is 5 letters, 4 digits, then 1 letter (for example ABCPE1234F).")
    return { valid_format: false, pan, errors }
  }
  const code = pan[3]!
  const holder = PAN_HOLDER_TYPES[code]
  if (!holder) {
    errors.push(`The 4th character "${code}" is not a recognised holder type (${Object.keys(PAN_HOLDER_TYPES).join(", ")}).`)
    return { valid_format: false, pan, errors, holder_type_code: code }
  }
  return {
    valid_format: true,
    pan,
    errors: [],
    holder_type_code: code,
    holder_type: holder,
    fifth_character_meaning: code === "P" ? "First letter of the holder's surname" : "First letter of the holder's name",
  }
}
