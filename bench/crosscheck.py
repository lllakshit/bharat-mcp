#!/usr/bin/env python3
"""Independent cross-check: a separate implementation (Python, written from the public GSTIN checksum description, sharing no
code with the TypeScript one) must agree with bharat-mcp on 20,000 random GSTIN-shaped strings (half with a correct check
character, half with exactly one character changed). Run: python3 bench/crosscheck.py  (after `npm run build`)."""
import json, random, subprocess, sys

CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

def check_char(first14: str) -> str:
    total = 0
    for i, ch in enumerate(first14):
        product = CHARS.index(ch) * (1 if i % 2 == 0 else 2)
        total += product // 36 + product % 36
    return CHARS[(36 - total % 36) % 36]

random.seed(7)
STATES = ["01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","26","27","29","30","31","32","33","34","35","36","37","38","97","99"]
cases = []
for _ in range(10000):
    pan = "".join(random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ") for _ in range(3)) + random.choice("ABCFGHJLPT") + random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ") + "".join(random.choice("0123456789") for _ in range(4)) + random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    first14 = random.choice(STATES) + pan + random.choice("123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ") + "Z"
    good = first14 + check_char(first14)
    i = random.choice([n for n in range(15) if n != 13])
    pool = "0123456789" if good[i].isdigit() else "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    bad = good[:i] + random.choice([c for c in pool if c != good[i]]) + good[i + 1:]
    cases.append((good, True))
    cases.append((bad, python_valid := (check_char(bad[:14]) == bad[14])))

node = """
import { validateGstin } from './dist/validators/gstin.js'
const rows = JSON.parse(await new Promise(r => { let s=''; process.stdin.on('data', d => s += d).on('end', () => r(s)) }))
console.log(JSON.stringify(rows.map(g => validateGstin(g).errors.some(e => e.includes('check character')))))
"""
out = subprocess.run(["node", "--input-type=module", "-e", node], input=json.dumps([c[0] for c in cases]), capture_output=True, text=True, cwd=sys.path[0] + "/..")
if out.returncode:
    print(out.stderr); sys.exit(1)
wrong_check = json.loads(out.stdout)
# For these shapes the only thing that can fail is the check character, so "valid_format" == "check character matches".
mismatch = [(cases[i][0], cases[i][1], wrong_check[i]) for i in range(len(cases)) if cases[i][1] == wrong_check[i]]
print(f"{len(cases)} strings compared, {len(mismatch)} disagreements between the Python and TypeScript checksums")
sys.exit(1 if mismatch else 0)
