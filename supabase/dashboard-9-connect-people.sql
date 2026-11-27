-- CampusCast dashboard, stage 9: Connect people profiles (students and faculty). Safe to re-run.
-- Run after setup.sql and dashboard-1, -4 and -6 (it uses roles, blocks, the audit log and departments).
--
-- What this adds:
--   * profiles.person_type: 'student' (default) or 'faculty'. Only a super-admin can change it (set_person_type).
--   * people_profiles: the optional, opt-in Connect profile of a person. Hidden until the owner turns "visible" on.
--   * people_directory() and person_profile(): the only way other people read profiles. They return the name,
--     department and year plus what the owner chose to show, and never the USN, ID card or an email the owner
--     did not choose to show.
-- There is no phone number column on purpose: a profile points to LinkedIn for any further contact.

-- ============================================================
-- 1. Student or faculty
-- ============================================================
alter table public.profiles add column if not exists person_type text not null default 'student';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_person_type_check') then
    alter table public.profiles add constraint profiles_person_type_check check (person_type in ('student', 'faculty'));
  end if;
end $$;

-- Profile rows have no student update policy, so person_type can only be changed here.
create or replace function public.set_person_type(p_user uuid, p_type text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Only a super-admin can mark someone as faculty.' using errcode = '42501'; end if;
  if p_type not in ('student', 'faculty') then raise exception 'Unknown type.'; end if;
  update public.profiles set person_type = p_type where id = p_user;
  if not found then raise exception 'No such person.'; end if;
  perform public.log_audit('person.type_changed', 'profile', p_user::text, jsonb_build_object('person_type', p_type));
end $$;
revoke execute on function public.set_person_type(uuid, text) from public, anon;
grant execute on function public.set_person_type(uuid, text) to authenticated;

-- ============================================================
-- 2. Link and list checks (the same rules the app applies, enforced again here)
-- ============================================================
-- https only, a real host name, no user:password@, no spaces or control characters, at most 300 characters.
create or replace function public.connect_https_ok(u text) returns boolean
language sql immutable as $$
  select u is null or (char_length(u) <= 300 and u ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?(/[^[:space:][:cntrl:]]*)?$')
$$;

-- Every item of a jsonb list is an object, the list is short, and each "url" inside is an https link.
create or replace function public.connect_items_ok(items jsonb, max_items int) returns boolean
language sql immutable as $$
  select jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= max_items
    and not exists (
      select 1 from jsonb_array_elements(items) e
      where jsonb_typeof(e) <> 'object'
         or octet_length(e::text) > 1200
         or (e ? 'url' and jsonb_typeof(e -> 'url') not in ('string', 'null'))
         or (e ? 'url' and jsonb_typeof(e -> 'url') = 'string' and not public.connect_https_ok(e ->> 'url')))
$$;

-- ============================================================
-- 3. The profile itself
-- ============================================================
create table if not exists public.people_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  visible boolean not null default false,              -- opt-in: nobody else sees this row until the owner says so
  headline text check (char_length(headline) <= 120),
  about text check (char_length(about) <= 1200),
  skills text[] not null default '{}' check (cardinality(skills) <= 20),
  interests text[] not null default '{}' check (cardinality(interests) <= 20),
  goals text check (char_length(goals) <= 800),
  achievements jsonb not null default '[]' check (public.connect_items_ok(achievements, 15)),   -- [{title, detail, year}]
  -- faculty
  designation text check (char_length(designation) <= 120),
  research_areas text[] not null default '{}' check (cardinality(research_areas) <= 15),
  publications jsonb not null default '[]' check (public.connect_items_ok(publications, 30)),   -- [{title, venue, year, url}]
  work jsonb not null default '[]' check (public.connect_items_ok(work, 15)),                    -- [{title, detail, url}]
  career text check (char_length(career) <= 1200),
  open_to text check (char_length(open_to) <= 400),   -- e.g. "Guiding final-year projects"
  -- links and contact
  linkedin_url text check (linkedin_url ~ '^https://www\.linkedin\.com/in/[A-Za-z0-9._%-]{3,100}$'),
  github_url text check (github_url ~ '^https://github\.com/[A-Za-z0-9-]{1,39}$'),
  website_url text check (public.connect_https_ok(website_url)),
  show_email boolean not null default false,           -- shows the person's COLLEGE email, never a typed or personal one
  updated_at timestamptz not null default now()
);
create index if not exists people_profiles_visible_idx on public.people_profiles (visible) where visible;
alter table public.people_profiles enable row level security;

-- Faculty-only fields are emptied for students, so a student cannot present as faculty by filling them in.
create or replace function public.people_profiles_tidy() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  select person_type into t from public.profiles where id = new.user_id;
  if coalesce(t, 'student') <> 'faculty' then
    new.designation := null; new.research_areas := '{}'; new.publications := '[]'; new.work := '[]'; new.career := null; new.open_to := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists people_profiles_tidy on public.people_profiles;
create trigger people_profiles_tidy before insert or update on public.people_profiles
  for each row execute function public.people_profiles_tidy();

-- Owners manage their own row. Everyone else may read it only while it is visible, and only verified college
-- users who are not blocked either way. (The app reads other people through the functions below.)
drop policy if exists "Read own or visible people profiles" on public.people_profiles;
create policy "Read own or visible people profiles" on public.people_profiles for select to authenticated
  using (user_id = auth.uid() or (visible and public.is_verified() and not public.is_blocked_pair(user_id, auth.uid())));
drop policy if exists "Create own people profile" on public.people_profiles;
create policy "Create own people profile" on public.people_profiles for insert to authenticated
  with check (user_id = auth.uid() and public.is_verified());
drop policy if exists "Edit own people profile" on public.people_profiles;
create policy "Edit own people profile" on public.people_profiles for update to authenticated
  using (user_id = auth.uid() and public.is_verified()) with check (user_id = auth.uid() and public.is_verified());
drop policy if exists "Delete own people profile" on public.people_profiles;
create policy "Delete own people profile" on public.people_profiles for delete to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 4. Reading other people: the directory and one profile
-- ============================================================
drop function if exists public.people_directory(text, text, text, text, int, int);
create or replace function public.people_directory(
  p_type text default null, p_q text default null, p_dept text default null, p_skill text default null,
  p_limit int default 24, p_offset int default 0
) returns table (
  id uuid, full_name text, branch text, year smallint, person_type text, headline text, designation text,
  skills text[], interests text[], research_areas text[], linkedin_url text, is_me boolean, total bigint
) language sql stable security definer set search_path = public as $$
  with q as (select nullif(trim(coalesce(p_q, '')), '') as t, nullif(lower(trim(coalesce(p_skill, ''))), '') as s)
  select p.id, p.full_name, p.branch, p.year::smallint, p.person_type, pp.headline, pp.designation,
         pp.skills, pp.interests, pp.research_areas, pp.linkedin_url, p.id = auth.uid(), count(*) over ()
  from public.people_profiles pp
  join public.profiles p on p.id = pp.user_id and p.status = 'verified'
  cross join q
  where public.is_verified()
    and pp.visible
    and not public.is_blocked_pair(p.id, auth.uid())
    and (p_type is null or p_type = '' or p.person_type = p_type)
    and (p_dept is null or p_dept = '' or p.branch = p_dept)
    and (q.s is null or exists (select 1 from unnest(pp.skills || pp.interests || pp.research_areas) x where lower(x) = q.s))
    and (q.t is null or (
          coalesce(p.full_name, '') || ' ' || coalesce(pp.headline, '') || ' ' || coalesce(pp.designation, '') || ' ' ||
          array_to_string(pp.skills || pp.interests || pp.research_areas, ' ')
        ) ilike '%' || replace(replace(replace(q.t, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  order by p.full_name nulls last, p.id
  limit greatest(1, least(coalesce(p_limit, 24), 60)) offset greatest(0, coalesce(p_offset, 0))
$$;
revoke execute on function public.people_directory(text, text, text, text, int, int) from public, anon;
grant execute on function public.people_directory(text, text, text, text, int, int) to authenticated;

-- One profile. The owner always gets their own (even hidden, so they can preview it); others only a visible one.
drop function if exists public.person_profile(uuid);
create or replace function public.person_profile(p_id uuid) returns table (
  id uuid, full_name text, branch text, year smallint, person_type text, is_me boolean, visible boolean,
  headline text, about text, skills text[], interests text[], goals text, achievements jsonb,
  designation text, research_areas text[], publications jsonb, work jsonb, career text, open_to text,
  linkedin_url text, github_url text, website_url text, email text, updated_at timestamptz
) language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.branch, p.year::smallint, p.person_type, p.id = auth.uid(), pp.visible,
         pp.headline, pp.about, pp.skills, pp.interests, pp.goals, pp.achievements,
         pp.designation, pp.research_areas, pp.publications, pp.work, pp.career, pp.open_to,
         pp.linkedin_url, pp.github_url, pp.website_url,
         case when pp.show_email then p.email end, pp.updated_at
  from public.people_profiles pp
  join public.profiles p on p.id = pp.user_id and p.status = 'verified'
  where public.is_verified() and pp.user_id = p_id
    and (p.id = auth.uid() or (pp.visible and not public.is_blocked_pair(p.id, auth.uid())))
$$;
revoke execute on function public.person_profile(uuid) from public, anon;
grant execute on function public.person_profile(uuid) to authenticated;

-- Reports about a person use the existing 'user' kind from dashboard-4.
