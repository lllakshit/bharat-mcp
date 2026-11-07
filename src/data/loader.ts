import { readFileSync } from "node:fs"

const cache = new Map<string, unknown>()

/** Reads a bundled JSON file from the package's data folder (once), so the server works fully offline. */
export function loadData<T>(file: string): T {
  const hit = cache.get(file)
  if (hit) return hit as T
  const parsed = JSON.parse(readFileSync(new URL(`../../data/${file}`, import.meta.url), "utf8")) as T
  cache.set(file, parsed)
  return parsed
}
