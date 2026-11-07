// Builds data/pincodes.json from the All India Pincode Directory CSV (India Post, published on data.gov.in under
// the Government Open Data License - India). Usage: node scripts/build-pincodes.mjs path/to/pincode.csv [as-of-date]
import { readFileSync, writeFileSync } from "node:fs"

const [, , csvPath, asOf = "2019-05-30"] = process.argv
if (!csvPath) {
  console.error("Usage: node scripts/build-pincodes.mjs path/to/pincode.csv [as-of-date]")
  process.exit(1)
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ",") (row.push(field), (field = ""))
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      field = ""
      if (row.length > 1) rows.push(row)
      row = []
    } else field += c
  }
  if (field || row.length) (row.push(field), rows.push(row))
  return rows
}

const title = (value) =>
  value
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bAnd\b/g, "and")
    .replace(/\bOf\b/g, "of")
    .trim()

// The source spells some states in short or old forms. Map them to today's names; Ladakh was part of Jammu and Kashmir in 2019.
const STATE_FIX = {
  "Andaman and Nico.In.": "Andaman and Nicobar Islands",
  Chattisgarh: "Chhattisgarh",
  "Dadra and Nagar Hav.": "Dadra and Nagar Haveli and Daman and Diu",
  "Daman and Diu": "Dadra and Nagar Haveli and Daman and Diu",
  Megalaya: "Meghalaya",
  Pondicherry: "Puducherry",
}
const LADAKH_DISTRICTS = new Set(["Leh", "Kargil", "Leh Ladakh", "Leh (Ladakh)"])
const canonicalState = (state, district) =>
  state === "Jammu and Kashmir" && LADAKH_DISTRICTS.has(district) ? "Ladakh" : (STATE_FIX[state] ?? state)

const [header, ...rows] = parseCsv(readFileSync(csvPath, "utf8").replace(/^﻿/, ""))
const col = Object.fromEntries(header.map((name, index) => [name.trim().toLowerCase(), index]))
for (const need of ["pincode", "office name", "district", "statename", "circle name", "officetype", "delivery"]) {
  if (!(need in col)) throw new Error(`Missing column: ${need}`)
}

const records = {}
for (const r of rows) {
  const pin = r[col.pincode]?.trim()
  if (!/^[1-9][0-9]{5}$/.test(pin ?? "")) continue
  const rec = (records[pin] ??= { state: canonicalState(title(r[col.statename]), title(r[col.district])), district: title(r[col.district]), circle: r[col["circle name"]].trim(), offices: [], delivery: false })
  const office = r[col["office name"]].trim()
  if (!rec.offices.includes(office)) rec.offices.push(office)
  if (r[col.delivery].trim().toLowerCase() === "delivery") rec.delivery = true
  const district = title(r[col.district])
  if (district && !rec.district.split(" / ").includes(district)) rec.district += ` / ${district}`
}

const sorted = Object.fromEntries(Object.entries(records).sort(([a], [b]) => a.localeCompare(b)))
writeFileSync(
  new URL("../data/pincodes.json", import.meta.url),
  JSON.stringify({
    _meta: {
      dataset: "pincodes",
      as_of: asOf,
      source: "All India Pincode Directory, India Post, via data.gov.in (Open Government Data Platform India)",
      licence: "Government Open Data License - India (GODL-India)",
      count: Object.keys(sorted).length,
    },
    records: sorted,
  }),
)
console.log(`Wrote ${Object.keys(sorted).length} pincodes from ${rows.length} rows`)
