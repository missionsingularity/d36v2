-- This table is only for deliberately public, fictional prototype activity.
-- Source pension records, personnel, documents, and production tables are not granted to anon.
create table if not exists public.demo_workspace_records (
  collection text not null check (collection in ('conversations','tasks','drafts','meetings')),
  record_id text not null check (length(record_id) between 1 and 220),
  payload jsonb not null check (octet_length(payload::text) <= 600000),
  updated_at timestamptz not null default now(),
  primary key (collection, record_id)
);

alter table public.demo_workspace_records enable row level security;
revoke all on table public.demo_workspace_records from public;
grant select, insert, update on table public.demo_workspace_records to anon, authenticated;

drop policy if exists demo_workspace_records_read on public.demo_workspace_records;
create policy demo_workspace_records_read
  on public.demo_workspace_records for select to anon, authenticated
  using (true);

drop policy if exists demo_workspace_records_insert on public.demo_workspace_records;
create policy demo_workspace_records_insert
  on public.demo_workspace_records for insert to anon, authenticated
  with check (true);

drop policy if exists demo_workspace_records_update on public.demo_workspace_records;
create policy demo_workspace_records_update
  on public.demo_workspace_records for update to anon, authenticated
  using (true) with check (true);

comment on table public.demo_workspace_records is
  'Public fictional demo workspace state only. Not attributable to a verified identity. Never store real government records or credentials here.';
