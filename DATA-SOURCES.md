# Data sources

Each dataset is a JSON file in `data/` with its own `as_of` date, which the tools return with every answer.

## Pincodes (`data/pincodes.json`)

- **Source:** All India Pincode Directory, India Post, published on the Open Government Data Platform India (data.gov.in). Obtained from a CKAN mirror of the 30 May 2019 file.
- **Licence:** Government Open Data License - India (GODL-India), which permits reuse with attribution. Attribution: *Published under the Government Open Data License - India; data from India Post via data.gov.in.*
- **As of:** 30 May 2019. This is old. Pincodes created after that date are not in the file, and a pincode that is "not found" may simply be newer.
- **What was changed:** 155,599 post-office rows were grouped into 19,252 pincodes. State names that the source abbreviated or misspelled (for example "Chattisgarh", "Megalaya", "Andaman and Nico.In.") were mapped to today's names; "Daman and Diu" and "Dadra and Nagar Haveli" were merged to match the 2020 merger; the Leh and Kargil districts were moved from Jammu and Kashmir to Ladakh. District names are otherwise as in the source.
- **Rebuild:** `node scripts/build-pincodes.mjs <csv> <as-of date>`.
- **To confirm before a public release:** the licence field on the current data.gov.in catalogue page.

## States and union territories (`data/states.json`)

- **GST state codes:** the codes used in the GSTIN (CBIC and GSTN). The legacy codes 25 (Daman and Diu) and 28 (Andhra Pradesh before the 2014 split) and the special codes 97 and 99 are listed separately.
- **ISO codes:** ISO 3166-2:IN. Odisha and Telangana had code changes in recent years; check the ISO listing if you depend on these.
- **RTO prefixes:** vehicle registration series. Telangana (TS, now TG), Odisha (OR, now OD) and Uttarakhand (UA, now UK) list both the old and new prefix.
- **QRMP due-day group:** whether QRMP GSTR-3B is due on the 22nd or 24th, by the state of registration, as notified by CBIC.
- **Hand-curated, as of 7 Nov 2026.** Corrections welcome.

## Central Government holidays (`data/holidays.json`)

- **Source:** the Department of Personnel and Training (DoPT) order listing closed holidays for administrative offices in Delhi/New Delhi.
  - 2026: O.M. No. F.No.12/2/2023-JCA dated 3 July 2025.
  - 2027: O.M. No. F.No.12/2/2023-JCA dated 16 July 2026.
- **How obtained:** read from copies of the orders published by staffnews.in. The originals are on dopt.gov.in and should be the reference.
- **Not included:** state government holidays, bank holidays, restricted holidays, and stock-exchange trading holidays.
- **Moon-dependent festivals** (Id-ul-Fitr, Id-ul-Zuha, Muharram, Milad-un-Nabi) can move by a day after the moon is sighted.

## Compliance deadlines (`data/compliance.json`)

- **What it is:** a **starter** set of standard statutory due dates (GST returns, TDS and TCS, advance tax, EPF and ESI, and a few ROC filings), each with its legal basis and the authority that owns it.
- **How checked (7 Nov 2026):** against several secondary compliance calendars. It was *not* yet checked line by line against each official notification. Each entry has a `confidence` of `high` or `medium`.
- **Not included:** extensions the government announces during the year; ITR due dates for tax year 2026-27 (the Income-tax Act, 2025 replaced the 1961 Act from 1 April 2026 and sources disagree); professional tax and other state taxes.
- **Due dates on Sundays and holidays** are flagged, not moved.

## IFSC

Only the format and the bank code are checked (`data`: a short list of well-known bank codes inside the source code). Branch data comes from the RBI. Razorpay's open-source IFSC toolkit is MIT-licensed for its code and states that its dataset is public domain, but there is no RBI licence statement, so branch data is **not bundled** until that is settled.

## Aadhaar

Format and Verhoeff checksum only. There is no lookup, no storage and no logging, and only the last four digits are ever returned.
