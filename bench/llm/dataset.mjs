// Builds the GSTIN test set for the model benchmark: half real-shaped GSTINs with a correct check character, half with exactly
// one character changed. All are synthetic (generated, not copied from any business) and every case is re-checked with the
// package's own validator, so the "answer key" is the checksum, not an opinion.
import { writeFileSync } from "node:fs"
import { gstinCheckCharacter, validateGstin } from "../../dist/validators/gstin.js"
import { PAN_HOLDER_TYPES } from "../../dist/validators/pan.js"

let seed = 20261107
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
const pick = (s) => s[Math.floor(rand() * s.length)]
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const DIGITS = "0123456789"
const STATE_CODES = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "18", "19", "20", "21", "22", "23", "24", "27", "29", "30", "32", "33", "34", "36", "37"]

function makeValid() {
  const pan = Array.from({ length: 3 }, () => pick(LETTERS)).join("") + pick(Object.keys(PAN_HOLDER_TYPES)) + pick(LETTERS) +
    Array.from({ length: 4 }, () => pick(DIGITS)).join("") + pick(LETTERS)
  const first14 = pick(STATE_CODES) + pan + pick("123456789") + "Z"
  return first14 + gstinCheckCharacter(first14)
}

function corrupt(gstin) {
  // Change one character to another of the same kind, so the shape stays legal and only the checksum can tell.
  for (;;) {
    const i = rand() < 0.4 ? 14 : Math.floor(rand() * 14)
    if (i === 13) continue // keep the fixed letter Z
    const c = gstin[i]
    const pool = /[0-9]/.test(c) ? DIGITS : LETTERS
    const next = pick(pool)
    if (next === c) continue
    const broken = gstin.slice(0, i) + next + gstin.slice(i + 1)
    if (!validateGstin(broken).valid_format && validateGstin(broken).errors.every((e) => e.includes("check character"))) return { broken, position: i + 1 }
  }
}

const cases = []
for (let n = 0; n < 20; n++) {
  const valid = makeValid()
  cases.push({ gstin: valid, expected: "VALID", kind: "correct" })
  const { broken, position } = corrupt(makeValid())
  cases.push({ gstin: broken, expected: "INVALID", kind: `one character changed (position ${position})` })
}
for (const c of cases) {
  const truth = validateGstin(c.gstin).valid_format ? "VALID" : "INVALID"
  if (truth !== c.expected) throw new Error(`Answer key disagrees with the checksum for ${c.gstin}`)
}
// Shuffle with the same seed so valid and invalid cases are interleaved.
for (let i = cases.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1))
  ;[cases[i], cases[j]] = [cases[j], cases[i]]
}
writeFileSync(new URL("./gstin-cases.json", import.meta.url), JSON.stringify({ generated_with_seed: 20261107, count: cases.length, cases }, null, 2) + "\n")
console.log(`Wrote ${cases.length} cases (${cases.filter((c) => c.expected === "VALID").length} valid, ${cases.filter((c) => c.expected === "INVALID").length} invalid)`)
