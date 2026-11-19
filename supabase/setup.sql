-- CampusCast database setup.
-- Run once in the Supabase dashboard: SQL Editor > New query > paste this file > Run.
-- Safe to run again: every statement replaces or skips what already exists.

-- ============================================================
-- 1. College email rule
-- ============================================================
-- Extra college domains that don't end in .edu / .ac.xx / .edu.xx
-- (for example a college that uses "@mycollege.in"). Add rows here:
--   insert into public.allowed_college_domains (domain) values ('mycollege.in');
create table if not exists public.allowed_college_domains (
  domain text primary key check (domain = lower(domain))
);
alter table public.allowed_college_domains enable row level security;

-- BMS Institute of Technology (student emails look like 25ug1byai282@bmsit.in).
insert into public.allowed_college_domains (domain) values ('bmsit.in') on conflict do nothing;

-- True when the email belongs to a college:
--   *.edu, *.edu.<country> (e.g. vit.edu, college.edu.in),
--   *.ac.<country> (e.g. iitb.ac.in, ox.ac.uk),
--   or a domain (or subdomain of one) listed in allowed_college_domains.
create or replace function public.is_college_email(email text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d text := lower(split_part(coalesce(email, ''), '@', 2));
begin
  if d = '' or position('.' in d) = 0 then
    return false;
  end if;
  if d ~ '\.edu$' or d ~ '\.edu\.[a-z]{2}$' or d ~ '\.ac\.[a-z]{2}$' then
    return true;
  end if;
  return exists (
    select 1 from public.allowed_college_domains a
    where d = a.domain or d like '%.' || a.domain
  );
end;
$$;
grant execute on function public.is_college_email(text) to anon, authenticated;

-- Block non-college sign-ups inside Supabase itself, so the rule holds even if
-- someone calls the Supabase API directly instead of using the website.
create or replace function public.enforce_college_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_college_email(new.email) then
    raise exception 'Please sign up with your college email address.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_college_email on auth.users;
create trigger enforce_college_email
  before insert or update of email on auth.users
  for each row execute function public.enforce_college_email();

-- ============================================================
-- 2. Student profiles and verification status
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  branch text,
  year smallint check (year between 1 and 5),
  id_card_front text,           -- storage path in the id-cards bucket
  id_card_back text,
  status text not null default 'unverified'
    check (status in ('unverified', 'pending', 'verified', 'rejected')),
  review_note text,             -- reason shown to the student when rejected
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
-- Read from the college email when it has the student format (e.g. 25ug1byai282@bmsit.in).
alter table public.profiles add column if not exists batch smallint;  -- year joined, e.g. 2025
alter table public.profiles add column if not exists usn text;        -- e.g. 1BY25AI282
alter table public.profiles enable row level security;

-- Students can read their own profile. They can't write to the table directly:
-- they go through submit_verification() below, so nobody can mark themselves verified.
drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);

-- Create a profile row for every new user, using the name given at sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles for users who signed up before this script ran.
insert into public.profiles (id, email, full_name)
select u.id, u.email, nullif(u.raw_user_meta_data ->> 'full_name', '')
from auth.users u
on conflict (id) do nothing;

-- Students call this to send their details and ID card for review.
drop function if exists public.submit_verification(text, text, smallint, text, text);
create or replace function public.submit_verification(
  p_full_name text,
  p_branch text,
  p_year smallint,
  p_id_card_front text,
  p_id_card_back text default null,
  p_batch smallint default null,
  p_usn text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  current_status text;
begin
  if uid is null then
    raise exception 'Not signed in.';
  end if;
  if not public.is_college_email((select email from auth.users where id = uid)) then
    raise exception 'Only college email accounts can be verified.';
  end if;
  if coalesce(trim(p_full_name), '') = '' or coalesce(trim(p_branch), '') = '' then
    raise exception 'Name and branch are required.';
  end if;
  if p_year is null or p_year not between 1 and 5 then
    raise exception 'Year must be between 1 and 5.';
  end if;
  -- ID card files must sit in the student's own folder.
  if p_id_card_front is null or split_part(p_id_card_front, '/', 1) <> uid::text
     or (p_id_card_back is not null and split_part(p_id_card_back, '/', 1) <> uid::text) then
    raise exception 'Invalid ID card upload.';
  end if;

  select status into current_status from public.profiles where id = uid;
  if current_status = 'verified' then
    raise exception 'Your profile is already verified.';
  end if;

  insert into public.profiles (id, email, full_name, branch, year, batch, usn, id_card_front, id_card_back, status, review_note, submitted_at)
  values (uid, (select email from auth.users where id = uid), trim(p_full_name), trim(p_branch), p_year,
          p_batch, upper(nullif(trim(p_usn), '')), p_id_card_front, p_id_card_back, 'pending', null, now())
  on conflict (id) do update set
    full_name = excluded.full_name,
    branch = excluded.branch,
    year = excluded.year,
    batch = excluded.batch,
    usn = excluded.usn,
    id_card_front = excluded.id_card_front,
    id_card_back = excluded.id_card_back,
    status = 'pending',
    review_note = null,
    submitted_at = now(),
    reviewed_at = null;
end;
$$;
revoke execute on function public.submit_verification(text, text, smallint, text, text, smallint, text) from public, anon;
grant execute on function public.submit_verification(text, text, smallint, text, text, smallint, text) to authenticated;

-- ============================================================
-- 3. Private storage for ID card images
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('id-cards', 'id-cards', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Each student can upload to, and view, only their own folder: id-cards/<user id>/...
drop policy if exists "Upload own ID card" on storage.objects;
create policy "Upload own ID card" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'id-cards' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "View own ID card" on storage.objects;
create policy "View own ID card" on storage.objects
  for select to authenticated
  using (bucket_id = 'id-cards' and (storage.foldername(name))[1] = auth.uid()::text);

-- ===========
=================================================
-- Reviewing students (for now, in the dashboard)
-- ============================================================
-- Table Editor > profiles: filter status = pending, open the ID card from
-- Storage > id-cards > <user id>, then set status to 'verified' (or 'rejected'
-- with a review_note explaining why) and reviewed_at to now().
