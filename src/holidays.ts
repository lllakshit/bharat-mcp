import { isIsoDate, weekdayOf } from "./dates.js"
import { loadData } from "./data/loader.js"

type HolidaysFile = {
  _meta: { scope: string; not_included: string[]; retrieved: string; caveat: string }
  years: Record<string, { order: string; source: string; source_note: string; holidays: [string, string][] }>
}

export type Holiday = { date: string; weekday: string; name: string }

const file = () => loadData<HolidaysFile>("holidays.json")

export const availableHolidayYears = () => Object.keys(file().years).sort()

export function holidaysForYear(year: number): Holiday[] | undefined {
  const entry = file().years[String(year)]
  return entry?.holidays.map(([date, name]) => ({ date, weekday: weekdayOf(date), name }))
}

export function holidaysOn(date: string): Holiday[] {
  if (!isIsoDate(date)) return []
  return holidaysForYear(Number(date.slice(0, 4)))?.filter((holiday) => holiday.date === date) ?? []
}

export function holidayInfo(year: number) {
  const meta = file()._meta
  const entry = file().years[String(year)]
  return { scope: meta.scope, not_included: meta.not_included, caveat: meta.caveat, retrieved: meta.retrieved, order: entry?.order, source: entry?.source, source_note: entry?.source_note }
}
