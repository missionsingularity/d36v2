# D-36 functional audit

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
- The latest production deployment still points to commit 77b2db8761dc517f8926e5b7f3a8864fc16f41ec (prefix 77b2db8).
- Production /api/demo-workspace/records returned HTTP 404, confirming the session-scoped workspace API in this checkout is not deployed.
- The production acceptance interface could not be operated in this session: no browser session was available, and the connected GitHub identity slevel7 has no repository push permission. No Vercel deployment containing these source changes was created.

## Ten acceptance scenarios

The referenced Word specification is not present in the project checkout. The following are the ten scenarios retained in the prior task context. None was run end-to-end against the current production build during this audit; no item is marked passed.

| # | Scenario | Evidence/status |
|---|---|---|
| 1 | Find pending pension cases with exact citations | Not run on the deployed chat; current production source remains 77b2db8. |
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
