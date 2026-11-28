-- Notes and question papers: course code, exam and year, AI checks and instant publishing. Safe to re-run.
-- Run after dashboard-4-community.sql (and dashboard-6-exams.sql, which holds the department list).

-- ============================================================
-- 1. New details on each upload (older uploads keep working with these empty)
-- ============================================================
alter table public.notes add column if not exists course_code text check (course_code ~ '^[A-Z0-9]{4,12}$');
alter table public.notes add column if not exists exam_type text check (exam_type in ('ia1', 'ia2', 'ia3', 'final'));
alter table public.notes add column if not exists exam_year smallint check (exam_year between 2000 and 2100);
alter table public.notes add column if not exists pages smallint check (pages between 1 and 2000);
alter table public.notes add column if not exists auto_published boolean not null default false;
create index if not exists notes_browse_idx on public.notes (status, kind, semester, course_code);

-- A new upload starts as pending, points only at the uploader's own file, and a question paper must say
-- which course, exam and year it is.
drop policy if exists "Upload notes" on public.notes;
create policy "Upload notes" on public.notes for insert to authenticated with check (
  uploader_id = auth.uid() and public.is_verified() and status = 'pending' and not auto_published and review_note is null
  and split_part(file ->> 'path', '/', 1) = auth.uid()::text
  and (kind <> 'paper' or (course_code is not null and exam_type is not null and exam_year is not null)));

-- A file that an upload points to cannot be removed (and so cannot be swapped) by its uploader.
-- Deleting the upload first frees the file. Admins can always remove files.
drop policy if exists "Remove own note files" on storage.objects;
create policy "Remove own note files" on storage.objects for delete to authenticated using (
  bucket_id = 'notes' and (
    public.is_admin()
    or ((storage.foldername(name))[1] = auth.uid()::text
        and not exists (select 1 from public.notes n where n.file ->> 'path' = name))));

-- ============================================================
-- 2. Daily limit on AI reading (it costs money or free quota)
-- ============================================================
create table if not exists public.note_reads (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists note_reads_user_idx on public.note_reads (user_id, created_at);
alter table public.note_reads enable row level security;
revoke all on public.note_reads from anon, authenticated;

create or replace function public.claim_note_read() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_verified() then return false; end if;
  perform pg_advisory_xact_lock(hashtext('note_read:' || auth.uid()::text));
  delete from public.note_reads where user_id = auth.uid() and created_at < now() - interval '1 day';
  if (select count(*) from public.note_reads where user_id = auth.uid()) >= 20 then return false; end if;
  insert into public.note_reads (user_id) values (auth.uid());
  return true;
end $$;
revoke execute on function public.claim_note_read() from public, anon;
grant execute on function public.claim_note_read() to authenticated;

-- ============================================================
-- 3. What the AI found in a file. Written only by the server (service role), so a student cannot fake it.
-- ============================================================
create table if not exists public.note_checks (
  path text primary key,                       -- the file in the notes bucket
  uploader_id uuid not null references auth.users (id) on delete cascade,
  sha256 text not null,
  passed boolean not null,                     -- clearly a question paper with every detail readable
  fields jsonb not null default '{}',          -- { courseCode, courseName, department, semester, examType, examYear }
  reasons text[] not null default '{}',        -- why it needs an admin, in plain words
  created_at timestamptz not null default now()
);
alter table public.note_checks enable row level security;
drop policy if exists "Read note checks" on public.note_checks;
create policy "Read note checks" on public.note_checks for select to authenticated using (public.is_admin() or uploader_id = auth.uid());
revoke insert, update, delete, truncate on public.note_checks from anon, authenticated;

-- Publishes a pending question paper at once, but only when the AI check of exactly this file passed and the
-- student's details agree with what the AI read. p_sha is the fingerprint the server computed from the stored file.
-- Anything else returns false and the upload waits for an admin.
create or replace function public.publish_checked_note(p_note uuid, p_sha text) returns boolean
language plpgsql security definer set search_path = public as $$
declare n public.notes; c public.note_checks; f jsonb;
begin
  select * into n from public.notes where id = p_note and status = 'pending' for update;
  if n.id is null or n.kind <> 'paper' then return false; end if;
  select * into c from public.note_checks where path = n.file ->> 'path';
  if c.path is null or not c.passed then return false; end if;
  f := c.fields;
  if c.uploader_id <> n.uploader_id or c.sha256 <> p_sha or n.sha256 <> p_sha then return false; end if;
  if n.course_code is distinct from (f ->> 'courseCode')
     or n.exam_type is distinct from (f ->> 'examType')
     or n.exam_year::text is distinct from (f ->> 'examYear')
     or n.semester::text is distinct from (f ->> 'semester')
     -- the department must match when the paper shows it (null = common to every department)
     or (coalesce((f ->> 'departmentKnown')::boolean, true) and n.branch is distinct from (f ->> 'department'))
     or n.subject is distinct from coalesce(f ->> 'courseName', f ->> 'courseCode')
     or n.description is not null then
    return false;
  end if;
  if n.title <> concat_ws(' · ', concat_ws(' ', n.course_code, nullif(n.subject, n.course_code)),
       case n.exam_type when 'ia1' then 'IA 1' when 'ia2' then 'IA 2' when 'ia3' then 'IA 3' else 'Final' end, n.exam_year::text) then
    return false;
  end if;
  update public.notes set status = 'approved', auto_published = true where id = n.id;
  insert into public.audit_log (actor, action, target_type, target_id, detail)
  values (n.uploader_id, 'note.auto_published', 'note', n.id::text, jsonb_build_object('title', n.title));
  return true;
end $$;
revoke execute on function public.publish_checked_note(uuid, text) from public, anon, authenticated;
grant execute on function public.publish_checked_note(uuid, text) to service_role;
