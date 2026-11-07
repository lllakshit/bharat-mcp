import { addDays, daysInMonth, isIsoDate, toIso, weekdayOf } from "./dates.js"
import { loadData } from "./data/loader.js"
import { findState } from "./data/states.js"
import { holidaysOn } from "./holidays.js"

export type Category = "gst" | "tds" | "income_tax" | "roc" | "labour"

type DeadlineRule = {
  id: string
  name: string
  category: Category
  form: string
  applies_to: string
  months: number[]
  day: number
  day_overrides?: Record<string, number>
  variants?: "gst_qrmp_state_group"
  period: string
  authority: string
  authority_url: string
  legal_basis: string
  confidence: "high" | "medium"
  notes?: string
}

type EventRule = {
  id: string
  name: string
  category: Category
  form: string
  rule: string
  legal_basis: string
  authority: string
  authority_url: string
  confidence: "high" | "medium"
}

type ComplianceFile = {
  _meta: { as_of: string; status: string; how_checked: string; scope_note: string; not_included: string[]; qrmp_note: string }
  deadlines: DeadlineRule[]
  event_based: EventRule[]
}

const file = () => loadData<ComplianceFile>("compliance.json")

export const CATEGORIES: Category[] = ["gst", "tds", "income_tax", "roc", "labour"]

export type Deadline = {
  date: string
  weekday: string
  name: string
  form: string
  category: Category
  applies_to: string
  period: string
  authority: string
  authority_url: string
  legal_basis: string
  confidence: "high" | "medium"
  central_government_holiday?: string
  notes?: string
}

export type DeadlineQuery = { from: string; to: string; categories?: Category[]; state?: string }

export type DeadlineResult = {
  from: string
  to: string
  deadlines: Deadline[]
  event_based: Omit<EventRule, "id">[]
  state_note?: string
  data_as_of: string
  status: string
  how_checked: string
  warnings: string[]
}

export function computeDeadlines(query: DeadlineQuery): DeadlineResult {
  if (!isIsoDate(query.from) || !isIsoDate(query.to)) throw new Error("Dates must be real calendar dates in YYYY-MM-DD form.")
  if (query.to < query.from) throw new Error("`to` must not be before `from`.")
  if (query.to > addDays(query.from, 400)) throw new Error("Ask for at most about 13 months at a time.")

  const data = file()
  const wanted = query.categories && query.categories.length > 0 ? new Set(query.categories) : null
  const warnings: string[] = []

  let stateDay: 22 | 24 | undefined
  let stateName: string | undefined
  if (query.state) {
    const state = findState(query.state)
    if (!state) warnings.push(`Could not recognise the state "${query.state}", so both QRMP GSTR-3B dates (22nd and 24th) are listed.`)
    else {
      stateDay = state.gst_qrmp_due_day
      stateName = state.name
    }
  }

  const [fy, fm] = query.from.split("-").map(Number) as [number, number]
  const [ty, tm] = query.to.split("-").map(Number) as [number, number]
  const found: Deadline[] = []

  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? (y++, (m = 1)) : m++) {
    for (const rule of data.deadlines) {
      if (wanted && !wanted.has(rule.category)) continue
      if (!rule.months.includes(m)) continue
      const base = rule.day_overrides?.[String(m)] ?? rule.day
      const days: { day: number; label?: string }[] =
        rule.variants === "gst_qrmp_state_group"
          ? stateDay
            ? [{ day: stateDay }]
            : [{ day: 22, label: "States in the first group (22nd)" }, { day: 24, label: "All other states (24th)" }]
          : [{ day: base }]
      for (const { day, label } of days) {
        const date = toIso(y, m, Math.min(day, daysInMonth(y, m)))
        if (date < query.from || date > query.to) continue
        const holiday = holidaysOn(date)[0]
        found.push({
          date,
          weekday: weekdayOf(date),
          name: label ? `${rule.name}, ${label}` : rule.name,
          form: rule.form,
          category: rule.category,
          applies_to: label ? `${rule.applies_to} ${stateName ? `(registered in ${stateName})` : ""}`.trim() : rule.applies_to,
          period: rule.period,
          authority: rule.authority,
          authority_url: rule.authority_url,
          legal_basis: rule.legal_basis,
          confidence: rule.confidence,
          ...(holiday ? { central_government_holiday: holiday.name } : {}),
          ...(rule.notes ? { notes: rule.notes } : {}),
        })
      }
    }
  }
  found.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))

  if (found.some((d) => d.weekday === "Sunday" || d.central_government_holiday)) {
    warnings.push("Some dates fall on a Sunday or a central government holiday. They are NOT shifted here; whether the next working day applies depends on the specific law.")
  }

  return {
    from: query.from,
    to: query.to,
    deadlines: found,
    event_based: data.event_based
      .filter((e) => !wanted || wanted.has(e.category))
      .map(({ id: _id, ...rest }) => rest),
    ...(stateName ? { state_note: `QRMP GSTR-3B dates use the group for ${stateName}.` } : {}),
    data_as_of: data._meta.as_of,
    status: data._meta.status,
    how_checked: data._meta.how_checked,
    warnings: [...warnings, ...data._meta.not_included.map((item) => `Not covered: ${item}.`)],
  }
}

export const complianceMeta = () => file()._meta
