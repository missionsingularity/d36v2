# Database schema and persistence status

Project reference: `bxqyaraslauycywcrive`. Schema is described by `supabase/migrations/202611240001_singularity_schema.sql`, `202611240002_public_demo_workspace.sql`, and the reviewed but not applied `202611250001_import_mapping_and_session_scope.sql`.

## Existing relational model

- Identity/org: `profiles`, `employees`, `departments`, `offices`, `roles`, `responsibilities`.
- Pension: `pensioners`, `pension_cases`, `case_access_grants`, `service_records`, `leave_records`.
- Grievance: `grievances`.
- Knowledge: `documents`, `document_versions`, `document_passages`, `ontology_relationships`, `knowledge_changes`.
- Agent history: `conversations`, `messages`, `agent_runs`, `tool_executions`.
- Work: `tasks`, `task_events`, `approval_requests`, `approval_events`, `meetings`, `projects`, `notifications`.
- Governance/integration: `audit_events`, `application_connections`, `connection_requests`; Storage buckets are private by policy.

The relational migration uses UUIDs for primary IDs on most application-owned rows and text employee/office/business identifiers for fixture keys. Foreign keys follow those declared types. The original migration contained a correlated pensioner RLS predicate using ambiguous unqualified `id`; the migration repair qualified the outer reference. Review the SQL in context before changing identifier types further.

## Anonymous training workspace

`demo_workspace_records` stores the synthetic browser prototype collections (conversations, tasks, drafts, meetings, approvals, audit events). The latest local additive migration scopes rows by `(session_id, collection, record_id)`, derives session identity from a server-issued HttpOnly cookie, passes it to PostgREST as `x-demo-session-id`, and enforces row-level policies. It retains prior unscoped rows under `legacy-shared`, which the app does not expose. RLS remains enabled.

The migration is present locally but was not applied in the current verification run. The local production-mode API returned HTTP 503; therefore no remote persistence or cross-session isolation claim is made. Remote counts and previous migration/deployment state in `PROGRESS.md` are historical checks, not current evidence.

## Data preservation

Fixture checks validate 186 cases and 18 original source hashes without network writes. The importer is conflict-ignore/idempotent and retains source payloads. No database reset/drop is used. A service-role key is absent from the current local configuration, so private Storage uploads and privileged import remain blocked.
