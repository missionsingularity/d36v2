create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.roles (
  id text primary key,
  label text not null,
  description text not null,
  created_at timestamptz not null default now()
);
insert into public.roles(id,label,description) values
  ('leadership','Leadership','Department oversight and review'),
  ('supervisor','Supervisor','Section supervision and approvals'),
  ('pension_assistant','Pension assistant','Pension case preparation'),
  ('grievance_officer','Grievance officer','Grievance coordination'),
  ('head_of_office','Head of Office','Office review and case oversight'),
  ('audit_officer','Audit officer','Restricted audit review'),
  ('system_admin','System administrator','Workspace metadata administration'),
  ('staff','Staff','Department support'),
  ('directorate_officer','Directorate officer','Directorate coordination')
on conflict(id) do nothing;

create table if not exists public.departments (
  id text primary key,
  name text not null,
  classification text not null default 'training',
  created_at timestamptz not null default now()
);

create table if not exists public.offices (
  id text primary key,
  name text not null,
  location text not null default '',
  parent_id text references public.offices(id) on delete set null,
  department_id text references public.departments(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.employees (
  id text primary key,
  name text not null,
  designation text not null,
  office_id text not null references public.offices(id),
  role text not null check (role in ('leadership','supervisor','pension_assistant','grievance_officer','head_of_office','audit_officer','system_admin','staff','directorate_officer')),
  manager_id text references public.employees(id) on delete set null,
  classification text not null default 'training',
  attributes jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  employee_id text not null unique references public.employees(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.responsibilities (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references public.employees(id) on delete cascade,
  description text not null,
  source text,
  classification text not null default 'training',
  unique(employee_id, description)
);

create table if not exists public.pensioners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  district text not null default '',
  office_id text references public.offices(id),
  classification text not null default 'training',
  created_at timestamptz not null default now()
);

create table if not exists public.pension_cases (
  id text primary key,
  pensioner_id uuid not null references public.pensioners(id) on delete restrict,
  owner_id text references public.employees(id) on delete set null,
  office_id text not null references public.offices(id),
  district text not null default '',
  department text not null default '',
  unresolved boolean not null default false,
  stage text not null default '',
  issue text not null default '',
  late_objection boolean not null default false,
  visible_before_retirement boolean not null default false,
  payload jsonb not null default '{}',
  search_vector tsvector generated always as (to_tsvector('english', coalesce(id, '') || ' ' || coalesce(payload::text, ''))) stored,
  classification text not null default 'training',
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pension_cases_owner_idx on public.pension_cases(owner_id);
create index if not exists pension_cases_office_stage_idx on public.pension_cases(office_id, stage);
create index if not exists pension_cases_unresolved_idx on public.pension_cases(unresolved) where unresolved;
create index if not exists pension_cases_search_idx on public.pension_cases using gin(search_vector);

create table if not exists public.case_access_grants (
  case_id text not null references public.pension_cases(id) on delete cascade,
  employee_id text not null references public.employees(id) on delete cascade,
  granted_by text references public.employees(id),
  created_at timestamptz not null default now(),
  primary key (case_id, employee_id)
);

create table if not exists public.service_records (
  id uuid primary key default gen_random_uuid(),
  case_id text not null references public.pension_cases(id) on delete cascade,
  record_type text not null,
  recorded_at date,
  payload jsonb not null default '{}',
  classification text not null default 'training'
);
create table if not exists public.leave_records (
  id uuid primary key default gen_random_uuid(),
  case_id text not null references public.pension_cases(id) on delete cascade,
  leave_type text not null,
  start_date date,
  end_date date,
  sanction_order_available boolean not null default false,
  payload jsonb not null default '{}',
  classification text not null default 'training'
);

create table if not exists public.grievances (
  id text primary key,
  case_id text references public.pension_cases(id) on delete set null,
  owner_id text references public.employees(id) on delete set null,
  received date,
  status text not null default '',
  disposed boolean not null default false,
  atr_date date,
  outcome_verified boolean not null default false,
  payload jsonb not null default '{}',
  classification text not null default 'training',
  search_vector tsvector generated always as (to_tsvector('english', coalesce(id, '') || ' ' || coalesce(payload::text, ''))) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id text primary key,
  title text not null,
  current_version integer not null default 1 check (current_version > 0),
  case_id text references public.pension_cases(id) on delete set null,
  created_by text references public.employees(id),
  classification text not null default 'training',
  storage_path text,
  source_hash text,
  source_location text,
  attributes jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table if not exists public.document_versions (
  document_id text not null references public.documents(id) on delete cascade,
  version integer not null check (version > 0),
  storage_path text,
  sha256 text,
  immutable boolean not null default true,
  created_by text references public.employees(id),
  created_at timestamptz not null default now(),
  primary key (document_id, version)
);
create table if not exists public.document_passages (
  id uuid primary key default gen_random_uuid(),
  document_id text not null,
  version integer not null,
  section text not null,
  passage text not null,
  search_vector tsvector generated always as (to_tsvector('english', coalesce(passage, ''))) stored,
  classification text not null default 'training',
  foreign key (document_id, version) references public.document_versions(document_id, version) on delete cascade,
  unique(document_id, version, section)
);
create index if not exists document_passages_fts_idx on public.document_passages using gin(search_vector);
create index if not exists document_passages_trgm_idx on public.document_passages using gin(passage gin_trgm_ops);
create table if not exists public.document_exports (
  id uuid primary key default gen_random_uuid(),
  document_id text not null,
  version integer not null,
  format text not null check (format in ('docx','pdf','xlsx','pptx')),
  storage_path text not null unique,
  sha256 text not null,
  created_by text not null references public.employees(id),
  created_at timestamptz not null default now(),
  unique(document_id,version,format),
  foreign key(document_id,version) references public.document_versions(document_id,version) on delete cascade
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references public.employees(id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool')),
  content text not null,
  citations jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  employee_id text not null references public.employees(id),
  model text not null,
  state text not null check (state in ('running','complete','failed','cancelled')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create table if not exists public.tool_executions (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  tool_name text not null,
  state text not null check (state in ('running','complete','failed','denied')),
  arguments jsonb not null default '{}',
  result jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  assignee_id text not null references public.employees(id),
  case_id text references public.pension_cases(id) on delete set null,
  due_date date,
  status text not null default 'open' check (status in ('open','in_progress','blocked','complete','cancelled')),
  created_by text references public.employees(id),
  payload jsonb not null default '{}',
  classification text not null default 'training',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_assignee_status_idx on public.tasks(assignee_id,status);
create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id text not null references public.employees(id),
  event_type text not null,
  from_status text,
  to_status text,
  detail text,
  created_at timestamptz not null default now()
);

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id text not null,
  target_version integer not null check (target_version > 0),
  requested_by text not null references public.employees(id),
  reviewer_id text not null references public.employees(id),
  status text not null default 'pending' check (status in ('pending','approved','rejected','returned','cancelled')),
  comment text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create table if not exists public.approval_events (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null references public.approval_requests(id) on delete cascade,
  actor_id text not null references public.employees(id),
  action text not null,
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id text primary key,
  proposal_id text,
  timestamp timestamptz not null,
  actor_id text references public.employees(id),
  action text not null,
  decision text not null,
  external_disclosure_confirmed boolean not null default false,
  classification text not null default 'training',
  payload jsonb not null default '{}'
);
create table if not exists public.knowledge_changes (
  id text primary key,
  source_id text,
  requester_id text references public.employees(id),
  reviewer_id text references public.employees(id),
  state text not null,
  authority_verified boolean not null default false,
  signature_verified boolean not null default false,
  effective_date_verified boolean not null default false,
  rule_compatibility_verified boolean not null default false,
  publication_approved boolean not null default false,
  payload jsonb not null default '{}',
  classification text not null default 'training'
);
create table if not exists public.application_connections (
  id uuid primary key default gen_random_uuid(),
  application text not null unique,
  status text not null default 'not_connected' check (status in ('not_connected','requested','connected','failed')),
  external_account text,
  verified_at timestamptz,
  updated_by text references public.employees(id),
  updated_at timestamptz not null default now()
);
create table if not exists public.connection_requests (
  id uuid primary key default gen_random_uuid(),
  application text not null,
  requested_by text not null references public.employees(id),
  purpose text not null,
  status text not null default 'requested' check (status in ('requested','approved','rejected','connected')),
  created_at timestamptz not null default now()
);
create table if not exists public.ontology_relationships (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_id text not null,
  relationship text not null,
  object_type text not null,
  object_id text not null,
  attributes jsonb not null default '{}',
  classification text not null default 'training',
  created_at timestamptz not null default now(),
  unique(subject_type,subject_id,relationship,object_type,object_id)
);

create table if not exists public.projects (id uuid primary key default gen_random_uuid(), name text not null, status text not null default 'open', owner_id text references public.employees(id), payload jsonb not null default '{}');
create table if not exists public.meetings (id uuid primary key default gen_random_uuid(), title text not null, starts_at timestamptz, office_id text references public.offices(id), payload jsonb not null default '{}');
create table if not exists public.notifications (id uuid primary key default gen_random_uuid(), employee_id text not null references public.employees(id), title text not null, body text not null default '', read_at timestamptz, created_at timestamptz not null default now());

create or replace function public.write_audit_event(p_action text, p_proposal_id text default null, p_decision text default 'allowed', p_external_disclosure_confirmed boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare event_id text := 'EVT-' || upper(replace(gen_random_uuid()::text, '-', ''));
begin
  if auth.uid() is null or public.current_employee_id() is null then raise exception 'Authenticated employee profile required'; end if;
  if p_proposal_id is not null and not public.can_access_case(p_proposal_id) then raise exception 'Case access denied'; end if;
  insert into public.audit_events(id,proposal_id,timestamp,actor_id,action,decision,external_disclosure_confirmed,classification)
  values(event_id,p_proposal_id,now(),public.current_employee_id(),left(p_action,120),left(p_decision,40),p_external_disclosure_confirmed,'training');
  return event_id;
end $$;
revoke all on function public.write_audit_event(text,text,text,boolean) from public, anon;
grant execute on function public.write_audit_event(text,text,text,boolean) to authenticated;

create or replace function public.create_task_with_event(p_title text, p_assignee_id text, p_case_id text default null, p_due_date date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks%rowtype; actor text := public.current_employee_id(); actor_role text := public.current_employee_role();
begin
  if auth.uid() is null or actor is null then raise exception 'Authenticated employee profile required'; end if;
  if actor_role not in ('pension_assistant','grievance_officer','head_of_office','supervisor','leadership') then raise exception 'Task creation is not permitted for this role'; end if;
  if p_title is null or length(trim(p_title)) not between 1 and 240 then raise exception 'Task title must be 1 to 240 characters'; end if;
  if not exists(select 1 from public.employees e where e.id=p_assignee_id and (e.office_id=public.current_office_id() or actor_role in ('leadership','supervisor'))) then raise exception 'Assignee is outside the permitted office scope'; end if;
  if p_case_id is not null and not public.can_access_case(p_case_id) then raise exception 'Case access denied'; end if;
  insert into public.tasks(title,assignee_id,case_id,due_date,status,created_by,classification)
  values(trim(p_title),p_assignee_id,p_case_id,p_due_date,'open',actor,'training') returning * into task_row;
  insert into public.task_events(task_id,actor_id,event_type,to_status,detail) values(task_row.id,actor,'assigned','open','Task created and assigned');
  perform public.write_audit_event('assign_task',p_case_id,'allowed',false);
  return jsonb_build_object('id',task_row.id,'title',task_row.title,'assignee_id',task_row.assignee_id,'case_id',task_row.case_id,'due_date',task_row.due_date,'status',task_row.status,'created_at',task_row.created_at);
end $$;
revoke all on function public.create_task_with_event(text,text,text,date) from public, anon;
grant execute on function public.create_task_with_event(text,text,text,date) to authenticated;

create or replace function public.update_task_status(p_task_id uuid, p_status text, p_detail text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  task_row public.tasks%rowtype;
  actor text := public.current_employee_id();
  previous_status text;
begin
  if auth.uid() is null or actor is null then raise exception 'Authenticated employee profile required'; end if;
  if p_status not in ('open','in_progress','blocked','complete','cancelled') then raise exception 'Invalid task status'; end if;
  select * into task_row from public.tasks where id=p_task_id for update;
  if not found or task_row.assignee_id <> actor then raise exception 'Task is unavailable to this assignee'; end if;
  if task_row.status in ('complete','cancelled') then raise exception 'Completed tasks cannot be reopened'; end if;
  previous_status := task_row.status;
  update public.tasks set status=p_status,updated_at=now() where id=p_task_id returning * into task_row;
  insert into public.task_events(task_id,actor_id,event_type,from_status,to_status,detail) values(p_task_id,actor,'status_changed',previous_status,p_status,left(coalesce(p_detail,''),500));
  perform public.write_audit_event('task_status_' || p_status,task_row.case_id,'allowed',false);
  return jsonb_build_object('id',task_row.id,'status',task_row.status,'updated_at',task_row.updated_at);
end
$$;
revoke all on function public.update_task_status(uuid,text,text) from public, anon;
grant execute on function public.update_task_status(uuid,text,text) to authenticated;

create or replace function public.create_approval_request(p_target_type text, p_target_id text, p_target_version integer, p_reviewer_id text, p_comment text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  approval_row public.approval_requests%rowtype;
  actor text := public.current_employee_id();
begin
  if auth.uid() is null or actor is null then raise exception 'Authenticated employee profile required'; end if;
  if p_target_type <> 'document' or p_target_version < 1 then raise exception 'Only a versioned document can be submitted through this approval workflow'; end if;
  if p_reviewer_id = actor then raise exception 'The requester cannot review their own submission'; end if;
  if not exists(select 1 from public.employees r where r.id=p_reviewer_id and (r.office_id=public.current_office_id() or public.current_employee_role() in ('leadership','supervisor'))) then raise exception 'Reviewer is outside the permitted office scope'; end if;
  if not exists(select 1 from public.document_versions v join public.documents d on d.id=v.document_id where v.document_id=p_target_id and v.version=p_target_version and d.current_version=p_target_version and (d.created_by=actor or d.case_id is not null and public.can_access_case(d.case_id))) then raise exception 'Document version is unavailable or outside your case scope'; end if;
  insert into public.approval_requests(target_type,target_id,target_version,requested_by,reviewer_id,status,comment)
  values(p_target_type,p_target_id,p_target_version,actor,p_reviewer_id,'pending',left(coalesce(p_comment,''),1200)) returning * into approval_row;
  insert into public.approval_events(approval_id,actor_id,action,comment) values(approval_row.id,actor,'submitted',left(coalesce(p_comment,''),1200));
  perform public.write_audit_event('approval_submitted',null,'allowed',false);
  return jsonb_build_object('id',approval_row.id,'target_id',approval_row.target_id,'target_version',approval_row.target_version,'reviewer_id',approval_row.reviewer_id,'status',approval_row.status,'created_at',approval_row.created_at);
end
$$;
revoke all on function public.create_approval_request(text,text,integer,text,text) from public, anon;
grant execute on function public.create_approval_request(text,text,integer,text,text) to authenticated;

create or replace function public.decide_approval(p_approval_id uuid, p_action text, p_comment text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  approval_row public.approval_requests%rowtype;
  actor text := public.current_employee_id();
  next_status text;
begin
  if auth.uid() is null or actor is null then raise exception 'Authenticated employee profile required'; end if;
  if p_action not in ('approved','rejected','returned') then raise exception 'Invalid approval action'; end if;
  select * into approval_row from public.approval_requests where id=p_approval_id for update;
  if not found or approval_row.reviewer_id <> actor or approval_row.status <> 'pending' then raise exception 'Approval is unavailable to this reviewer or no longer pending'; end if;
  if approval_row.requested_by = actor then raise exception 'The requester cannot review their own request'; end if;
  if approval_row.target_type='document' and not exists(select 1 from public.document_versions v where v.document_id=approval_row.target_id and v.version=approval_row.target_version) then raise exception 'The requested document version no longer exists'; end if;
  next_status := case when p_action='approved' then 'approved' when p_action='rejected' then 'rejected' else 'returned' end;
  update public.approval_requests set status=next_status,comment=left(coalesce(p_comment,''),1200),decided_at=now() where id=p_approval_id returning * into approval_row;
  insert into public.approval_events(approval_id,actor_id,action,comment) values(p_approval_id,actor,p_action,left(coalesce(p_comment,''),1200));
  perform public.write_audit_event('approval_' || p_action,null,'allowed',false);
  return jsonb_build_object('id',approval_row.id,'target_type',approval_row.target_type,'target_id',approval_row.target_id,'target_version',approval_row.target_version,'status',approval_row.status,'decided_at',approval_row.decided_at);
end
$$;
revoke all on function public.decide_approval(uuid,text,text) from public, anon;
grant execute on function public.decide_approval(uuid,text,text) to authenticated;

create or replace function public.decide_approval(p_approval_id uuid, p_action text, p_comment text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare approval_row public.approval_requests%rowtype; actor text := public.current_employee_id(); next_status text;
begin
  if auth.uid() is null or actor is null then raise exception 'Authenticated employee profile required'; end if;
  if p_action not in ('approved','rejected','returned') then raise exception 'Invalid approval action'; end if;
  select * into approval_row from public.approval_requests where id=p_approval_id for update;
  if not found or approval_row.reviewer_id <> actor or approval_row.status <> 'pending' then raise exception 'Approval is unavailable to this reviewer or no longer pending'; end if;
  if approval_row.requested_by = actor then raise exception 'The requester cannot review their own request'; end if;
  if approval_row.target_type='document' and not exists(select 1 from public.document_versions v where v.document_id=approval_row.target_id and v.version=approval_row.target_version) then raise exception 'The requested document version no longer exists'; end if;
  next_status := case when p_action='approved' then 'approved' when p_action='rejected' then 'rejected' else 'returned' end;
  update public.approval_requests set status=next_status,comment=left(coalesce(p_comment,''),1200),decided_at=now() where id=p_approval_id returning * into approval_row;
  insert into public.approval_events(approval_id,actor_id,action,comment) values(p_approval_id,actor,p_action,left(coalesce(p_comment,''),1200));
  perform public.write_audit_event('approval_' || p_action,null,'allowed',false);
  return jsonb_build_object('id',approval_row.id,'target_type',approval_row.target_type,'target_id',approval_row.target_id,'target_version',approval_row.target_version,'status',approval_row.status,'decided_at',approval_row.decided_at);
end $$;
revoke all on function public.decide_approval(uuid,text,text) from public, anon;
grant execute on function public.decide_approval(uuid,text,text) to authenticated;

create or replace function public.current_employee_id() returns text
language sql stable security definer set search_path = '' as $$
  select p.employee_id from public.profiles p where p.auth_user_id = (select auth.uid()) limit 1
$$;
create or replace function public.current_employee_role() returns text
language sql stable security definer set search_path = '' as $$
  select e.role from public.employees e where e.id = public.current_employee_id() limit 1
$$;
create or replace function public.current_office_id() returns text
language sql stable security definer set search_path = '' as $$
  select e.office_id from public.employees e where e.id = public.current_employee_id() limit 1
$$;
create or replace function public.current_manager_id() returns text
language sql stable security definer set search_path = '' as $$
  select e.manager_id from public.employees e where e.id = public.current_employee_id() limit 1
$$;
create or replace function public.can_access_case(target_case text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pension_cases c
    where c.id = target_case and (
      c.owner_id = public.current_employee_id()
      or c.office_id = public.current_office_id() and public.current_employee_role() in ('head_of_office','supervisor','leadership','audit_officer')
      or exists (select 1 from public.case_access_grants g where g.case_id = c.id and g.employee_id = public.current_employee_id())
    )
  )
$$;

alter table public.departments enable row level security;
alter table public.roles enable row level security;
alter table public.offices enable row level security;
alter table public.employees enable row level security;
alter table public.profiles enable row level security;
alter table public.responsibilities enable row level security;
alter table public.pensioners enable row level security;
alter table public.pension_cases enable row level security;
alter table public.case_access_grants enable row level security;
alter table public.service_records enable row level security;
alter table public.leave_records enable row level security;
alter table public.grievances enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_passages enable row level security;
alter table public.document_exports enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.agent_runs enable row level security;
alter table public.tool_executions enable row level security;
alter table public.tasks enable row level security;
alter table public.task_events enable row level security;
alter table public.approval_requests enable row level security;
alter table public.approval_events enable row level security;
alter table public.audit_events enable row level security;
alter table public.knowledge_changes enable row level security;
alter table public.application_connections enable row level security;
alter table public.connection_requests enable row level security;
alter table public.ontology_relationships enable row level security;
alter table public.projects enable row level security;
alter table public.meetings enable row level security;
alter table public.notifications enable row level security;

create policy "employees scoped read" on public.employees for select to authenticated using (
  id = public.current_employee_id() or id = public.current_manager_id() or office_id = public.current_office_id() and public.current_employee_role() in ('head_of_office','supervisor','leadership','audit_officer')
);
create policy "profile self read" on public.profiles for select to authenticated using (auth_user_id = (select auth.uid()));
create policy "offices authenticated read" on public.offices for select to authenticated using (true);
create policy "departments authenticated read" on public.departments for select to authenticated using (true);
create policy "roles authenticated read" on public.roles for select to authenticated using (true);
create policy "responsibilities scoped read" on public.responsibilities for select to authenticated using (employee_id = public.current_employee_id() or exists(select 1 from public.employees e where e.id=employee_id and e.office_id=public.current_office_id()));
create policy "case scope read" on public.pension_cases for select to authenticated using (public.can_access_case(id));
create policy "case controlled update" on public.pension_cases for update to authenticated using (owner_id=public.current_employee_id() and public.current_employee_role() in ('pension_assistant','grievance_officer')) with check (owner_id=public.current_employee_id());
create policy "pensioner scope read" on public.pensioners for select to authenticated using (exists(select 1 from public.pension_cases c where c.pensioner_id=id and public.can_access_case(c.id)));
create policy "case grant scoped read" on public.case_access_grants for select to authenticated using (employee_id=public.current_employee_id() or public.current_employee_role() in ('head_of_office','supervisor','leadership'));
create policy "service scope read" on public.service_records for select to authenticated using (public.can_access_case(case_id));
create policy "leave scope read" on public.leave_records for select to authenticated using (public.can_access_case(case_id));
create policy "grievance scope read" on public.grievances for select to authenticated using (owner_id=public.current_employee_id() or case_id is not null and public.can_access_case(case_id));
create policy "document scope read" on public.documents for select to authenticated using (created_by=public.current_employee_id() or case_id is not null and public.can_access_case(case_id) or case_id is null and public.current_employee_role() in ('leadership','supervisor','audit_officer','head_of_office'));
create policy "document versions scope read" on public.document_versions for select to authenticated using (exists(select 1 from public.documents d where d.id=document_id and (d.created_by=public.current_employee_id() or d.case_id is not null and public.can_access_case(d.case_id) or d.case_id is null and public.current_employee_role() in ('leadership','supervisor','audit_officer','head_of_office'))));
create policy "document draft create" on public.documents for insert to authenticated with check (created_by=public.current_employee_id() and (case_id is null or public.can_access_case(case_id)));
create policy "document owner version update" on public.documents for update to authenticated using (created_by=public.current_employee_id()) with check (created_by=public.current_employee_id());
create policy "document incomplete draft cleanup" on public.documents for delete to authenticated using (created_by=public.current_employee_id() and not exists(select 1 from public.document_versions v where v.document_id=id));
create policy "document owner version insert" on public.document_versions for insert to authenticated with check (created_by=public.current_employee_id() and exists(select 1 from public.documents d where d.id=document_id and d.created_by=public.current_employee_id()));
create policy "document passages scope read" on public.document_passages for select to authenticated using (exists(select 1 from public.documents d where d.id=document_id and (d.case_id is null or public.can_access_case(d.case_id))));
create policy "document export participant read" on public.document_exports for select to authenticated using (created_by=public.current_employee_id() or exists(select 1 from public.documents d where d.id=document_id and (d.case_id is null or public.can_access_case(d.case_id))));
create policy "document export owned insert" on public.document_exports for insert to authenticated with check (created_by=public.current_employee_id() and exists(select 1 from public.documents d where d.id=document_id and (d.case_id is null or public.can_access_case(d.case_id))));
create policy "document export owner delete" on public.document_exports for delete to authenticated using (created_by=public.current_employee_id());
create policy "conversation owner access" on public.conversations for all to authenticated using (employee_id=public.current_employee_id()) with check (employee_id=public.current_employee_id());
create policy "message owner access" on public.messages for all to authenticated using (exists(select 1 from public.conversations c where c.id=conversation_id and c.employee_id=public.current_employee_id())) with check (exists(select 1 from public.conversations c where c.id=conversation_id and c.employee_id=public.current_employee_id()));
create policy "agent run owner read" on public.agent_runs for select to authenticated using (employee_id=public.current_employee_id());
create policy "agent run owner create" on public.agent_runs for insert to authenticated with check (employee_id=public.current_employee_id());
create policy "agent run owner update" on public.agent_runs for update to authenticated using (employee_id=public.current_employee_id()) with check (employee_id=public.current_employee_id());
create policy "tool execution owner read" on public.tool_executions for select to authenticated using (exists(select 1 from public.agent_runs r where r.id=agent_run_id and r.employee_id=public.current_employee_id()));
create policy "tool execution owner create" on public.tool_executions for insert to authenticated with check (exists(select 1 from public.agent_runs r where r.id=agent_run_id and r.employee_id=public.current_employee_id()));
create policy "task scope read" on public.tasks for select to authenticated using (assignee_id=public.current_employee_id() or created_by=public.current_employee_id() or exists(select 1 from public.employees e where e.id=assignee_id and e.office_id=public.current_office_id() and public.current_employee_role() in ('head_of_office','supervisor','leadership')));
create policy "task assigned update" on public.tasks for update to authenticated using (assignee_id=public.current_employee_id()) with check (assignee_id=public.current_employee_id());
create policy "task office create" on public.tasks for insert to authenticated with check (created_by=public.current_employee_id() and public.current_employee_role() in ('pension_assistant','grievance_officer','head_of_office','supervisor'));
create policy "task event scoped read" on public.task_events for select to authenticated using (exists(select 1 from public.tasks t where t.id=task_id and (t.assignee_id=public.current_employee_id() or t.created_by=public.current_employee_id() or public.current_employee_role() in ('head_of_office','supervisor','leadership'))));
create policy "task event self create" on public.task_events for insert to authenticated with check (actor_id=public.current_employee_id() and exists(select 1 from public.tasks t where t.id=task_id and (t.assignee_id=public.current_employee_id() or t.created_by=public.current_employee_id())));
create policy "approval participant read" on public.approval_requests for select to authenticated using (requested_by=public.current_employee_id() or reviewer_id=public.current_employee_id());
create policy "approval requester create" on public.approval_requests for insert to authenticated with check (requested_by=public.current_employee_id());
create policy "approval reviewer decide" on public.approval_requests for update to authenticated using (reviewer_id=public.current_employee_id() and status='pending') with check (reviewer_id=public.current_employee_id());
create policy "approval event participant read" on public.approval_events for select to authenticated using (exists(select 1 from public.approval_requests a where a.id=approval_id and (a.requested_by=public.current_employee_id() or a.reviewer_id=public.current_employee_id())));
create policy "audit restricted read" on public.audit_events for select to authenticated using (public.current_employee_role() in ('audit_officer','leadership') and (proposal_id is null or public.can_access_case(proposal_id)));
create policy "knowledge scoped read" on public.knowledge_changes for select to authenticated using (requester_id=public.current_employee_id() or reviewer_id=public.current_employee_id() or public.current_employee_role() in ('head_of_office','supervisor','leadership'));
create policy "connections authenticated read" on public.application_connections for select to authenticated using (true);
create policy "connection own requests" on public.connection_requests for select to authenticated using (requested_by=public.current_employee_id());
create policy "connection request create" on public.connection_requests for insert to authenticated with check (requested_by=public.current_employee_id());
create policy "ontology bounded read" on public.ontology_relationships for select to authenticated using (
  (subject_type='case' and public.can_access_case(subject_id)) or (object_type='case' and public.can_access_case(object_id))
  or subject_type='employee' and subject_id=public.current_employee_id()
  or object_type='employee' and object_id=public.current_employee_id()
);
create policy "project office read" on public.projects for select to authenticated using (owner_id=public.current_employee_id() or public.current_employee_role() in ('leadership','supervisor'));
create policy "meeting office read" on public.meetings for select to authenticated using (office_id=public.current_office_id() or public.current_employee_role() in ('leadership','supervisor'));
create policy "notification self access" on public.notifications for all to authenticated using (employee_id=public.current_employee_id()) with check (employee_id=public.current_employee_id());

insert into storage.buckets(id, name, public) values ('singularity-documents','singularity-documents',false) on conflict(id) do nothing;
create policy "private source storage read" on storage.objects for select to authenticated using (
  bucket_id='singularity-documents' and exists (
    select 1 from public.documents d where d.storage_path=name and (d.created_by=public.current_employee_id() or d.case_id is not null and public.can_access_case(d.case_id) or d.case_id is null and public.current_employee_role() in ('leadership','supervisor','audit_officer','head_of_office'))
  )
);
create policy "private export storage read" on storage.objects for select to authenticated using (
  bucket_id='singularity-documents' and exists(select 1 from public.document_exports e join public.documents d on d.id=e.document_id where e.storage_path=name and (e.created_by=public.current_employee_id() or d.case_id is not null and public.can_access_case(d.case_id)))
);
create policy "workspace private document upload" on storage.objects for insert to authenticated with check (
  bucket_id='singularity-documents' and name like public.current_employee_id() || '/%' and (
    exists (select 1 from public.documents d where d.created_by=public.current_employee_id())
    or exists (select 1 from public.document_exports e join public.documents d on d.id=e.document_id where e.storage_path=name and e.created_by=public.current_employee_id() and (d.case_id is null or public.can_access_case(d.case_id)))
  )
);
create policy "workspace private document update" on storage.objects for update to authenticated using (
  bucket_id='singularity-documents' and exists (select 1 from public.documents d where d.created_by=public.current_employee_id() and name like public.current_employee_id() || '/%')
) with check (bucket_id='singularity-documents' and exists (select 1 from public.documents d where d.created_by=public.current_employee_id() and name like public.current_employee_id() || '/%'));
create policy "workspace private document delete" on storage.objects for delete to authenticated using (
  bucket_id='singularity-documents' and exists (select 1 from public.documents d where d.created_by=public.current_employee_id() and name like public.current_employee_id() || '/%')
);
