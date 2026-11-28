-- Stage 6: AI-assisted examination management (database layer). Safe to re-run.
-- Run after setup.sql and dashboard-1 ... dashboard-5.
--
-- Workflow:  department admin uploads a PDF  ->  extraction (stage 2)  ->  admin reviews and corrects
--            ->  submit  ->  central admin (super_admin) approves, rejects or requests changes  ->  publish
--            ->  students of the matching department and semester are notified and see it.
-- Nothing reaches students before a super_admin publishes it. Status only changes through
-- exam_notice_transition(), never by a direct update.
--
-- Roles (profiles.role = 'admin' for both, told apart by which department lists they have):
--   uploader / information staff : admin with profiles.admin_depts   -> upload, review, edit, submit
--   approver (HOD / cluster head): admin with profiles.approver_depts -> approve, request changes, reject, publish, archive
--   super_admin (central admin)   : everything, for every department
-- A person who submitted a notice cannot approve or publish it (a super_admin can, and it is written in the history).

-- ============================================================
-- 1. Profile columns
-- ============================================================
-- Semester is worked out from the batch and today's date (see exam_semester). If an admin sets this column it wins;
-- set it back to null to return to the automatic value.
alter table public.profiles add column if not exists semester smallint check (semester between 1 and 8);
-- Departments an 'admin' may manage exam notices for. Changed only by a super_admin (set_admin_depts).
alter table public.profiles add column if not exists admin_depts text[] not null default '{}';
-- Departments an 'admin' may APPROVE and publish exam notices for: a head of department has one, a cluster head several.
-- Changed only by a super_admin (set_approver_depts).
alter table public.profiles add column if not exists approver_depts text[] not null default '{}';

-- ============================================================
-- 2. Departments (dynamic: add a row, no code change)
-- ============================================================
-- name matches profiles.branch, which is also what announcements and exams use for audiences.
create table if not exists public.departments (
  name text primary key,
  code text not null unique,
  active boolean not null default true,
  sort smallint not null default 0
);
alter table public.departments enable row level security;
drop policy if exists "Read departments" on public.departments;
create policy "Read departments" on public.departments for select to authenticated using (public.is_verified() or public.is_admin());
drop policy if exists "Super admins manage departments" on public.departments;
create policy "Super admins manage departments" on public.departments for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

insert into public.departments (name, code, sort) values
  ('Computer Science & Engineering', 'CSE', 1),
  ('AI & Machine Learning', 'AI&ML', 2),
  ('Information Science & Engineering', 'ISE', 3),
  ('Computer Science & Business Systems', 'CSBS', 4),
  ('AI & Data Science', 'AI&DS', 5),
  ('Electronics & Communication Engineering', 'ECE', 6),
  ('Electrical & Electronics Engineering', 'EEE', 7),
  ('Electronics & Telecommunication Engineering', 'E&TC', 8),
  ('Mechanical Engineering', 'MECH', 9),
  ('Civil Engineering', 'CIVIL', 10)
on conflict (name) do nothing;

-- ============================================================
-- 3. Examination categories (the only names students see)
-- ============================================================
create table if not exists public.exam_categories (
  code text primary key,
  label text not null unique,
  sort smallint not null,
  is_special boolean not null default false
);
alter table public.exam_categories enable row level security;
drop policy if exists "Read exam categories" on public.exam_categories;
create policy "Read exam categories" on public.exam_categories for select to authenticated using (public.is_verified() or public.is_admin());
insert into public.exam_categories (code, label, sort, is_special) values
  ('ia1', 'IA 1', 1, false),
  ('ia2', 'IA 2', 2, false),
  ('ia3', 'IA 3', 3, false),
  ('final', 'Final Examination', 4, false),
  ('special', 'Special Examination', 9, true)
on conflict (code) do update set label = excluded.label, sort = excluded.sort, is_special = excluded.is_special;

-- ============================================================
-- 4. Helpers
-- ============================================================
-- A student's current semester: profiles.semester if set, otherwise from the batch.
-- The academic year starts in August; semesters run Aug-Jan (odd) and Feb-Jul (even).
create or replace function public.exam_semester(p_uid uuid default auth.uid()) returns smallint
language plpgsql stable security definer set search_path = public as $$
declare
  p record;
  t timestamp := (now() at time zone 'Asia/Kolkata');
  m integer := extract(month from t);
  y integer := extract(year from t);
  start_year integer;
  study integer;
  sem integer;
begin
  select semester, batch, year into p from public.profiles where id = p_uid;
  if not found then return null; end if;
  if p.semester is not null then return p.semester; end if;
  start_year := case when m >= 8 then y else y - 1 end;
  if p.batch is not null then study := start_year - p.batch + 1;
  elsif p.year is not null then study := p.year;
  else return null;
  end if;
  study := least(5, greatest(1, study));
  sem := case when (m >= 8 or m = 1) then 2 * study - 1 else 2 * study end;
  return least(8, sem)::smallint;
end $$;
revoke execute on function public.exam_semester(uuid) from public, anon;
grant execute on function public.exam_semester(uuid) to authenticated;

-- May the signed-in user create and edit notices for exactly these departments?
-- super_admin: any. admin: only when every department is one of their admin_depts.
create or replace function public.can_manage_exam_depts(p_depts text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.is_super_admin() then true
    when public.is_admin() then coalesce(cardinality(p_depts), 0) > 0
      and p_depts <@ coalesce((select admin_depts from public.profiles where id = auth.uid()), '{}')
    else false
  end
$$;
grant execute on function public.can_manage_exam_depts(text[]) to authenticated;

-- May the signed-in user approve / publish notices for exactly these departments?
-- super_admin: any. admin: only when every department is one of their approver_depts (a cluster head covers several).
create or replace function public.can_approve_exam_depts(p_depts text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.is_super_admin() then true
    when public.is_admin() then coalesce(cardinality(p_depts), 0) > 0
      and p_depts <@ coalesce((select approver_depts from public.profiles where id = auth.uid()), '{}')
    else false
  end
$$;
grant execute on function public.can_approve_exam_depts(text[]) to authenticated;

-- May the signed-in admin at least see notices that touch one of their departments (as uploader or approver)?
create or replace function public.can_see_exam_depts(p_depts text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.is_super_admin() then true
    when public.is_admin() then coalesce(p_depts && (select admin_depts || approver_depts from public.profiles where id = auth.uid()), false)
    else false
  end
$$;
grant execute on function public.can_see_exam_depts(text[]) to authenticated;

-- Is this notice for the signed-in student? Department must match; semester must match unless the notice is for all semesters.
create or replace function public.exam_audience_match(p_depts text[], p_sems smallint[], p_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_uid and p.status = 'verified'
      and p.branch = any (p_depts)
      and (p_sems is null or public.exam_semester(p_uid) = any (p_sems))
  )
$$;
revoke execute on function public.exam_audience_match(text[], smallint[], uuid) from public, anon;
grant execute on function public.exam_audience_match(text[], smallint[], uuid) to authenticated;

-- Super admin chooses which departments an admin manages.
create or replace function public.set_admin_depts(p_user uuid, p_depts text[]) returns void
language plpgsql security definer set search_path = public as $$
declare bad text[];
begin
  if not public.is_super_admin() then raise exception 'Only a super-admin can assign departments.' using errcode = '42501'; end if;
  p_depts := coalesce(p_depts, '{}');
  select array_agg(d) into bad from unnest(p_depts) d where not exists (select 1 from public.departments x where x.name = d and x.active);
  if bad is not null then raise exception 'Unknown department: %', bad[1]; end if;
  update public.profiles set admin_depts = p_depts where id = p_user and role = 'admin';
  if not found then raise exception 'That person is not a department admin.'; end if;
  perform public.log_audit('exam.admin_depts', 'profile', p_user::text, jsonb_build_object('departments', p_depts));
end $$;
grant execute on function public.set_admin_depts(uuid, text[]) to authenticated;

-- Super admin chooses which departments a head of department / cluster head may approve.
create or replace function public.set_approver_depts(p_user uuid, p_depts text[]) returns void
language plpgsql security definer set search_path = public as $$
declare bad text[];
begin
  if not public.is_super_admin() then raise exception 'Only a super-admin can assign approvers.' using errcode = '42501'; end if;
  p_depts := coalesce(p_depts, '{}');
  select array_agg(d) into bad from unnest(p_depts) d where not exists (select 1 from public.departments x where x.name = d and x.active);
  if bad is not null then raise exception 'Unknown department: %', bad[1]; end if;
  update public.profiles set approver_depts = p_depts where id = p_user and role = 'admin';
  if not found then raise exception 'That person is not a department admin.'; end if;
  perform public.log_audit('exam.approver_depts', 'profile', p_user::text, jsonb_build_object('departments', p_depts));
end $$;
grant execute on function public.set_approver_depts(uuid, text[]) to authenticated;

-- ============================================================
-- 5. Examination notices
-- ============================================================
create table if not exists public.exam_notices (
  id uuid primary key default gen_random_uuid(),
  notice_type text not null default 'timetable' check (notice_type in ('notification', 'timetable', 'guidelines', 'result', 'circular')),
  -- Standard CampusCast category. Null means "Requires Admin Review": the extraction could not decide.
  category text references public.exam_categories (code),
  special_kind text check (special_kind in ('supplementary', 'practical', 'laboratory', 'revaluation', 'other')),
  title text not null check (char_length(title) between 3 and 200),
  original_exam_name text,                      -- wording exactly as in the PDF (CIE 1, SEE, ...)
  audience_depts text[] not null check (cardinality(audience_depts) >= 1),
  semesters smallint[] check (semesters is null or (cardinality(semesters) >= 1 and semesters <@ array[1, 2, 3, 4, 5, 6, 7, 8]::smallint[])),  -- null = every semester
  degree_programme text not null default 'Bachelor''s',
  academic_year text check (academic_year ~ '^\d{4}-\d{2}$'),
  regulation text,
  notification_date date,
  details jsonb not null default '{}',          -- { important_dates: [], instructions: [], hall_ticket: [], required_documents: [], other: [] }
  result_link text check (result_link is null or result_link ~* '^https?://'),
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'changes_requested', 'approved', 'rejected', 'published', 'archived')),
  review_note text,
  created_by uuid references auth.users (id) on delete set null,
  submitted_by uuid references auth.users (id) on delete set null,
  submitted_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (special_kind is null or category = 'special'),
  -- An unclear category must be classified by a person before approval.
  check (status not in ('approved', 'published') or category is not null)
);
create index if not exists exam_notices_status_idx on public.exam_notices (status, created_at desc);
create index if not exists exam_notices_audience_idx on public.exam_notices using gin (audience_depts);
alter table public.exam_notices enable row level security;

-- Direct updates may not change the workflow fields: only exam_notice_transition() does.
create or replace function public.exam_notices_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare via_transition boolean := coalesce(current_setting('campuscast.exam_transition', true), '') = 'on';
begin
  new.updated_at := now();
  if auth.uid() is null or via_transition then return new; end if;   -- database console or the transition function
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'A new notice must start as a draft.' using errcode = '42501'; end if;
    return new;
  end if;
  if new.status is distinct from old.status
     or new.review_note is distinct from old.review_note
     or new.submitted_by is distinct from old.submitted_by or new.submitted_at is distinct from old.submitted_at
     or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at
     or new.published_by is distinct from old.published_by or new.published_at is distinct from old.published_at
     or new.archived_at is distinct from old.archived_at or new.created_by is distinct from old.created_by then
    raise exception 'Use the submit / approve / publish actions to change a notice''s status.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists exam_notices_guard on public.exam_notices;
create trigger exam_notices_guard before insert or update on public.exam_notices
  for each row execute function public.exam_notices_guard();

drop policy if exists "Read exam notices" on public.exam_notices;
create policy "Read exam notices" on public.exam_notices for select to authenticated using (
  public.can_see_exam_depts(audience_depts)
  or (status = 'published' and public.exam_audience_match(audience_depts, semesters))
);
drop policy if exists "Create exam notices" on public.exam_notices;
create policy "Create exam notices" on public.exam_notices for insert to authenticated
  with check (public.can_manage_exam_depts(audience_depts) and created_by = auth.uid() and status = 'draft');
drop policy if exists "Edit exam notices" on public.exam_notices;
create policy "Edit exam notices" on public.exam_notices for update to authenticated
  using (public.can_manage_exam_depts(audience_depts) and status in ('draft', 'changes_requested'))
  with check (public.can_manage_exam_depts(audience_depts));
drop policy if exists "Delete draft exam notices" on public.exam_notices;
create policy "Delete draft exam notices" on public.exam_notices for delete to authenticated
  using (public.can_manage_exam_depts(audience_depts) and status = 'draft');

-- ============================================================
-- 6. Source PDFs
-- ============================================================
create table if not exists public.exam_documents (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.exam_notices (id) on delete cascade,
  storage_path text not null unique,            -- in the exam-pdfs bucket: <uploader id>/<file id>.pdf
  original_filename text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),   -- a PDF, or a photo of the notice
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),   -- finds the same file uploaded twice
  page_count smallint check (page_count is null or page_count > 0),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
-- Set when the stored PDF is removed some days after the exams (see dashboard-7-exam-alerts.sql). The row stays.
alter table public.exam_documents add column if not exists deleted_at timestamptz;
-- Tables created before photos were allowed: widen the type check (re-running this file is enough).
alter table public.exam_documents drop constraint if exists exam_documents_mime_type_check;
alter table public.exam_documents add constraint exam_documents_mime_type_check check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp'));
create index if not exists exam_documents_notice_idx on public.exam_documents (notice_id);
create index if not exists exam_documents_sha_idx on public.exam_documents (sha256);
alter table public.exam_documents enable row level security;

-- Is this notice editable by the signed-in admin right now?
create or replace function public.exam_notice_editable(p_notice uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.exam_notices n
    where n.id = p_notice and n.status in ('draft', 'changes_requested') and public.can_manage_exam_depts(n.audience_depts)
  )
$$;
grant execute on function public.exam_notice_editable(uuid) to authenticated;

-- Same file already uploaded for a notice the signed-in admin can manage?
create or replace function public.exam_find_duplicates(p_sha256 text)
returns table (notice_id uuid, title text, status text, audience_depts text[])
language sql stable security definer set search_path = public as $$
  select n.id, n.title, n.status, n.audience_depts
  from public.exam_documents d join public.exam_notices n on n.id = d.notice_id
  where d.sha256 = lower(p_sha256) and n.status <> 'archived' and public.is_admin() and public.can_manage_exam_depts(n.audience_depts)
$$;
grant execute on function public.exam_find_duplicates(text) to authenticated;

-- Whoever can read the notice can read its documents' rows (students only for published notices).
drop policy if exists "Read exam documents" on public.exam_documents;
create policy "Read exam documents" on public.exam_documents for select to authenticated
  using (exists (select 1 from public.exam_notices n where n.id = exam_documents.notice_id));
drop policy if exists "Add exam documents" on public.exam_documents;
create policy "Add exam documents" on public.exam_documents for insert to authenticated
  with check (uploaded_by = auth.uid() and public.exam_notice_editable(notice_id));
drop policy if exists "Remove exam documents" on public.exam_documents;
create policy "Remove exam documents" on public.exam_documents for delete to authenticated
  using (public.exam_notice_editable(notice_id));

-- ============================================================
-- 7. Extraction results (one row per processing attempt of a document)
-- ============================================================
create table if not exists public.exam_extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.exam_documents (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  attempt smallint not null default 1,
  error text,
  model text,
  ocr_used boolean not null default false,
  pages jsonb not null default '[]',            -- [{ page, method: 'text' | 'ocr', text }]  (page numbers preserved)
  result jsonb,                                 -- the structured notice, checked against the schema
  field_meta jsonb not null default '{}',       -- per field: { confidence, source: 'explicit' | 'inferred' | 'missing', pages: [] }
  corrections jsonb not null default '{}',      -- what the admin changed afterwards
  requires_review boolean not null default true,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists exam_extractions_doc_idx on public.exam_extractions (document_id, created_at desc);
create index if not exists exam_extractions_queue_idx on public.exam_extractions (created_at) where status in ('queued', 'processing');
alter table public.exam_extractions enable row level security;

create or replace function public.exam_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists exam_extractions_touch on public.exam_extractions;
create trigger exam_extractions_touch before update on public.exam_extractions for each row execute function public.exam_touch();

-- Students never see extraction data; admins see it for the departments they manage.
create or replace function public.exam_document_manageable(p_doc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.exam_documents d join public.exam_notices n on n.id = d.notice_id
    where d.id = p_doc and public.can_manage_exam_depts(n.audience_depts)
  )
$$;
grant execute on function public.exam_document_manageable(uuid) to authenticated;

drop policy if exists "Admins read extractions" on public.exam_extractions;
create policy "Admins read extractions" on public.exam_extractions for select to authenticated
  using (public.exam_document_manageable(document_id));
drop policy if exists "Admins start extractions" on public.exam_extractions;
create policy "Admins start extractions" on public.exam_extractions for insert to authenticated
  with check (public.exam_document_manageable(document_id));
drop policy if exists "Admins update extractions" on public.exam_extractions;
create policy "Admins update extractions" on public.exam_extractions for update to authenticated
  using (public.exam_document_manageable(document_id)) with check (public.exam_document_manageable(document_id));

-- ============================================================
-- 8. Timetable rows
-- ============================================================
create table if not exists public.exam_timetable_entries (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.exam_notices (id) on delete cascade,
  department text references public.departments (name) on update cascade,
  semester smallint check (semester between 1 and 8),
  category text references public.exam_categories (code),
  original_exam_name text,
  subject_name text,
  subject_code text,
  exam_date date,
  start_time time,
  end_time time,
  session text,                                  -- e.g. FN / AN, as written in the PDF
  reporting_time time,
  notes text,
  source_page smallint,
  confidence numeric(3, 2) check (confidence is null or confidence between 0 and 1),
  needs_review boolean not null default false,
  sort smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time is null or end_time is null or end_time > start_time)
);
create index if not exists exam_entries_notice_idx on public.exam_timetable_entries (notice_id, exam_date, start_time);
alter table public.exam_timetable_entries enable row level security;
drop trigger if exists exam_entries_touch on public.exam_timetable_entries;
create trigger exam_entries_touch before update on public.exam_timetable_entries for each row execute function public.exam_touch();

drop policy if exists "Read timetable entries" on public.exam_timetable_entries;
create policy "Read timetable entries" on public.exam_timetable_entries for select to authenticated
  using (exists (select 1 from public.exam_notices n where n.id = exam_timetable_entries.notice_id));
drop policy if exists "Add timetable entries" on public.exam_timetable_entries;
create policy "Add timetable entries" on public.exam_timetable_entries for insert to authenticated
  with check (public.exam_notice_editable(notice_id));
drop policy if exists "Edit timetable entries" on public.exam_timetable_entries;
create policy "Edit timetable entries" on public.exam_timetable_entries for update to authenticated
  using (public.exam_notice_editable(notice_id)) with check (public.exam_notice_editable(notice_id));
drop policy if exists "Remove timetable entries" on public.exam_timetable_entries;
create policy "Remove timetable entries" on public.exam_timetable_entries for delete to authenticated
  using (public.exam_notice_editable(notice_id));

-- ============================================================
-- 9. Approval history (written only by exam_notice_transition)
-- ============================================================
create table if not exists public.exam_approvals (
  id bigint generated always as identity primary key,
  notice_id uuid not null references public.exam_notices (id) on delete cascade,
  action text not null check (action in ('submit', 'resubmit', 'approve', 'reject', 'request_changes', 'publish', 'archive')),
  from_status text not null,
  to_status text not null,
  actor uuid references auth.users (id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  check (action not in ('reject', 'request_changes') or char_length(trim(coalesce(reason, ''))) >= 3)
);
create index if not exists exam_approvals_notice_idx on public.exam_approvals (notice_id, created_at);
alter table public.exam_approvals enable row level security;
drop policy if exists "Admins read approval history" on public.exam_approvals;
create policy "Admins read approval history" on public.exam_approvals for select to authenticated
  using (public.is_admin() and exists (select 1 from public.exam_notices n where n.id = exam_approvals.notice_id));

-- ============================================================
-- 10. The workflow
-- ============================================================
--   submit            draft | changes_requested  -> pending_approval   (department admin of those departments, or super_admin)
--   approve           pending_approval           -> approved           (approver of ALL its departments, or super_admin; not the submitter)
--   reject            pending_approval           -> rejected           (same, reason required)
--   request_changes   pending_approval           -> changes_requested  (same, reason required)
--   publish           approved                   -> published          (same, not the submitter) + notifies the audience
--   archive           approved | published | rejected -> archived      (same)
create or replace function public.exam_notice_transition(p_id uuid, p_action text, p_reason text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  n public.exam_notices;
  v_to text;
  v_log text := p_action;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_bad integer;
  v_label text;
begin
  if auth.uid() is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  select * into n from public.exam_notices where id = p_id for update;
  if not found then raise exception 'Notice not found.' using errcode = 'P0002'; end if;

  if p_action = 'submit' then
    if not public.can_manage_exam_depts(n.audience_depts) then raise exception 'Not allowed.' using errcode = '42501'; end if;
    if n.status not in ('draft', 'changes_requested') then raise exception 'Only a draft or a notice with requested changes can be submitted.'; end if;
    if n.category is null then raise exception 'Choose the examination category first: this notice still requires admin review.'; end if;
    if n.notice_type = 'timetable' then
      if not exists (select 1 from public.exam_timetable_entries where notice_id = n.id) then raise exception 'A timetable needs at least one row.'; end if;
      select count(*) into v_bad from public.exam_timetable_entries where notice_id = n.id and (coalesce(trim(subject_name), '') = '' or exam_date is null);
      if v_bad > 0 then raise exception '% timetable row(s) are missing a subject or a date.', v_bad; end if;
    end if;
    v_to := 'pending_approval';
    if n.status = 'changes_requested' then v_log := 'resubmit'; end if;
  elsif p_action in ('approve', 'reject', 'request_changes', 'publish', 'archive') then
    if not public.can_approve_exam_depts(n.audience_depts) then
      raise exception 'Only the head of department or cluster head for all of this notice''s departments (or a central admin) can do that.' using errcode = '42501';
    end if;
    -- The person who sent a notice in does not approve or publish it. A central admin may, and the history says so.
    if p_action in ('approve', 'publish') and n.submitted_by is not distinct from auth.uid() then
      if not public.is_super_admin() then raise exception 'You submitted this notice, so someone else must %.', p_action using errcode = '42501'; end if;
      v_reason := trim(coalesce(v_reason || ' ', '') || '(done by the central admin who submitted it)');
    end if;
    if p_action in ('approve', 'reject', 'request_changes') and n.status <> 'pending_approval' then raise exception 'That notice is not waiting for approval.'; end if;
    if p_action = 'publish' and n.status <> 'approved' then raise exception 'Only an approved notice can be published.'; end if;
    if p_action = 'archive' and n.status not in ('approved', 'published', 'rejected') then raise exception 'That notice cannot be archived now.'; end if;
    if p_action in ('reject', 'request_changes') and (v_reason is null or char_length(v_reason) < 3) then raise exception 'Please give a reason.'; end if;
    v_to := case p_action when 'approve' then 'approved' when 'reject' then 'rejected' when 'request_changes' then 'changes_requested'
                          when 'publish' then 'published' else 'archived' end;
  else
    raise exception 'Unknown action.';
  end if;

  perform set_config('campuscast.exam_transition', 'on', true);
  update public.exam_notices set
    status = v_to,
    submitted_by = case when p_action = 'submit' then auth.uid() else submitted_by end,
    submitted_at = case when p_action = 'submit' then now() else submitted_at end,
    reviewed_by = case when p_action in ('approve', 'reject', 'request_changes') then auth.uid() else reviewed_by end,
    reviewed_at = case when p_action in ('approve', 'reject', 'request_changes') then now() else reviewed_at end,
    review_note = case when p_action = 'submit' then null when p_action in ('approve', 'reject', 'request_changes') then v_reason else review_note end,
    published_by = case when p_action = 'publish' then auth.uid() else published_by end,
    published_at = case when p_action = 'publish' then now() else published_at end,
    archived_at = case when p_action = 'archive' then now() else archived_at end
  where id = n.id;
  perform set_config('campuscast.exam_transition', 'off', true);

  insert into public.exam_approvals (notice_id, action, from_status, to_status, actor, reason)
  values (n.id, v_log, n.status, v_to, auth.uid(), v_reason);
  perform public.log_audit('exam.' || v_log, 'exam_notice', n.id::text, jsonb_build_object('from', n.status, 'to', v_to, 'reason', v_reason));

  -- Approvers hear about a notice that is waiting (the heads who cover all its departments; if there are none, the
  -- central admins). The person who submitted hears what was decided. Both are in-app plus email per their settings.
  if p_action = 'submit' then
    insert into public.notifications (user_id, kind, title, body, url, urgency, ref_id)
    select p.id, 'exam_review', 'Exam notice waiting for your approval: ' || n.title,
           'Submitted for ' || array_to_string(n.audience_depts, ', '), '/dashboard/admin/exams/' || n.id, 1, n.id
    from public.profiles p
    where p.status = 'verified' and p.role in ('admin', 'super_admin') and p.id is distinct from auth.uid()
      and (case when exists (select 1 from public.profiles c where c.status = 'verified' and c.role = 'admin' and c.id is distinct from auth.uid() and n.audience_depts <@ c.approver_depts)
                then p.role = 'admin' and n.audience_depts <@ p.approver_depts
                else p.role = 'super_admin' end);
  elsif p_action in ('approve', 'reject', 'request_changes', 'publish') and coalesce(n.submitted_by, n.created_by) is not null
        and coalesce(n.submitted_by, n.created_by) is distinct from auth.uid() then
    insert into public.notifications (user_id, kind, title, body, url, urgency, ref_id)
    values (coalesce(n.submitted_by, n.created_by),
            'exam_status',
            case p_action when 'approve' then 'Approved: ' when 'reject' then 'Rejected: ' when 'request_changes' then 'Changes requested: ' else 'Published to students: ' end || n.title,
            v_reason, '/dashboard/admin/exams/' || n.id, 1, n.id);
  end if;

  -- Students hear about it only now, when it goes live: in-app, and by email/push per their settings.
  if p_action = 'publish' then
    select label into v_label from public.exam_categories where code = n.category;
    insert into public.notifications (user_id, kind, title, body, url, urgency, ref_id)
    select p.id, 'exam_notice', coalesce(v_label, 'Examination') || ': ' || n.title,
           'Published ' || to_char(now() at time zone 'Asia/Kolkata', 'DD Mon YYYY'),
           '/dashboard/exams?notice=' || n.id, 2, n.id
    from public.profiles p
    where p.status = 'verified' and p.id is distinct from auth.uid()
      and p.branch = any (n.audience_depts)
      and (n.semesters is null or public.exam_semester(p.id) = any (n.semesters));
  end if;

  return v_to;
end $$;
revoke execute on function public.exam_notice_transition(uuid, text, text) from public, anon;
grant execute on function public.exam_notice_transition(uuid, text, text) to authenticated;

-- ============================================================
-- 11. Private storage for the original PDFs
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exam-pdfs', 'exam-pdfs', false, 20971520, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Admins upload into their own folder: exam-pdfs/<their user id>/<file>.pdf
drop policy if exists "Admins upload exam PDFs" on storage.objects;
create policy "Admins upload exam PDFs" on storage.objects for insert to authenticated
  with check (bucket_id = 'exam-pdfs' and public.is_admin() and (storage.foldername(name))[1] = auth.uid()::text);

-- Read: the uploader, or anyone who can read the notice the file belongs to (the notice rules above decide:
-- department admins for their departments, super admins for all, students only once it is published and theirs).
drop policy if exists "Read exam PDFs" on storage.objects;
create policy "Read exam PDFs" on storage.objects for select to authenticated
  using (bucket_id = 'exam-pdfs' and (
    ((storage.foldername(name))[1] = auth.uid()::text and public.is_admin())
    or exists (select 1 from public.exam_documents d where d.storage_path = storage.objects.name)
  ));

-- Remove: the uploader while the file is not part of a published notice, or a super admin.
drop policy if exists "Remove exam PDFs" on storage.objects;
create policy "Remove exam PDFs" on storage.objects for delete to authenticated
  using (bucket_id = 'exam-pdfs' and (
    public.is_super_admin()
    or ((storage.foldername(name))[1] = auth.uid()::text and public.is_admin()
        and not exists (select 1 from public.exam_documents d join public.exam_notices n on n.id = d.notice_id
                        where d.storage_path = storage.objects.name and n.status in ('pending_approval', 'approved', 'published')))
  ));
