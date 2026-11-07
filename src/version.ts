import { readFileSync } from "node:fs"

/** Read from package.json so the server version never drifts from the published version. */
export const VERSION: string = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version
