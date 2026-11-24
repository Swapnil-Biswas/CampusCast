-- Stage 3: official modules (exams, workshops, hackathons, cultural events). Safe to re-run.

-- ============================================================
-- Exams, timetables and results
-- ============================================================
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'exam' check (kind in ('exam', 'timetable', 'result')),
  title text not null check (char_length(title) between 3 and 140),
  course_code text,
  exam_at timestamptz,
  duration_min integer check (duration_min is null or duration_min between 5 and 600),
  venue text,
  notes text,
  audience_depts text[],
  audience_years smallint[],
  file jsonb,                                   -- { name, path, size, type } in announcement-files
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'exam' or exam_at is not null)
);
create index if not exists exams_when_idx on public.exams (exam_at);
alter table public.exams enable row level security;
drop policy if exists "Read exams" on public.exams;
create policy "Read exams" on public.exams for select to authenticated
  using (public.is_admin() or (public.is_verified() and public.audience_match(audience_depts, audience_years, null)));
drop policy if exists "Admins manage exams" on public.exams;
create policy "Admins manage exams" on public.exams for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- A new exam is announced (Soon); a change to its date, time or venue is announced as Now so nobody misses it.
create or replace function public.exams_announce() returns trigger
language plpgsql security definer set search_path = public as $$
declare changed text;
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.kind = 'exam' then
      insert into public.announcements (author_id, title, body, category, urgency, audience_depts, audience_years, event_at, status)
      values (auth.uid(), 'Exam scheduled: ' || new.title,
              coalesce(new.course_code || ' · ', '') || to_char(new.exam_at at time zone 'Asia/Kolkata', 'FMDay DD Mon, HH12:MI AM') || coalesce(' · ' || new.venue, ''),
              'exam', 2, new.audience_depts, new.audience_years, new.exam_at, 'live');
    end if;
    return new;
  end if;
  if new.kind = 'exam' and (new.exam_at is distinct from old.exam_at or new.venue is distinct from old.venue) then
    changed := case when new.exam_at is distinct from old.exam_at and new.venue is distinct from old.venue then 'time and venue'
                    when new.exam_at is distinct from old.exam_at then 'time' else 'venue' end;
    insert into public.announcements (author_id, title, body, category, urgency, audience_depts, audience_years, event_at, status)
    values (auth.uid(), 'Exam ' || changed || ' changed: ' || new.title,
            'Now: ' || to_char(new.exam_at at time zone 'Asia/Kolkata', 'FMDay DD Mon, HH12:MI AM') || coalesce(' · ' || new.venue, '')
              || E'\nWas: ' || coalesce(to_char(old.exam_at at time zone 'Asia/Kolkata', 'FMDay DD Mon, HH12:MI AM'), '-') || coalesce(' · ' || old.venue, ''),
            'exam', 0, new.audience_depts, new.audience_years, new.exam_at, 'live');
  end if;
  return new;
end $$;
drop trigger if exists exams_announce_ins on public.exams;
create trigger exams_announce_ins after insert on public.exams for each row execute function public.exams_announce();
drop trigger if exists exams_announce_upd on public.exams;
create trigger exams_announce_upd before update on public.exams for each row execute function public.exams_announce();

-- ============================================================
-- Workshops: seat cap, waitlist with automatic promotion
-- ============================================================
create table if not exists public.workshops (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 140),
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue text,
  seats integer not null default 50 check (seats between 1 and 5000),
  reg_closes_at timestamptz,
  audience_depts text[],
  audience_years smallint[],
  club_id uuid references public.clubs (id) on delete set null,
  organizer_id uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.workshops enable row level security;
drop policy if exists "Read workshops" on public.workshops;
create policy "Read workshops" on public.workshops for select to authenticated
  using (public.is_admin() or organizer_id = auth.uid() or (public.is_verified() and public.audience_match(audience_depts, audience_years, null)));
drop policy if exists "Create workshops" on public.workshops;
create policy "Create workshops" on public.workshops for insert to authenticated
  with check (organizer_id = auth.uid() and (public.is_admin() or (club_id is not null and public.can_publish(club_id))));
drop policy if exists "Edit workshops" on public.workshops;
create policy "Edit workshops" on public.workshops for update to authenticated
  using (public.is_admin() or organizer_id = auth.uid()) with check (public.is_admin() or organizer_id = auth.uid());
drop policy if exists "Delete workshops" on public.workshops;
create policy "Delete workshops" on public.workshops for delete to authenticated using (public.is_admin() or organizer_id = auth.uid());

create table if not exists public.workshop_registrations (
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'registered' check (status in ('registered', 'waitlist')),
  created_at timestamptz not null default now(),
  primary key (workshop_id, user_id)
);
alter table public.workshop_registrations enable row level security;
drop policy if exists "Read own registrations" on public.workshop_registrations;
create policy "Read own registrations" on public.workshop_registrations for select to authenticated using (user_id = auth.uid());
-- Writes only through register_workshop / cancel_registration below.

create or replace function public._workshop_reminders(p_w public.workshops, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t timestamptz;
begin
  foreach t in array array[p_w.starts_at - interval '24 hours', p_w.starts_at - interval '1 hour'] loop
    if t > now() then
      insert into public.reminders (user_id, kind, ref_id, title, url, remind_at)
      values (p_user, 'workshop', p_w.id, p_w.title, '/dashboard/workshops', t) on conflict do nothing;
    end if;
  end loop;
end $$;
revoke execute on function public._workshop_reminders(public.workshops, uuid) from public, anon, authenticated;

create or replace function public.register_workshop(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare w public.workshops; taken integer; st text;
begin
  if not public.is_verified() then raise exception 'Verify your student ID first.' using errcode = '42501'; end if;
  select * into w from public.workshops where id = p_id for update;
  if w.id is null then raise exception 'Workshop not found.'; end if;
  if not public.audience_match(w.audience_depts, w.audience_years, null) then raise exception 'This workshop is not open to your department or year.' using errcode = '42501'; end if;
  if w.starts_at <= now() then raise exception 'This workshop has already started.'; end if;
  if w.reg_closes_at is not null and w.reg_closes_at <= now() then raise exception 'Registration has closed.'; end if;
  if exists (select 1 from public.workshop_registrations where workshop_id = p_id and user_id = auth.uid()) then
    return (select status from public.workshop_registrations where workshop_id = p_id and user_id = auth.uid());
  end if;
  select count(*) into taken from public.workshop_registrations where workshop_id = p_id and status = 'registered';
  st := case when taken < w.seats then 'registered' else 'waitlist' end;
  insert into public.workshop_registrations (workshop_id, user_id, status) values (p_id, auth.uid(), st);
  if st = 'registered' then perform public._workshop_reminders(w, auth.uid()); end if;
  return st;
end $$;
grant execute on function public.register_workshop(uuid) to authenticated;

create or replace function public.cancel_registration(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare w public.workshops; was text; nxt uuid;
begin
  select * into w from public.workshops where id = p_id for update;
  select status into was from public.workshop_registrations where workshop_id = p_id and user_id = auth.uid();
  if was is null then return; end if;
  delete from public.workshop_registrations where workshop_id = p_id and user_id = auth.uid();
  delete from public.reminders where user_id = auth.uid() and kind = 'workshop' and ref_id = p_id and sent_at is null;
  if was = 'registered' then
    select user_id into nxt from public.workshop_registrations where workshop_id = p_id and status = 'waitlist' order by created_at limit 1 for update;
    if nxt is not null then
      update public.workshop_registrations set status = 'registered' where workshop_id = p_id and user_id = nxt;
      perform public._workshop_reminders(w, nxt);
      insert into public.notifications (user_id, kind, title, body, url, urgency, ref_id)
      values (nxt, 'workshop', 'You got a seat: ' || w.title, 'A seat opened up and you moved off the waitlist.', '/dashboard/workshops', 1, w.id);
    end if;
  end if;
end $$;
grant execute on function public.cancel_registration(uuid) to authenticated;

-- Seats left and waitlist length for every workshop the caller can see.
create or replace function public.workshop_counts() returns table (workshop_id uuid, registered integer, waitlist integer)
language sql stable security definer set search_path = public as $$
  select w.id,
         (select count(*)::integer from public.workshop_registrations r where r.workshop_id = w.id and r.status = 'registered'),
         (select count(*)::integer from public.workshop_registrations r where r.workshop_id = w.id and r.status = 'waitlist')
  from public.workshops w
  where public.is_admin() or w.organizer_id = auth.uid() or (public.is_verified() and public.audience_match(w.audience_depts, w.audience_years, null))
$$;
grant execute on function public.workshop_counts() to authenticated;

-- Attendee list for organisers and admins (used for the CSV export).
create or replace function public.workshop_attendees(p_id uuid)
returns table (status text, registered_at timestamptz, full_name text, email text, usn text, branch text, year smallint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or exists (select 1 from public.workshops where id = p_id and organizer_id = auth.uid())) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  return query select r.status, r.created_at, p.full_name, p.email, p.usn, p.branch, p.year::smallint
    from public.workshop_registrations r join public.profiles p on p.id = r.user_id
    where r.workshop_id = p_id order by r.status, r.created_at;
end $$;
grant execute on function public.workshop_attendees(uuid) to authenticated;

-- ============================================================
-- Hackathons
-- ============================================================
create table if not exists public.hackathons (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 140),
  theme text not null default 'Open innovation',
  mode text not null default 'offline' check (mode in ('online', 'offline', 'hybrid')),
  description text,
  location text,
  starts_at timestamptz,
  deadline timestamptz not null,
  team_min smallint not null default 1 check (team_min between 1 and 10),
  team_max smallint not null default 4 check (team_max between 1 and 10),
  prize text,
  link text,
  club_id uuid references public.clubs (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.hackathons enable row level security;
drop policy if exists "Read hackathons" on public.hackathons;
create policy "Read hackathons" on public.hackathons for select to authenticated using (public.is_verified());
drop policy if exists "Manage hackathons" on public.hackathons;
create policy "Manage hackathons" on public.hackathons for all to authenticated
  using (public.is_admin() or (club_id is not null and public.can_publish(club_id)))
  with check (public.is_admin() or (club_id is not null and public.can_publish(club_id)));

create table if not exists public.hackathon_interest (
  hackathon_id uuid not null references public.hackathons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (hackathon_id, user_id)
);
alter table public.hackathon_interest enable row level security;
drop policy if exists "Own hackathon interest" on public.hackathon_interest;
create policy "Own hackathon interest" on public.hackathon_interest for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_verified());

create or replace function public.hackathon_counts() returns table (hackathon_id uuid, interested integer)
language sql stable security definer set search_path = public as $$
  select h.id, (select count(*)::integer from public.hackathon_interest i where i.hackathon_id = h.id)
  from public.hackathons h where public.is_verified()
$$;
grant execute on function public.hackathon_counts() to authenticated;

-- ============================================================
-- Cultural events and club RSVPs
-- ============================================================
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 140),
  description text,
  starts_at timestamptz not null,
  venue text,
  club_id uuid references public.clubs (id) on delete set null,
  poster jsonb,                                  -- { name, path } in event-media
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.events enable row level security;
drop policy if exists "Read events" on public.events;
create policy "Read events" on public.events for select to authenticated using (public.is_verified());
drop policy if exists "Manage events" on public.events;
create policy "Manage events" on public.events for all to authenticated
  using (public.is_admin() or (club_id is not null and public.can_publish(club_id)))
  with check (public.is_admin() or (club_id is not null and public.can_publish(club_id)));

create table if not exists public.event_rsvps (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('interested', 'going')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.event_rsvps enable row level security;
drop policy if exists "Own RSVPs" on public.event_rsvps;
create policy "Own RSVPs" on public.event_rsvps for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_verified());

create or replace function public.event_counts() returns table (event_id uuid, interested integer, going integer)
language sql stable security definer set search_path = public as $$
  select e.id,
         (select count(*)::integer from public.event_rsvps r where r.event_id = e.id and r.status = 'interested'),
         (select count(*)::integer from public.event_rsvps r where r.event_id = e.id and r.status = 'going')
  from public.events e where public.is_verified()
$$;
grant execute on function public.event_counts() to authenticated;

-- Poster and gallery images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-media', 'event-media', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Verified read event media" on storage.objects;
create policy "Verified read event media" on storage.objects for select to authenticated
  using (bucket_id = 'event-media' and public.is_verified());
drop policy if exists "Publishers upload event media" on storage.objects;
create policy "Publishers upload event media" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-media' and (storage.foldername(name))[1] = auth.uid()::text
              and (public.is_admin() or exists (select 1 from public.club_admins where user_id = auth.uid())));
drop policy if exists "Publishers remove event media" on storage.objects;
create policy "Publishers remove event media" on storage.objects for delete to authenticated
  using (bucket_id = 'event-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
