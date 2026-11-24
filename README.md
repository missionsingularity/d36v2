# Singularity V2 — standalone reference

This is a lightweight browser-only implementation of the uploaded Singularity Frontend Build Specification. It is separate from the existing D-36 V1 deployment. All officers, records, workflows and connections are fictional/simulated. No authentication, network integrations, paid APIs or external actions are included.

## Start
Open `index.html` from this extracted folder, or run `python -m http.server 8000` in the folder and visit http://localhost:8000. The standalone single-file HTML distributed separately contains the same app and needs no other files. Prefer localhost for reliable browser localStorage behavior.

## Contents
Seven navigation sections; 50 records including the 20 named files; 15 tasks; 10 projects; 24 source entries; ten suggested assistant questions; local citations and previews; collections; review decisions; connector state and settings; light/dark and tablet layouts.

## Verification
The JS syntax check passed. Chromium/Playwright tested seven sections, query results, document preview, saving, citations, task status, agent approval, source disconnection, theme changes and 768px overflow; no JS exceptions. The environment blocks normal browser navigation, so tests loaded the generated HTML into an isolated browser document with mocked localStorage and history. Storage serialization was verified; genuine reload persistence and live hosting were not tested. Screenshots are from the actual reference app under this harness. The full Next.js/React/Tailwind/shadcn/Zustand implementation was not run: npm dependencies are not available in this environment. Source tiles include original approximations and labeled placeholders, not verified official logo assets. Structured answers are local record tables, not live SQL. No pixel-perfect Glean fidelity is claimed.

## Next steps for Codex
Use the uploaded PDF as the controlling specification, the linked YouTube walkthrough as a supplementary visual reference (frames were unavailable here), and https://docs.glean.com/ plus https://docs.glean.com/user-guide/assistant/query-bigquery-data-in-glean-assistant for documented patterns. Preserve V1 main and production deployment. Build a real Next.js App Router/TypeScript/React/Tailwind/shadcn/Zustand version on a separate branch or separate Vercel project. Use these screens and dataset as a reference, not as evidence of exact Glean fidelity. Replace approximation icons with permitted official assets; implement structured local query logic and test actual localStorage persistence and all responsive widths. Run npm install, npm run dev, production build and Playwright. Commit and push checkpoints early and at least every 5–7 minutes if feasible; never force push. Deploy only the V2 preview. Do not expose credentials or API keys. GitHub access in this chat was read-only, so no commit or push was made.
