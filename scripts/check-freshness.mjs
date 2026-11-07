// Reports data that has gone stale. Exit code 1 means "open an issue".
import { readFileSync } from "node:fs"

const read = (name) => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8"))
const today = new Date()
const daysSince = (iso) => Math.floor((today - new Date(`${iso}T00:00:00Z`)) / 86_400_000)
const problems = []

const compliance = read("compliance.json")._meta
if (daysSince(compliance.as_of) > 90) problems.push(`compliance.json was last checked ${daysSince(compliance.as_of)} days ago (${compliance.as_of}). Re-check it against the GST portal, the Income Tax portal and MCA, and look for new extensions.`)

const holidays = read("holidays.json")
const nextYear = String(today.getUTCFullYear() + 1)
if (today.getUTCMonth() >= 7 && !holidays.years[nextYear]) problems.push(`holidays.json has no ${nextYear} list yet. DoPT publishes it around July: add it.`)

const pincodes = read("pincodes.json")._meta
if (daysSince(pincodes.as_of) > 365) problems.push(`pincodes.json was downloaded ${daysSince(pincodes.as_of)} days ago (${pincodes.as_of}). Download the latest IN.zip from https://download.geonames.org/export/zip/ and rebuild it with scripts/build-pincodes.mjs.`)

if (problems.length === 0) console.log("Data is fresh.")
else {
  console.log(problems.map((p) => `- ${p}`).join("\n"))
  process.exit(1)
}
