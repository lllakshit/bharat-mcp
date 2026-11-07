# bharat-mcp

**Give your AI agent accurate Indian GST, PAN, pincode and compliance knowledge.**

[![CI](https://github.com/lllakshit/bharat-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/lllakshit/bharat-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/bharat-mcp)](https://www.npmjs.com/package/bharat-mcp)
[![license](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

An [MCP](https://modelcontextprotocol.io) server with eight small tools for the Indian data that language models tend to get wrong. It runs **offline**: the checksums are calculated and the datasets ship inside the package, so nothing breaks when a government website changes, and nothing you type is sent anywhere.

## Why

A model can write a GSTIN that *looks* right, and it can say a GSTIN is valid. What it cannot do reliably is calculate the check character. `bharat-mcp` does the arithmetic and returns the decoded parts, so the model can be corrected by a function instead of guessing.

## Before and after

Ask your agent: *"Is GSTIN `29AAGCB7383J1Z5` valid?"*

With the tool, it gets this back (real output):

```json
{
  "valid_format": false,
  "gstin": "29AAGCB7383J1Z5",
  "errors": ["The check character is wrong: it should be 4, not 5."],
  "state_code": "29",
  "state": "Karnataka",
  "pan": "AAGCB7383J",
  "holder_type": "Company",
  "registration_number_in_state": 1,
  "expected_check_character": "4",
  "provided_check_character": "5",
  "note": "Well-formed means the structure and checksum are right. It does NOT prove the GSTIN is registered or active: check the GST portal for that."
}
```

The only difference from a real GSTIN is the last character. Try the same question with and without the server and compare. Models do get this wrong, and the tool does not.

## Tools

| Tool | What it does | Works offline |
|---|---|---|
| `validate_gstin` | 15-character structure, state code, embedded PAN and the mod-36 check character, with decoded parts. Regular-taxpayer GSTINs only (14th character Z) | yes |
| `validate_pan` | Shape plus holder type (individual, company, firm, HUF, trust and so on) | yes |
| `validate_aadhaar_format` | Format and Verhoeff checksum **only**. Nothing is stored or looked up; only the last 4 digits are returned | yes |
| `validate_ifsc` | IFSC format and bank code, with the bank name for well-known banks | yes |
| `lookup_pincode` | State, district, postal circle and post offices for a 6-digit pincode | yes (bundled data) |
| `state_info` | State and union territory by name, GST code, ISO code or RTO prefix; QRMP GSTR-3B due-day group | yes |
| `india_holidays` | Central Government closed holidays for 2026 and 2027, or check one date | yes |
| `compliance_deadlines` | GST, TDS, advance tax, EPF/ESI and ROC due dates in a date range, with legal basis and authority | yes |

All tools are read-only.

## Install

Requires Node 18 or newer.

**Claude Desktop**: add this to `claude_desktop_config.json` (on macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`), then restart Claude:

```json
{
  "mcpServers": {
    "bharat": {
      "command": "npx",
      "args": ["-y", "bharat-mcp"]
    }
  }
}
```

**Cursor**: add the same block to `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project).

**Claude Code**:

```bash
claude mcp add bharat -- npx -y bharat-mcp
```

**From source**:

```bash
git clone https://github.com/lllakshit/bharat-mcp.git
cd bharat-mcp && npm install && npm run build
node dist/cli.js
```

You can also use the functions directly: `import { validateGstin } from "bharat-mcp"`.

## Data sources and limits

Short version; the full detail is in [DATA-SOURCES.md](DATA-SOURCES.md).

| Data | Source | As of | Limit |
|---|---|---|---|
| Pincodes | India Post All India Pincode Directory (data.gov.in), listed as Government Open Data License - India on the mirror it was taken from | 30 May 2019 | Old. Pincodes created since are missing. District names are as in 2019. |
| States, GST codes, RTO prefixes | CBIC/GSTN GST state codes, ISO 3166-2:IN, MoRTH series | 7 Nov 2026 | Hand-curated |
| Holidays | DoPT orders for 2026 (dated 3 Jul 2025) and 2027 (dated 16 Jul 2026; checked against the official memorandum) | 7 Nov 2026 | Central Government (Delhi) closed holidays only. No state, bank or stock-exchange holidays. Moon-dependent dates can shift. |
| Compliance deadlines | Statutory due dates under the CGST Rules, Income-tax rules, EPF/ESI and Companies Act | 7 Nov 2026 | **Starter set.** Standard dates only; government extensions are not included. Checked against secondary calendars, not yet line by line against each notification, so every entry is marked `medium` confidence. |

Things this server deliberately does **not** do:

- It does not tell you a GSTIN, PAN or Aadhaar number is **real or registered**. A pass (`valid_format: true`) means well-formed. Only the GST portal, the Income Tax Department or UIDAI can say more.
- It does not look up Aadhaar numbers, store them, or log them.
- It does not scrape government portals or captcha-protected pages.
- It does not recognise TDS/TCS, UN-body or non-resident GSTIN formats; they are reported as not supported, not as fake.
- It does not include IFSC branch data yet. The RBI data has no clear reuse licence, so only the format and bank code are checked.
- It does not shift a due date that falls on a Sunday or holiday. It flags it.

Every tool result carries its own `note` or `data_as_of`, so a model reading the answer can see how far to trust it.

## Develop

```bash
npm install
npm test            # 57 tests: validators, data, and the MCP server
npm run typecheck
npm run build
node scripts/smoke.mjs   # starts the built server over stdio and calls it
```

Rebuild the pincode file from a CSV: `node scripts/build-pincodes.mjs path/to/pincode.csv 2019-05-30`.

## Contributing

Issues and pull requests are welcome, especially:

- a wrong or out-of-date due date (please link the official notification),
- a state or bank code that is missing,
- tell me which Indian data you want next.

## Licence

Code: [MIT](LICENSE). Bundled data keeps the licence of its source; see [DATA-SOURCES.md](DATA-SOURCES.md).
