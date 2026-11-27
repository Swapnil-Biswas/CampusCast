-- CampusCast dashboard, stage 10: fill a Connect profile with AI from a resume, a LinkedIn export and GitHub.
-- Safe to re-run. Run after dashboard-9-connect-people.sql.
--
-- What this adds:
--   * the private storage bucket "profile-files" (resume and LinkedIn export). Only the owner can see, add or
--     remove their files. Not even admins or super-admins can read them.
--   * people_readings: the owner's last AI reading (a DRAFT). Only the owner can read it. Nothing here is ever
--     shown to anyone else: it becomes part of a profile only when the owner presses Save in the editor.
--   * use_profile_reading(): a limit on how many readings one person can start per hour (AI cost).

-- ============================================================
-- 1. Private files
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-files', 'profile-files', false, 8388608, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Read own profile files" on storage.objects;
create policy "Read own profile files" on storage.objects for select to authenticated
  using (bucket_id = 'profile-files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Upload own profile files" on storage.objects;
create policy "Upload own profile files" on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-files' and public.is_verified() and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Remove own profile files" on storage.objects;
create policy "Remove own profile files" on storage.objects for delete to authenticated
  using (bucket_id = 'profile-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- 2. The last reading (a draft only its owner can see)
-- ============================================================
create table if not exists public.people_readings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  draft jsonb not null default '{}' check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 60000),
  created_at timestamptz not null default now()
);
alter table public.people_readings enable row level security;
drop policy if exists "Own reading" on public.people_readings;
create policy "Own reading" on public.people_readings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_verified());

-- ============================================================
-- 3. At most 8 readings an hour per person
-- ============================================================
-- No policies on purpose: only the function below can touch this table, so nobody can reset their own count.
create table if not exists public.people_reading_quota (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_start timestamptz not null default now(),
  used int not null default 0
);
alter table public.people_reading_quota enable row level security;
revoke all on public.people_reading_quota from anon, authenticated;

create or replace function public.use_profile_reading() returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_verified() then raise exception 'Only verified users can do this.' using errcode = '42501'; end if;
  insert into public.people_reading_quota as q (user_id, window_start, used) values (auth.uid(), now(), 1)
  on conflict (user_id) do update set
    used = case when q.window_start < now() - interval '1 hour' then 1 else least(q.used + 1, 1000) end,
    window_start = case when q.window_start < now() - interval '1 hour' then now() else q.window_start end
  returning used into n;
  return n <= 8;
end $$;
revoke execute on function public.use_profile_reading() from public, anon;
grant execute on function public.use_profile_reading() to authenticated;
