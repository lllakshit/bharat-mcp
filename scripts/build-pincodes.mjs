// Builds data/pincodes.json from the GeoNames postal code file for India (IN.txt from https://download.geonames.org/export/zip/IN.zip),
// which is licensed Creative Commons Attribution 4.0. Usage: node scripts/build-pincodes.mjs path/to/IN.txt [download-date]
import { readFileSync, writeFileSync } from "node:fs"

const [, , tsvPath, downloaded = new Date().toISOString().slice(0, 10)] = process.argv
if (!tsvPath) {
  console.error("Usage: node scripts/build-pincodes.mjs path/to/IN.txt [download-date]")
  process.exit(1)
}

// GeoNames spells a few states differently, and Ladakh sits under Jammu & Kashmir. Map them to today's names.
const STATE_FIX = { "Andaman & Nicobar Islands": "Andaman and Nicobar Islands", Pondicherry: "Puducherry" }
const LADAKH_DISTRICTS = new Set(["Leh", "Kargil"])
const canonicalState = (state, district) =>
  state === "Jammu & Kashmir" ? (LADAKH_DISTRICTS.has(district) ? "Ladakh" : "Jammu and Kashmir") : (STATE_FIX[state] ?? state)

const known = new Set(JSON.parse(readFileSync(new URL("../data/states.json", import.meta.url), "utf8")).states.map((s) => s.name))
const records = {}
let rows = 0
for (const line of readFileSync(tsvPath, "utf8").split("\n")) {
  const c = line.split("\t")
  const pin = c[1]?.trim()
  if (!/^[1-9][0-9]{5}$/.test(pin ?? "")) continue
  rows++
  const district = (c[5] ?? "").trim()
  const state = canonicalState((c[3] ?? "").trim(), district)
  if (!known.has(state)) throw new Error(`Unmapped state "${c[3]}" for ${pin}`)
  const rec = (records[pin] ??= { state, district, offices: [] })
  const office = (c[2] ?? "").trim()
  if (office && !rec.offices.includes(office)) rec.offices.push(office)
  if (district && !rec.district.split(" / ").includes(district)) rec.district = rec.district ? `${rec.district} / ${district}` : district
}

const sorted = Object.fromEntries(Object.entries(records).sort(([a], [b]) => a.localeCompare(b)))
writeFileSync(
  new URL("../data/pincodes.json", import.meta.url),
  JSON.stringify({
    _meta: {
      dataset: "pincodes",
      as_of: downloaded,
      source: "GeoNames postal codes for India (geonames.org), built from the India Post pincode list",
      licence: "Creative Commons Attribution 4.0 (CC BY 4.0)",
      attribution: "Postal code data from GeoNames (https://www.geonames.org), licensed CC BY 4.0",
      count: Object.keys(sorted).length,
    },
    records: sorted,
  }),
)
console.log(`Wrote ${Object.keys(sorted).length} pincodes from ${rows} rows`)
