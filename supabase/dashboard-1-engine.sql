-- CampusCast dashboard, stage 1: roles, clubs, the announcement engine, read receipts,
-- bookmarks, reminders, in-app notifications and the audit log.
-- Run after setup.sql. Safe to run again: every statement replaces or skips what already exists.

create extension if not exists pg_trgm;

-- ============================================================
-- 1. Roles and helper functions
-- ============================================================
alter table public.profiles add column if not exists role text not null default 'student';
alter table public.profiles add column if not exists interests text[] not null default '{}';
alter table public.profiles add column if not exists skills text[] not null default '{}';
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists section text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles add constraint profiles_role_check check (role in ('student', 'admin', 'super_admin'));
  end if;
end $$;

create or replace function public.is_verified() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'verified' from public.profiles where id = auth.uid()), false)
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'verified' and role in ('admin', 'super_admin') from public.profiles where id = auth.uid()), false)
$$;
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'verified' and role = 'super_admin' from public.profiles where id = auth.uid()), false)
$$;
grant execute on function public.is_verified(), public.is_admin(), public.is_super_admin() to authenticated;

-- Admins can read every profile (for the verification queue and analytics).
drop policy if exists "Admins read profiles" on public.profiles;
create policy "Admins read profiles" on public.profiles for select to authenticated using (public.is_admin());

-- Students edit only these fields of their own profile. Role and status can never be changed from here.
create or replace function public.update_my_profile(p_bio text, p_skills text[], p_interests text[], p_section text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  update public.profiles set
    bio = nullif(left(trim(coalesce(p_bio, '')), 400), ''),
    skills = coalesce((select array_agg(distinct left(trim(s), 30)) from unnest(coalesce(p_skills, '{}')) s where trim(s) <> ''), '{}'),
    interests = coalesce((select array_agg(distinct left(trim(s), 30)) from unnest(coalesce(p_interests, '{}')) s where trim(s) <> ''), '{}'),
    section = nullif(left(trim(coalesce(p_section, '')), 10), '')
  where id = auth.uid();
end $$;
grant execute on function public.update_my_profile(text, text[], text[], text) to authenticated;

-- ============================================================
-- 2. Audit log
-- ============================================================
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
drop policy if exists "Admins read audit log" on public.audit_log;
create policy "Admins read audit log" on public.audit_log for select to authenticated using (public.is_admin());

create or replace function public.log_audit(p_action text, p_type text, p_id text, p_detail jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (actor, action, target_type, target_id, detail) values (auth.uid(), p_action, p_type, p_id, coalesce(p_detail, '{}'))
$$;
revoke execute on function public.log_audit(text, text, text, jsonb) from public, anon, authenticated;

-- ============================================================
-- 3. Clubs
-- ============================================================
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  color text not null default '#e8603c',
  created_at timestamptz not null default now()
);
alter table public.clubs enable row level security;
drop policy if exists "Verified read clubs" on public.clubs;
create policy "Verified read clubs" on public.clubs for select to authenticated using (public.is_verified());
drop policy if exists "Admins manage clubs" on public.clubs;
create policy "Admins manage clubs" on public.clubs for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.club_follows (
  user_id uuid not null references auth.users (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, club_id)
);
alter table public.club_follows enable row level security;
drop policy if exists "Read own follows" on public.club_follows;
create policy "Read own follows" on public.club_follows for select to authenticated using (user_id = auth.uid());
drop policy if exists "Follow clubs" on public.club_follows;
create policy "Follow clubs" on public.club_follows for insert to authenticated with check (user_id = auth.uid() and public.is_verified());
drop policy if exists "Unfollow clubs" on public.club_follows;
create policy "Unfollow clubs" on public.club_follows for delete to authenticated using (user_id = auth.uid());

-- Students who lead a club can publish to that club's followers (never Now or Today).
create table if not exists public.club_admins (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (club_id, user_id)
);
alter table public.club_admins enable row level security;
drop policy if exists "Read club admins" on public.club_admins;
create policy "Read club admins" on public.club_admins for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "Super admins manage club admins" on public.club_admins;
create policy "Super admins manage club admins" on public.club_admins for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

insert into public.clubs (name, slug, description, color) values
  ('Coding Club', 'coding', 'Hackathons, DSA nights and open source sprints.', '#8ec5d6'),
  ('Robotics Club', 'robotics', 'Build bots, compete, and learn embedded systems.', '#e8603c'),
  ('Dance Club', 'dance', 'Crews, choreography and fest performances.', '#c58ad1'),
  ('Music Club', 'music', 'Bands, jam sessions and open mics.', '#f3b63f'),
  ('Photography Club', 'photography', 'Photo walks, editing workshops and exhibitions.', '#7fb48a'),
  ('Literary Club', 'literary', 'Debates, quizzes, creative writing and poetry.', '#ffb8c6'),
  ('E-Cell', 'ecell', 'Startups, pitch nights and mentoring from founders.', '#f3b63f'),
  ('NSS', 'nss', 'Community drives, blood donation and volunteering.', '#7fb48a')
on conflict (slug) do nothing;

-- ============================================================
-- 4. Announcements
-- ============================================================
-- urgency: 0 Now, 1 Today, 2 Soon, 3 FYI
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users (id) on delete set null,
  title text not null check (char_length(title) between 3 and 140),
  body text not null check (char_length(body) between 1 and 4000),
  category text not null default 'general' check (category in ('general', 'department', 'exam', 'workshop', 'hackathon', 'cultural')),
  urgency smallint not null default 2 check (urgency between 0 and 3),
  audience_depts text[],                 -- null = every department
  audience_years smallint[],             -- null = every year
  audience_club uuid references public.clubs (id) on delete set null,   -- null = not club-only
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  event_at timestamptz,
  pinned boolean not null default false,
  attachments jsonb not null default '[]',
  status text not null default 'live' check (status in ('draft', 'scheduled', 'live', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || coalesce(body, ''))) stored
);
create index if not exists announcements_search_idx on public.announcements using gin (search);
create index if not exists announcements_feed_idx on public.announcements (status, publish_at desc);
alter table public.announcements enable row level security;

create or replace function public.audience_match(p_depts text[], p_years smallint[], p_club uuid, p_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_uid and p.status = 'verified'
      and (p_depts is null or p.branch = any (p_depts))
      and (p_years is null or p.year = any (p_years))
      and (p_club is null or exists (select 1 from public.club_follows f where f.user_id = p_uid and f.club_id = p_club))
  )
$$;
grant execute on function public.audience_match(text[], smallint[], uuid, uuid) to authenticated;

create or replace function public.can_publish(p_club uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (p_club is not null and public.is_verified()
          and exists (select 1 from public.club_admins where user_id = auth.uid() and club_id = p_club))
$$;
grant execute on function public.can_publish(uuid) to authenticated;

drop policy if exists "Read announcements" on public.announcements;
create policy "Read announcements" on public.announcements for select to authenticated using (
  public.is_admin() or author_id = auth.uid() or (
    status = 'live' and publish_at <= now() and (expires_at is null or expires_at > now())
    and public.audience_match(audience_depts, audience_years, audience_club)
  )
);
drop policy if exists "Publish announcements" on public.announcements;
create policy "Publish announcements" on public.announcements for insert to authenticated
  with check (author_id = auth.uid() and public.can_publish(audience_club));
drop policy if exists "Edit announcements" on public.announcements;
create policy "Edit announcements" on public.announcements for update to authenticated
  using (public.is_admin() or author_id = auth.uid())
  with check (public.is_admin() or (author_id = auth.uid() and public.can_publish(audience_club)));
drop policy if exists "Delete announcements" on public.announcements;
create policy "Delete announcements" on public.announcements for delete to authenticated
  using (public.is_admin() or author_id = auth.uid());

-- Rules the interface cannot be trusted with.
create or replace function public.announcements_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.urgency <= 1 and not public.is_admin() then
    raise exception 'Only admins can mark a notice Now or Today.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then new.author_id := coalesce(new.author_id, auth.uid()); end if;
  new.updated_at := now();
  if new.status = 'live' and new.publish_at > now() then new.status := 'scheduled'; end if;
  if new.status = 'scheduled' and new.publish_at <= now() then new.status := 'live'; end if;
  return new;
end $$;
drop trigger if exists announcements_guard on public.announcements;
create trigger announcements_guard before insert or update on public.announcements
  for each row execute function public.announcements_guard();

-- ============================================================
-- 5. Notifications (in-app), preferences, push subscriptions
-- ============================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'announcement',
  title text not null,
  body text,
  url text,
  urgency smallint not null default 2,
  ref_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "Read own notifications" on public.notifications;
create policy "Read own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists "Update own notifications" on public.notifications;
create policy "Update own notifications" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Delete own notifications" on public.notifications;
create policy "Delete own notifications" on public.notifications for delete to authenticated using (user_id = auth.uid());

create table if not exists public.notification_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  in_app boolean not null default true,
  email boolean not null default true,
  push boolean not null default false,
  digest boolean not null default true,
  urgent_overrides_quiet boolean not null default true,
  quiet_start smallint check (quiet_start between 0 and 23),
  quiet_end smallint check (quiet_end between 0 and 23)
);
alter table public.notification_prefs enable row level security;
drop policy if exists "Own prefs" on public.notification_prefs;
create policy "Own prefs" on public.notification_prefs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "Own push subscriptions" on public.push_subscriptions;
create policy "Own push subscriptions" on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- When a notice goes live, every student in its audience gets an in-app notification.
create or replace function public.fanout_announcement(a public.announcements) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.notifications (user_id, kind, title, body, url, urgency, ref_id)
  select p.id, 'announcement', a.title, left(a.body, 160), '/dashboard?open=' || a.id, a.urgency, a.id
  from public.profiles p
  where p.status = 'verified'
    and p.id is distinct from a.author_id
    and (a.audience_depts is null or p.branch = any (a.audience_depts))
    and (a.audience_years is null or p.year = any (a.audience_years))
    and (a.audience_club is null or exists (select 1 from public.club_follows f where f.user_id = p.id and f.club_id = a.audience_club));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.fanout_announcement(public.announcements) from public, anon, authenticated;

create or replace function public.announcements_fanout_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'live' and (tg_op = 'INSERT' or old.status is distinct from 'live') then
    perform public.fanout_announcement(new);
  end if;
  return new;
end $$;
drop trigger if exists announcements_fanout on public.announcements;
-- Fires on any update: the guard trigger can flip scheduled to live without status being in the SET list.
create trigger announcements_fanout after insert or update on public.announcements
  for each row execute function public.announcements_fanout_trigger();

-- Scheduled notices go live when their time comes (called every minute by pg_cron in stage 5).
create or replace function public.publish_due() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.announcements set status = 'live' where status = 'scheduled' and publish_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.publish_due() from public, anon, authenticated;

-- ============================================================
-- 6. Read receipts, bookmarks, reminders
-- ============================================================
create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  acked_at timestamptz,
  primary key (announcement_id, user_id)
);
alter table public.announcement_reads enable row level security;
drop policy if exists "Own reads" on public.announcement_reads;
create policy "Own reads" on public.announcement_reads for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "Record own reads" on public.announcement_reads;
create policy "Record own reads" on public.announcement_reads for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.announcements a where a.id = announcement_id));
drop policy if exists "Update own reads" on public.announcement_reads;
create policy "Update own reads" on public.announcement_reads for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Delete own reads" on public.announcement_reads;
create policy "Delete own reads" on public.announcement_reads for delete to authenticated using (user_id = auth.uid());

create table if not exists public.bookmarks (
  user_id uuid not null references auth.users (id) on delete cascade,
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, announcement_id)
);
alter table public.bookmarks enable row level security;
drop policy if exists "Own bookmarks" on public.bookmarks;
create policy "Own bookmarks" on public.bookmarks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Reminders for anything with a date: notices, exams, workshops, hackathons, events (sent in stage 5).
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  ref_id uuid,
  title text not null,
  url text,
  remind_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref_id, remind_at)
);
create index if not exists reminders_due_idx on public.reminders (remind_at) where sent_at is null;
alter table public.reminders enable row level security;
drop policy if exists "Own reminders" on public.reminders;
create policy "Own reminders" on public.reminders for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- 7. Admin tools: reach preview, per-notice analytics, verification review, roles
-- ============================================================
create or replace function public.audience_size(p_depts text[], p_years smallint[], p_club uuid)
returns integer language plpgsql stable security definer set search_path = public as $$
declare n integer;
begin
  if not public.can_publish(p_club) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  select count(*) into n from public.profiles p
  where p.status = 'verified'
    and (p_depts is null or p.branch = any (p_depts))
    and (p_years is null or p.year = any (p_years))
    and (p_club is null or exists (select 1 from public.club_follows f where f.user_id = p.id and f.club_id = p_club));
  return n;
end $$;
grant execute on function public.audience_size(text[], smallint[], uuid) to authenticated;

create or replace function public.announcement_stats(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a public.announcements; result jsonb;
begin
  select * into a from public.announcements where id = p_id;
  if a.id is null then raise exception 'Notice not found.'; end if;
  if not (public.is_admin() or a.author_id = auth.uid()) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  with aud as (
    select p.id, p.branch, p.year, r.read_at, r.acked_at
    from public.profiles p
    left join public.announcement_reads r on r.announcement_id = a.id and r.user_id = p.id
    where p.status = 'verified'
      and (a.audience_depts is null or p.branch = any (a.audience_depts))
      and (a.audience_years is null or p.year = any (a.audience_years))
      and (a.audience_club is null or exists (select 1 from public.club_follows f where f.user_id = p.id and f.club_id = a.audience_club))
  )
  select jsonb_build_object(
    'audience', (select count(*) from aud),
    'reads', (select count(*) from aud where read_at is not null),
    'acks', (select count(*) from aud where acked_at is not null),
    'by_branch', coalesce((select jsonb_agg(jsonb_build_object('label', coalesce(branch, 'Unknown'), 'audience', n, 'reads', r) order by n desc)
                  from (select branch, count(*) n, count(read_at) r from aud group by branch) x), '[]'),
    'by_year', coalesce((select jsonb_agg(jsonb_build_object('label', 'Year ' || year, 'audience', n, 'reads', r) order by year)
                  from (select year, count(*) n, count(read_at) r from aud group by year) x), '[]'),
    'unread', coalesce((select jsonb_agg(jsonb_build_object('name', pr.full_name, 'usn', pr.usn, 'branch', pr.branch, 'year', pr.year) order by pr.full_name)
                  from aud join public.profiles pr on pr.id = aud.id where aud.read_at is null), '[]')
  ) into result;
  return result;
end $$;
grant execute on function public.announcement_stats(uuid) to authenticated;

create or replace function public.review_verification(p_user uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not allowed.' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'You cannot review your own verification.'; end if;
  update public.profiles set
    status = case when p_approve then 'verified' else 'rejected' end,
    review_note = case when p_approve then null else nullif(trim(coalesce(p_note, '')), '') end,
    reviewed_at = now()
  where id = p_user and status in ('pending', 'rejected', 'verified');
  if not found then raise exception 'That student has no submission to review.'; end if;
  perform public.log_audit(case when p_approve then 'verification.approved' else 'verification.rejected' end, 'profile', p_user::text, jsonb_build_object('note', p_note));
  insert into public.notifications (user_id, kind, title, body, url, urgency)
  values (p_user, 'verification',
          case when p_approve then 'Your student ID was approved' else 'Your student ID needs another try' end,
          case when p_approve then 'Welcome to CampusCast. Your feed is ready.' else coalesce(nullif(trim(p_note), ''), 'Please submit a clearer photo.') end,
          '/dashboard', case when p_approve then 3 else 1 end);
end $$;
grant execute on function public.review_verification(uuid, boolean, text) to authenticated;

create or replace function public.set_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare supers integer;
begin
  if not public.is_super_admin() then raise exception 'Only a super-admin can change roles.' using errcode = '42501'; end if;
  if p_role not in ('student', 'admin', 'super_admin') then raise exception 'Unknown role.'; end if;
  if p_user = auth.uid() and p_role <> 'super_admin' then
    select count(*) into supers from public.profiles where role = 'super_admin' and status = 'verified';
    if supers <= 1 then raise exception 'You are the only super-admin; make someone else one first.'; end if;
  end if;
  update public.profiles set role = p_role where id = p_user;
  perform public.log_audit('role.changed', 'profile', p_user::text, jsonb_build_object('role', p_role));
end $$;
grant execute on function public.set_role(uuid, text) to authenticated;

-- Admins can open ID card photos to review them; students can still only see their own.
drop policy if exists "Admins view ID cards" on storage.objects;
create policy "Admins view ID cards" on storage.objects for select to authenticated
  using (bucket_id = 'id-cards' and public.is_admin());

-- ============================================================
-- 8. Storage for notice attachments
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('announcement-files', 'announcement-files', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Verified read notice files" on storage.objects;
create policy "Verified read notice files" on storage.objects for select to authenticated
  using (bucket_id = 'announcement-files' and public.is_verified());
drop policy if exists "Publishers upload notice files" on storage.objects;
create policy "Publishers upload notice files" on storage.objects for insert to authenticated
  with check (bucket_id = 'announcement-files' and (storage.foldername(name))[1] = auth.uid()::text
              and (public.is_admin() or exists (select 1 from public.club_admins where user_id = auth.uid())));
drop policy if exists "Publishers remove own notice files" on storage.objects;
create policy "Publishers remove own notice files" on storage.objects for delete to authenticated
  using (bucket_id = 'announcement-files' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
