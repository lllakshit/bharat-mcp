#!/usr/bin/env node
// Turns a captured terminal transcript (with ANSI colours) into an SVG "screenshot" for the README. No dependencies.
// Usage: node scripts/render-proof.mjs <transcript.txt> <out.svg> "<window title>" ["<start marker>" ["<end marker>"]]
// The transcript is the real output of the command, saved by the command itself (see `npm run proof`). Nothing is typed in by hand.
import { readFileSync, writeFileSync } from "node:fs"

const [, , input, output, title = "terminal", startMarker, endMarker] = process.argv
if (!input || !output) {
  console.error('Usage: node scripts/render-proof.mjs <transcript.txt> <out.svg> "<title>" ["<start>" ["<end>"]]')
  process.exit(1)
}

const COLORS = { 31: "#ff6b6b", 32: "#69db7c", 33: "#ffd43b", 36: "#66d9ef", 90: "#8a90a5", 91: "#ff6b6b", 92: "#69db7c", 93: "#ffd43b", 96: "#66d9ef" }
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const strip = (t) => t.replace(/\x1b\[[0-9;]*m/g, "")

let lines = readFileSync(input, "utf8").replace(/\r/g, "").split("\n")
while (lines.length && lines[lines.length - 1] === "") lines.pop()
if (startMarker) {
  const start = lines.findIndex((l) => strip(l).includes(startMarker))
  if (start < 0) throw new Error(`Start marker not found: ${startMarker}`)
  lines = lines.slice(start)
}
if (endMarker) {
  const end = lines.findIndex((l, i) => i > 0 && strip(l).includes(endMarker))
  if (end > 0) lines = lines.slice(0, end)
}
while (lines.length && strip(lines[lines.length - 1]).trim() === "") lines.pop()

function spans(line) {
  const out = []
  let bold = false
  let dim = false
  let color = ""
  let last = 0
  const emit = (text) => {
    if (!text) return
    const style = [color ? `fill:${color}` : "", bold ? "font-weight:700" : "", dim ? "opacity:.6" : ""].filter(Boolean).join(";")
    out.push(`<tspan${style ? ` style="${style}"` : ""}>${esc(text)}</tspan>`)
  }
  for (const m of line.matchAll(/\x1b\[([0-9;]*)m/g)) {
    emit(line.slice(last, m.index))
    last = m.index + m[0].length
    for (const code of m[1].split(";").map(Number)) {
      if (code === 0) (bold = false), (dim = false), (color = "")
      else if (code === 1) bold = true
      else if (code === 22) (bold = false), (dim = false)
      else if (code === 39) color = ""
      else if (code === 2) dim = true
      else if (COLORS[code]) color = COLORS[code]
    }
  }
  emit(line.slice(last))
  return out.join("")
}

const FONT = 14
const CHAR = 8.45
const LINE = 21
const PAD = 22
const TOP = 46
const cols = Math.max(60, ...lines.map((l) => strip(l).length))
const width = Math.ceil(cols * CHAR + PAD * 2)
const height = TOP + lines.length * LINE + PAD
const body = lines.map((l, i) => `<text x="${PAD}" y="${TOP + 14 + i * LINE}" xml:space="preserve">${spans(l)}</text>`).join("\n    ")

writeFileSync(
  output,
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}: terminal output">
  <title>${esc(title)}</title>
  <rect width="${width}" height="${height}" rx="10" fill="#1e1f26"/>
  <rect width="${width}" height="32" rx="10" fill="#2b2d37"/>
  <rect y="22" width="${width}" height="10" fill="#2b2d37"/>
  <circle cx="20" cy="16" r="6" fill="#ff5f56"/><circle cx="40" cy="16" r="6" fill="#ffbd2e"/><circle cx="60" cy="16" r="6" fill="#27c93f"/>
  <text x="${width / 2}" y="21" text-anchor="middle" font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="12" fill="#9aa0b4">${esc(title)}</text>
  <g font-family="SF Mono,Menlo,Consolas,'DejaVu Sans Mono',monospace" font-size="${FONT}" fill="#e6e8ef">
    ${body}
  </g>
</svg>
`,
)
console.log(`${output}: ${lines.length} lines, ${width}x${height}`)
