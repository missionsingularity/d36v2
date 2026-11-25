# D-36 functional audit

## Current verification update — 26 November 2026

- Local source changes add a deterministic MCP backlog path with full-scope calculation, district filtering, pagination, and a rendered case table. Generic raw-record fallback was removed from no-key and model/MCP error paths. Transient Gemini failures now try `GEMINI_FALLBACK_MODEL` (default `gemini-3.6-flash`) on planning and streamed answer generation, while permanent errors and partially streamed answers are not retried.
- Local validation after these changes: focused chat helper tests pass (3/3); full Vitest suite passes (30/30 across 7 files); ESLint, `tsc --noEmit`, `git diff --check`, fixture `db:check` and `next build` pass. The build reports both `/` and `/search` plus expected API routes.
- Supabase verification evidence from the read-only project inventory: required training-record counts are present, but `documents`, `document_versions`, `document_passages`, and `storage.objects` contain zero rows. The insert-only source importer cannot execute in this environment because the importer process lacks `SUPABASE_SERVICE_ROLE_KEY`. No records were reset, overwritten, or inserted during this update.
- The official source catalog has 10 URLs; two public Assam PPG pages could be read, while the others timed out or could not be retrieved by the available fetch method. No catalog sources or 18 private original documents are represented as ingested/indexed in Supabase. The earlier 18 local source hashes validate against the package manifest.
- Changes were committed and pushed as `026912f` (`Improve deterministic backlog answers and Gemini fallback`). Vercel reports production deployment `dpl_28uoE7Gw9TiwdgsbpAxVcmF27C7S` READY with source SHA `026912ff655e63dc2d852c5bb1b7ea7e20837859`, repository `missionsingularity/d36v2`, branch `main`. The existing domain returned HTTP 200 for both `/` and `/search`; returned HTML contains the Singularity workspace. The generated deployment URL also returned HTTP 200. This verifies routing and served markup, not browser rendering or chat POST behavior.
- Production acceptance remains 0/20. The available Vercel fetch tool supports GET only, and no browser surface is available, so no production conversational POST, live Gemini fallback success, document download, citation viewer, or action persistence was exercised.

GitHub `main` now contains tested commit `eaabf60` (`Improve workspace 404 and retry transient Gemini failures`), pushed to `missionsingularity/d36v2`. After the push, the production domain began serving the custom `WorkspaceNotFound` module for invalid routes. The Vercel deployment-list and deployment-detail APIs returned 403/404 in this session, so a deployment ID, READY state, and commit metadata could not be independently retrieved.

### Verified in this run

- Production HTTP: `/` 200, `/search` 200, `/cases` 200, `/documents` 200, `/tasks` 200; `/api/demo-workspace/records` 200 and returns an empty list for a fresh session. `GET /api/chat` returns 405, consistent with its POST-only contract. An unknown route returns the expected 404 and its rendered React Server Component output references `WorkspaceNotFound`; the styled page is now included at the production domain. Visual browser rendering remains unverified.
- Vercel production environment inventory contains Supabase public URL/key variables and a sensitive `GEMINI_API_KEY`; no secret values were inspected or printed. `GEMINI_MODEL` is absent, so source default `gemini-3.5-flash-lite` is selected.
- A recent production runtime log shows a real `POST /api/chat` invocation reached Gemini and received HTTP 503 `UNAVAILABLE` (“This model is currently experiencing high demand”). This proves the request reached Gemini, not that a response was generated. A bounded SDK retry (two attempts, short backoff) is now configured for chat tool-planning and streamed-generation calls; it has not yet been deployed or verified against a live Gemini success.
- Local after the retry change: `npm run typecheck`, `npm run lint`, `npm test` (27/27 across 6 files), and `npm run build` all passed. The build includes the root and `/search`, `/api/chat`, and `/api/demo-workspace/records` routes.
- The Playwright run reported all seven individual workspace checks as `ok`, including the new styled 404 assertion; the test runner was interrupted during process shutdown before it printed its final summary. Treat this as partial browser-test evidence, not a clean full-suite pass.
- A custom light workspace 404 page and matching e2e assertion were pushed in `eaabf60`; production HTTP retrieval after the push confirms the custom component module on an invalid route.
- The local implementation package screenshots were inspected; duplicated `references/approved` images have matching hashes. The Google Drive reference folder could not be opened with available tools, so its full reference inventory and exact visual comparison remain outstanding.

### Acceptance evidence

The package contains 20 scenarios in `D36_Implementation_Package/tests/acceptance.csv`. No scenario was submitted through the live production chat in this run: the available production fetch is GET-only, there is no browser surface, and local outbound access to Gemini and Supabase is denied. Therefore **0/20 production scenarios are verified**. Existing local unit/e2e/export checks do not establish the requested production actions, citations, or data persistence.

| IDs | Required area | Result |
|---|---|---|
| T01–T03 | Case retrieval/citations, officer context, office note | Not run on production chat |
| T04, T09, T13 | Revisions/versioning; PDF/DOCX/XLSX exports; PDF/DOCX/XLSX/TXT/MD/CSV attachment analysis | Not run end-to-end; current UI attachment support is text/Markdown/CSV only |
| T05–T07, T10–T11 | Tasks, meetings, approvals, audit history, dependent combined actions | Not run on production; anonymous formal approvals remain authorization-gated |
| T08 | Assamese translation | Not run with a live model |
| T12, T14–T15, T19–T20 | Citation continuity, persistence/session isolation, fault fallback, idempotency, routes/history/invalid sources | Production chat/API writes not exercised; route GET and a prior isolated SQL rollback check are not full acceptance tests |
| T16 | Official government source retrieval | Not verified against the required live official-source catalog in production |
| T17 | Visual comparison of all non-login reference screens | Blocked by inaccessible Drive folder; local included images were reviewed but are defect/reference screenshots |
| T18 | Deny anonymous official approval | Existing code gates official RPCs on authenticated employee identity; negative production request not exercised |

### Remaining deployment and access blockers

- GitHub app identity `slevel7` reports no push permission for `missionsingularity/d36v2`; the repo `.git` directory is read-only in this workspace. No commit or push was made. `D36_Implementation_Package/` remains untracked and must stay out of Git because it includes private reference material.
- The repository push succeeded; Vercel metadata access is blocked (deployment list 403, detail 403/404). Production chat and live Gemini success after the retry change are still unverified.
- Live chat POST, Gemini success, Supabase app write/read-back, generated-file download from chat, and the 20 production acceptance scenarios remain unverified.


Updated 25 November 2026. This report distinguishes local verification, direct Supabase verification, and the currently deployed production source. It is not a production acceptance certificate.

## Source changes in this checkout

- Chat preserves case, document, version, task, and approval identifiers in structured conversation context. Attached TXT, Markdown, and CSV text (up to 80 KB) is passed to Gemini and retained in that conversation's follow-up history.
- MCP tool calls are executed serially in response order. The request budget grows for attachments, multi-action messages, exports, comparisons, and history requests, with a hard limit of 12 calls and five rounds.
- actionResults is a list. Each item records its prepared action, awaiting explicit confirmation, verified false, and a null receipt until the user saves it.
- The chat route returns server-sent events. It emits an immediate search status, streams Gemini answer tokens when Gemini is reachable, then emits the structured result. Fixture fallback emits an explicit local service/data-source label and never claims an operation was executed.
- Model output is allowed up to 8,192 tokens. Responses that hit the model token limit are marked incomplete with a continuation instruction.
- Draft, task, and meeting proposal cards require an explicit officer click. These buttons save only synthetic, session-isolated workspace records; they do not claim real assignment, meeting invitations, formal submission, or approval.
- Assistant responses expose PDF, DOCX, XLSX, and PPTX download buttons. Generated files are returned as downloads; a synthetic-workspace audit event is attempted afterward and reports whether cloud persistence was confirmed.
- /api/demo-workspace/records now reads each upsert back and returns verified receipts only when every submitted payload matches.

## Supabase migration and isolation

- Applied to project bxqyaraslauycywcrive: migration 20261125173738 import_mapping_and_session_scope.
- Migration history contains both base migrations and this additive session migration.
- A direct SQL transaction ran as anon: a temporary synthetic draft was visible in its own session (1 row), invisible with a different session header (0 rows), then rolled back.
- The local /api/demo-workspace/records HTTP round-trip returned 503 because this sandbox cannot reach Supabase/PostgREST (server error: TypeError: fetch failed, network cause EACCES). Therefore the application-level cloud write/read-back receipt is not verified here.
- This demo persistence path is only for fictional per-session workspace data. Existing authenticated RPCs for real task creation and approval enforce a signed-in employee identity; they are not exposed as anonymous operational actions.

## Local verification

- npm run typecheck: passed.
- npm run lint: passed.
- npm test: passed, 27 tests across 6 files.
- npm run build: passed. Next.js 16.4.6 reports the root and /search pages and all expected API routes.
- Production-mode local server: / 200, /search 200, /api/chat 200 with text/event-stream. A synthetic attachment request produced status and result events and was explicitly labelled as a local fixture fallback because outbound Gemini/MCP requests were denied in this environment.
- Local export endpoint returned valid signatures: PDF starts %PDF; DOCX, XLSX, and PPTX start with the ZIP/Office PK 03 04 signature. Responses were HTTP 200 with their expected MIME types.
- Combined document + task + meeting intent detection is covered by a regression test. Gemini execution of that combined message has not been verified.

## Production deployment

- Existing Vercel project: d36v2; domain: https://d36v2-4fg7.vercel.app.
- Production /search returned HTTP 200.
- Production now serves the pushed custom 404 component after commit `eaabf60`; Vercel deployment commit metadata was not accessible.
- Production /api/demo-workspace/records returned HTTP 404, confirming the session-scoped workspace API in this checkout is not deployed.
- The production acceptance interface could not be operated in this session: no browser session was available, and the connected GitHub identity slevel7 has no repository push permission. No Vercel deployment containing these source changes was created.

## Ten acceptance scenarios

The referenced Word specification is not present in the project checkout. The following are the ten scenarios retained in the prior task context. None was run end-to-end against the current production build during this audit; no item is marked passed.

| # | Scenario | Evidence/status |
|---|---|---|
| 1 | Find pending pension cases with exact citations | Not run on the deployed chat; current production chat was not exercised in this run. |
| 2 | Identify the Head of Office from prior case context | Not run on the deployed chat; structured context changes are local only. |
| 3 | Prepare a formal office note | Local action proposal path exists; Gemini and production execution not verified. |
| 4 | Revise the note with reasons and recommendations | Not accepted: revision/version continuity was not exercised through production chat. |
| 5 | Create and save a responsible-officer task due within seven days | Local synthetic proposal card exists; application-level Supabase persistence failed to verify due network egress. No official task was created. |
| 6 | Prepare a departmental review meeting agenda | Local synthetic proposal card exists; production and cloud persistence not verified. No invitation was sent. |
| 7 | Submit a revised note to an authorized reviewer | Not run. Official approval RPCs require an authenticated employee profile; anonymous demo cannot claim submission. |
| 8 | Translate the office note into Assamese | Not run with Gemini. Local fallback explicitly reports that translation is unavailable. |
| 9 | Generate detailed backlog exports in PDF and Word | Local export API produced valid PDF/DOCX files, but not from retrieved production backlog data or the production chat. |
| 10 | Show task/document activity history from this conversation | Local audit append path exists; no cloud receipt or production history query was verified. |

## Combined action scenario

The detector recognizes document, task, and meeting requests as three separate action cards, and the route prepares missing proposals serially. This was not executed against Gemini or production. Saving each card is an explicit synthetic-workspace action; no verified cloud receipt is available from the local environment.

## Acceptance result and blockers

Production score for this run: NOT ESTABLISHED (0 of 10 tests executed against the deployed chat; this does not mean all ten failed). The previously reported 2/10 baseline remains a user-provided report, not a result independently reproduced in this turn.

Blocking items:

1. The production deployment still serves 77b2db8; the current checkout is not deployed.
2. Production lacks the new demo workspace route (404).
3. GitHub push is blocked by the connected slevel7 identity's missing repository write permission; local Git metadata is read-only in this execution workspace.
4. Local outbound requests to Gemini and Supabase/PostgREST fail with EACCES, so model calls and application-level cloud persistence cannot be verified from this run.
5. The production browser automation surface and the referenced Word acceptance document were unavailable.
