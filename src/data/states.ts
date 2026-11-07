import { loadData } from "./loader.js"

export type StateRecord = {
  name: string
  iso: string
  type: "state" | "union_territory"
  gst_code: string
  rto_prefixes: string[]
  capital: string
  gst_qrmp_due_day: 22 | 24
}

type StatesFile = {
  _meta: { dataset: string; as_of: string; sources: string[]; notes: string[] }
  states: StateRecord[]
  gst_special_codes: { code: string; name: string }[]
  postal_zones: Record<string, string>
}

export const statesFile = () => loadData<StatesFile>("states.json")

const clean = (value: string) => value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim()

/** Other names and older codes people still use. */
const ALIASES: Record<string, string> = {
  "new delhi": "Delhi",
  "nct of delhi": "Delhi",
  "national capital territory of delhi": "Delhi",
  orissa: "Odisha",
  pondicherry: "Puducherry",
  uttaranchal: "Uttarakhand",
  chattisgarh: "Chhattisgarh",
  "andaman and nicobar": "Andaman and Nicobar Islands",
  "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
  "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
  "jammu kashmir": "Jammu and Kashmir",
  "in ct": "Chhattisgarh",
  "in or": "Odisha",
  "in tg": "Telangana",
  "in ut": "Uttarakhand",
}

/** Name, alias, ISO code, GST code or RTO prefix to a state or union territory. A vague word that fits several is not guessed. */
export function findState(query: string): StateRecord | undefined {
  const q = clean(query)
  if (!q) return undefined
  const { states } = statesFile()
  const upper = query.trim().toUpperCase()
  const exact =
    states.find((s) => clean(s.name) === q) ??
    states.find((s) => clean(s.name) === clean(ALIASES[q] ?? "")) ??
    states.find((s) => s.iso === upper) ??
    states.find((s) => s.iso === `IN-${upper}`) ??
    states.find((s) => /^\d{1,2}$/.test(query.trim()) && s.gst_code === query.trim().padStart(2, "0")) ??
    states.find((s) => s.rto_prefixes.includes(upper))
  if (exact) return exact
  if (q.length < 4) return undefined
  const partial = states.filter((s) => clean(s.name).includes(q))
  return partial.length === 1 ? partial[0] : undefined
}

export function stateByGstCode(code: string): { name: string; legacy?: boolean; special?: boolean } | undefined {
  const file = statesFile()
  const state = file.states.find((s) => s.gst_code === code)
  if (state) return { name: state.name }
  const special = file.gst_special_codes.find((s) => s.code === code)
  if (special) return { name: special.name, legacy: code === "25" || code === "28", special: code === "97" || code === "99" }
  return undefined
}
