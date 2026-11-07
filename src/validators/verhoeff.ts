const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
] as const
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
] as const
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9] as const

const at = <T>(table: readonly (readonly T[])[], row: number, col: number) => table[row]![col]!

/** True when the digit string (check digit included) passes the Verhoeff checksum. */
export function verhoeffValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false
  let c = 0
  const reversed = [...digits].reverse()
  for (let i = 0; i < reversed.length; i++) c = at(D, c, at(P, i % 8, Number(reversed[i])))
  return c === 0
}

/** The Verhoeff check digit to append to a digit string. */
export function verhoeffCheckDigit(payload: string): number {
  let c = 0
  const reversed = [...payload].reverse()
  for (let i = 0; i < reversed.length; i++) c = at(D, c, at(P, (i + 1) % 8, Number(reversed[i])))
  return INV[c]!
}
