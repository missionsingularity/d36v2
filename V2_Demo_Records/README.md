# Singularity D-36 V2 — demonstration records

All records, officers in these roles, case identifiers, findings, figures, transactions and approvals are fictional and intended solely for a software demonstration. They are not official Government of Assam documents or live connector data. No real citizen information is included. The 20 primary filenames follow the Singularity Frontend Build Specification; their contents are original mock content and align with the previous V2 reference dataset. Additional records support cross-source retrieval.

## Contents
- `documents/`: 20 original named files (9 PDF reports, 8 Excel workbooks, 3 Word documents).
- `supporting/`: 30 text and email records with distinct IDs.
- `seed-data.json`: 50 records with searchable content, structured rows, source, owner, dates, related IDs, 15 tasks, 10 project labels and 24 connector names.
- `document-index.csv`: human-readable index of all 50 records.

## Use with Codex
Extract this folder into `d36v2/references/V2_Demo_Records/` in the separate V2 repository. Instruct Codex to load `seed-data.json` as the canonical demonstration dataset. Do not invent another dataset or substitute placeholder file content. Keep document IDs stable. Copy the `documents/` and `supporting/` files to `public/demo-records/` preserving relative paths. Map each record's `path` to `/demo-records/` plus its relative path. For example, D003 points to `/demo-records/documents/PWD_Guwahati_Road_Inspection_Nov2026.xlsx`. The JSON `searchText` is suitable for local search without file parsing at runtime; render `headers` and `rows` in the preview. Citations use `id`, source and filename. Link to actual static files for download. Source disconnection must filter new retrieval based on `source`, not file extension. Never modify the bundled originals when creating revisions; store generated drafts separately. Everything is local and simulated.

## Demo verification targets
- D001: 18 flagged parcels, 6 notices awaiting review.
- D002: 7 camps inspected, 2 require water supply repair.
- D003: 12 stretches, 3 resurfacing, 2 drainage, 7 routine; linked D018 minutes, D023 Outlook, D024 SharePoint, D038 eOffice and D043 Google Drive.
- D004: 42 dispatch entries, 35 issued, 7 awaiting signature.
- D010: 800 kits allocated, 620 distributed, 180 remaining.
- D012: INR 50 lakh allocated, INR 32 lakh recorded expenditure, INR 18 lakh remaining, 64% utilization.
- D014: 32 open, 9 older than 30 days.
- D016: 48 grievances, 36 resolved, 12 open.
- D020: 7 files, 5 with section officers, 2 awaiting review.

Excel workbooks contain a detailed Register sheet and formula-driven Summary sheet. PDF and Word documents include findings, review evidence, proposed follow-up actions and decision status. Supporting records are local text or standard EML messages with non-routable example.invalid addresses. External submission is never implied.
