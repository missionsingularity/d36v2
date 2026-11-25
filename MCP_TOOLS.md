# MCP tool registry

Current registry is `src/lib/agent/tools.ts`; tools execute through the in-memory MCP session in `src/lib/agent/mcp.ts` and `src/lib/agent/database-tools.ts`. Gemini receives only these bounded functions; there is no unrestricted SQL tool.

| Tool | Purpose | Writes? | Validation / limits |
|---|---|---:|---|
| `search_records` | Search pension, grievance, source, people, office and audit training records | No | Query 1–300 chars; fixed scope enum; 1–15 results |
| `get_pension_case` | Retrieve a case and linked evidence | No | Case ID/name 2–100 chars |
| `calculate_backlog` | Count unresolved cases and group issues | No | Optional district; unresolved flag |
| `compare_grievances` | Compare selected grievance disposal/outcome records | No | 1–10 exact IDs |
| `query_audit` | Query fixture audit history | No | Optional proposal ID and ISO date bounds |
| `assess_knowledge_change` | Assess recorded source-change verification state | No | Exact change ID |
| `prepare_action` | Prepare a note/task/meeting proposal for an existing case | No | Fixed action enum; bounded title/description; optional existing officer and ISO due date |

`prepare_action` is deliberately not an execution tool. Chat's explicit action cards call local-first store helpers; those try the session-scoped demo records API. Cloud persistence is reported only when the API confirms the saved count. The demo store does not make authoritative HR assignments or government approvals.

## Known gaps before the requested acceptance target

- Add validated MCP tools for document CRUD/version history/export, task CRUD/assignment, internal meeting CRUD, approval submission/history, translation, and activity audit retrieval.
- Add structured document and entity IDs to conversation state.
- Enforce authorization and explicit confirmations server-side for write tools.
- Persist operational actions and append-only audit events transactionally in Supabase before returning a success receipt.
- Add deduplication/idempotency keys and return structured receipts to the model/UI.
- Keep the demo-session channel restricted to synthetic records; actual government records require verified auth and policy scopes.
