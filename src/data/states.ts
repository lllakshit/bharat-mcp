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

/** Name, ISO code, GST code or RTO prefix to a state or union territory. */
export function findState(query: string): StateRecord | undefined {
  const q = clean(query)
  if (!q) return undefined
  const { states } = statesFile()
  const upper = query.trim().toUpperCase()
  return (
    states.find((s) => clean(s.name) === q) ??
    states.find((s) => s.iso === upper) ??
    states.find((s) => s.iso === `IN-${upper}`) ??
    states.find((s) => s.gst_code === query.trim().padStart(2, "0") && /^\d{1,2}$/.test(query.trim())) ??
    states.find((s) => s.rto_prefixes.includes(upper)) ??
    states.find((s) => clean(s.name).includes(q) && q.length >= 4)
  )
}

export function stateByGstCode(code: string): { name: string; legacy?: boolean; special?: boolean } | undefined {
  const file = statesFile()
  const state = file.states.find((s) => s.gst_code === code)
  if (state) return { name: state.name }
  const special = file.gst_special_codes.find((s) => s.code === code)
  if (special) return { name: special.name, legacy: code === "25" || code === "28", special: code === "97" || code === "99" }
  return undefined
}
