/** Well-known bank codes (first 4 letters of an IFSC). Names are informational, not a full RBI list. */
export const BANK_CODES: Record<string, string> = {
  SBIN: "State Bank of India",
  HDFC: "HDFC Bank",
  ICIC: "ICICI Bank",
  UTIB: "Axis Bank",
  PUNB: "Punjab National Bank",
  BARB: "Bank of Baroda",
  CNRB: "Canara Bank",
  UBIN: "Union Bank of India",
  IDIB: "Indian Bank",
  KKBK: "Kotak Mahindra Bank",
  YESB: "Yes Bank",
  INDB: "IndusInd Bank",
  IOBA: "Indian Overseas Bank",
  MAHB: "Bank of Maharashtra",
  CBIN: "Central Bank of India",
  BKID: "Bank of India",
  SIBL: "South Indian Bank",
  FDRL: "Federal Bank",
  KARB: "Karnataka Bank",
  UCBA: "UCO Bank",
  IDFB: "IDFC FIRST Bank",
  IBKL: "IDBI Bank",
  SCBL: "Standard Chartered Bank",
  HSBC: "HSBC",
  PSIB: "Punjab & Sind Bank",
  RATN: "RBL Bank",
  DCBL: "DCB Bank",
  AUBL: "AU Small Finance Bank",
  CIUB: "City Union Bank",
  KVBL: "Karur Vysya Bank",
  TMBL: "Tamilnad Mercantile Bank",
  JAKA: "Jammu & Kashmir Bank",
  DLXB: "Dhanlaxmi Bank",
}

export type IfscResult = {
  valid_format: boolean
  ifsc: string
  errors: string[]
  bank_code?: string
  bank_name?: string
  branch_code?: string
}

export const normaliseIfsc = (input: string) => input.replace(/\s+/g, "").toUpperCase()

/** Format check and bank-code decoding. It does not confirm the branch exists: that needs the live RBI list. */
export function validateIfsc(input: string): IfscResult {
  const ifsc = normaliseIfsc(input)
  const errors: string[] = []
  if (ifsc.length !== 11) errors.push(`An IFSC has 11 characters; this has ${ifsc.length}.`)
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    errors.push("An IFSC is 4 bank letters, the digit 0, then 6 letters or digits for the branch (for example SBIN0001234).")
    return { valid_format: false, ifsc, errors }
  }
  const bank_code = ifsc.slice(0, 4)
  return { valid_format: true, ifsc, errors: [], bank_code, bank_name: BANK_CODES[bank_code], branch_code: ifsc.slice(5) }
}
