-- Additive compatibility fixes for the already populated training workspace.
-- Existing source fields remain available in JSON payloads; no rows are dropped.
alter table public.offices
  add column if not exists attributes jsonb not null default '{}'::jsonb;

alter table public.pension_cases
  alter column late_objection drop not null,
  alter column visible_before_retirement drop not null;

alter table public.grievances
  add column if not exists disposal_date date;

-- Make anonymous prototype records private to an unguessable server-issued session.
-- Legacy records are retained in a non-addressable namespace for audit/history.
alter table public.demo_workspace_records
  add column if not exists session_id text,
  add column if not exists classification text not null default 'workspace';
update public.demo_workspace_records
  set session_id = 'legacy-shared'
  where session_id is null;
alter table public.demo_workspace_records
  alter column session_id set not null;

alter table public.demo_workspace_records
  drop constraint if exists demo_workspace_records_pkey;
alter table public.demo_workspace_records
  add constraint demo_workspace_records_pkey primary key (session_id, collection, record_id);

alter table public.demo_workspace_records
  drop constraint if exists demo_workspace_records_collection_check;
alter table public.demo_workspace_records
  add constraint demo_workspace_records_collection_check
  check (collection in ('conversations','tasks','drafts','meetings','approvals','audit_events'));

-- Anonymous workspace records are private per session and are excluded from the training corpus.
alter table public.demo_workspace_records enable row level security;

drop policy if exists demo_workspace_records_read on public.demo_workspace_records;
drop policy if exists demo_workspace_records_insert on public.demo_workspace_records;
drop policy if exists demo_workspace_records_update on public.demo_workspace_records;
create or replace function public.current_demo_session() returns text
language sql stable set search_path = '' as $$
  select nullif(current_setting('request.headers', true)::jsonb ->> 'x-demo-session-id', '')
$$;
revoke all on function public.current_demo_session() from public;
grant execute on function public.current_demo_session() to anon, authenticated;

revoke all on table public.demo_workspace_records from public;
grant select, insert, update on table public.demo_workspace_records to anon, authenticated;
create policy demo_workspace_session_read on public.demo_workspace_records
  for select to anon, authenticated using (session_id = public.current_demo_session() and classification in ('training','workspace'));
create policy demo_workspace_session_insert on public.demo_workspace_records
  for insert to anon, authenticated with check (session_id = public.current_demo_session() and classification in ('training','workspace'));
create policy demo_workspace_session_update on public.demo_workspace_records
  for update to anon, authenticated using (session_id = public.current_demo_session() and classification in ('training','workspace')) with check (session_id = public.current_demo_session() and classification in ('training','workspace'));

-- Anonymous visitors can retrieve only rows explicitly marked as fictional training data.
grant select on public.departments, public.offices, public.employees, public.responsibilities,
  public.pensioners, public.pension_cases, public.service_records, public.leave_records,
  public.grievances, public.documents, public.document_versions, public.document_passages,
  public.audit_events, public.knowledge_changes, public.ontology_relationships to anon;
create policy demo_training_read on public.departments for select to anon using (classification = 'training');
create policy demo_training_read on public.offices for select to anon using (attributes ->> 'classification' = 'training');
create policy demo_training_read on public.employees for select to anon using (classification = 'training');
create policy demo_training_read on public.responsibilities for select to anon using (classification = 'training');
create policy demo_training_read on public.pensioners for select to anon using (classification = 'training');
create policy demo_training_read on public.pension_cases for select to anon using (classification = 'training');
create policy demo_training_read on public.service_records for select to anon using (classification = 'training');
create policy demo_training_read on public.leave_records for select to anon using (classification = 'training');
create policy demo_training_read on public.grievances for select to anon using (classification = 'training');
create policy demo_training_read on public.documents for select to anon using (classification = 'training');
create policy demo_training_read on public.document_versions for select to anon using (
  exists (select 1 from public.documents d where d.id = document_id and d.classification = 'training')
);
create policy demo_training_read on public.document_passages for select to anon using (
  classification = 'training' and exists (select 1 from public.documents d where d.id = document_id and d.classification = 'training')
);
create policy demo_training_read on public.audit_events for select to anon using (classification = 'training');
create policy demo_training_read on public.knowledge_changes for select to anon using (classification = 'training');
create policy demo_training_read on public.ontology_relationships for select to anon using (classification = 'training');

comment on table public.demo_workspace_records is
  'Fictional prototype records scoped by an unguessable server-issued anonymous session, enforced by RLS. Legacy shared rows are retained under legacy-shared and are not exposed by the application.';
