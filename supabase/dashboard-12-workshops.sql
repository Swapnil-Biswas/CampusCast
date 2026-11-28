-- Stage 12: workshops with posters, AI reading and draft / publish. Safe to re-run.
-- Run after setup.sql, dashboard-1-engine.sql and dashboard-3-official.sql (which created `workshops`).
-- If dashboard-3 is ever run again, run this file again too (dashboard-3 puts back the older workshop rules).
--
-- Who posts: an admin, or the admin of a club (club_admins). Nobody else has to approve. The AI only fills in a DRAFT
-- from an uploaded poster; a person always presses Publish. Students see only published (or cancelled) workshops.

-- ============================================================
-- 1. More details on workshops
-- ============================================================
alter table public.workshops add column if not exists status text not null default 'published';
alter table public.workshops add column if not exists organizer_name text;      -- when the organiser is not one of the clubs
alter table public.workshops add column if not exists tagline text;
alter table public.workshops add column if not exists mode text not null default 'offline';
alter table public.workshops add column if not exists map_url text;
alter table public.workshops add column if not exists speaker_name text;
alter table public.workshops add column if not exists speaker_about text;
alter table public.workshops add column if not exists topics text[] not null default '{}';
alter table public.workshops add column if not exists prerequisites text;
alter table public.workshops add column if not exists eligibility text;
alter table public.workshops add column if not exists fee_amount numeric(10, 2);  -- null = not stated, 0 = free
alter table public.workshops add column if not exists fee_note text;
alter table public.workshops add column if not exists contact_name text;
alter table public.workshops add column if not exists contact_phone text;
alter table public.workshops add column if not exists contact_email text;
alter table public.workshops add column if not exists website_url text;
alter table public.workshops add column if not exists link text;                  -- the organisers' own registration page, if any
alter table public.workshops add column if not exists details jsonb not null default '{}';   -- { perks: [], extraction: {} }
alter table public.workshops add column if not exists published_at timestamptz;
alter table public.workshops add column if not exists updated_at timestamptz not null default now();

-- A draft read from a poster may not state a date yet. A published or cancelled workshop must have one.
alter table public.workshops alter column starts_at drop not null;

do $$
declare c record;
begin
  for c in select * from (values
    ('workshops_status_check', $c$check (status in ('draft', 'published', 'cancelled'))$c$),
    ('workshops_mode_check', $c$check (mode in ('online', 'offline', 'hybrid'))$c$),
    ('workshops_published_needs_date_check', $c$check (status = 'draft' or starts_at is not null)$c$),
    ('workshops_fee_check', $c$check (fee_amount is null or fee_amount >= 0)$c$),
    ('workshops_urls_check', $c$check ((website_url is null or website_url ~* '^https?://') and (map_url is null or map_url ~* '^https?://') and (link is null or link ~* '^https?://'))$c$),
    ('workshops_contact_check', $c$check ((contact_phone is null or contact_phone ~ '^[0-9+() -]{7,20}$') and (contact_email is null or contact_email ~ '^[^@ ]+@[^@ ]+\.[^@ ]+$'))$c$),
    ('workshops_lists_check', $c$check (jsonb_typeof(details) = 'object' and cardinality(topics) <= 30)$c$)
  ) as t(name, body)
  loop
    if not exists (select 1 from pg_constraint where conname = c.name and conrelid = 'public.workshops'::regclass) then
      execute format('alter table public.workshops add constraint %I %s', c.name, c.body);
    end if;
  end loop;
end $$;

-- ============================================================
-- 2. Who can see and manage
-- ============================================================
-- May the signed-in user post workshops at all (an admin, or an admin of at least one club)?
create or replace function public.can_publish_workshops() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.is_verified() and exists (select 1 from public.club_admins where user_id = auth.uid()))
$$;
grant execute on function public.can_publish_workshops() to authenticated;

-- May the signed-in user edit this workshop? An admin, the admin of its club, or its organiser while they can still post.
create or replace function public.workshop_manageable(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workshops w where w.id = p_id and (
    public.is_admin()
    or (w.club_id is not null and public.can_publish(w.club_id))
    or (w.organizer_id = auth.uid() and public.can_publish_workshops())))
$$;
grant execute on function public.workshop_manageable(uuid) to authenticated;

drop policy if exists "Read workshops" on public.workshops;
create policy "Read workshops" on public.workshops for select to authenticated using (
  (status in ('published', 'cancelled') and public.is_verified() and public.audience_match(audience_depts, audience_years, null))
  or public.is_admin()
  or (club_id is not null and public.can_publish(club_id))
  or (organizer_id = auth.uid() and public.can_publish_workshops())
);
-- ("Create workshops" from dashboard-3 stays: an admin, or a club admin for their own club.)
drop policy if exists "Edit workshops" on public.workshops;
create policy "Edit workshops" on public.workshops for update to authenticated
  using (public.is_admin() or (club_id is not null and public.can_publish(club_id)) or (organizer_id = auth.uid() and public.can_publish_workshops()))
  with check (public.is_admin() or (club_id is not null and public.can_publish(club_id)));
drop policy if exists "Delete workshops" on public.workshops;
create policy "Delete workshops" on public.workshops for delete to authenticated
  using (public.is_admin() or (club_id is not null and public.can_publish(club_id)) or (organizer_id = auth.uid() and public.can_publish_workshops()));

create or replace function public.workshop_counts() returns table (workshop_id uuid, registered integer, waitlist integer)
language sql stable security definer set search_path = public as $$
  select w.id,
         (select count(*)::integer from public.workshop_registrations r where r.workshop_id = w.id and r.status = 'registered'),
         (select count(*)::integer from public.workshop_registrations r where r.workshop_id = w.id and r.status = 'waitlist')
  from public.workshops w
  where public.workshop_manageable(w.id)
     or (w.status in ('published', 'cancelled') and public.is_verified() and public.audience_match(w.audience_depts, w.audience_years, null))
$$;
grant execute on function public.workshop_counts() to authenticated;

create or replace function public.workshop_attendees(p_id uuid)
returns table (status text, registered_at timestamptz, full_name text, email text, usn text, branch text, year smallint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.workshop_manageable(p_id) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  return query select r.status, r.created_at, p.full_name, p.email, p.usn, p.branch, p.year::smallint
    from public.workshop_registrations r join public.profiles p on p.id = r.user_id
    where r.workshop_id = p_id order by r.status, r.created_at;
end $$;
grant execute on function public.workshop_attendees(uuid) to authenticated;

-- ============================================================
-- 3. Registration: only published workshops; waitlist moves up when a seat is free
-- ============================================================
create or replace function public.register_workshop(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare w public.workshops; taken integer; st text;
begin
  if not public.is_verified() then raise exception 'Verify your student ID first.' using errcode = '42501'; end if;
  select * into w from public.workshops where id = p_id for update;
  if w.id is null or w.status = 'draft' then raise exception 'Workshop not found.'; end if;
  if w.status = 'cancelled' then raise exception 'This workshop was cancelled.'; end if;
  if not public.audience_match(w.audience_depts, w.audience_years, null) then raise exception 'This workshop is not open to your department or year.' using errcode = '42501'; end if;
  if w.starts_at <= now() then raise exception 'This workshop has already started.'; end if;
  if w.reg_closes_at is not null and w.reg_closes_at <= now() then raise exception 'Registration has closed.'; end if;
  select status into st from public.workshop_registrations where workshop_id = p_id and user_id = auth.uid();
  if st is not null then return st; end if;
  select count(*) into taken from public.workshop_registrations where workshop_id = p_id and status = 'registered';
  st := case when taken < w.seats then 'registered' else 'waitlist' end;
  insert into public.workshop_registrations (workshop_id, user_id, status) values (p_id, auth.uid(), st);
  if st = 'registered' then perform public._workshop_reminders(w, auth.uid()); end if;
  return st;
end $$;
grant execute on function public.register_workshop(uuid) to authenticated;

-- Gives every free seat to the longest-waiting students, and tells them. Internal: callers hold the workshop row lock.
create or replace function public._workshop_promote(p_w public.workshops) returns void
language plpgsql security definer set search_path = public as $$
declare taken integer; nxt uuid;
begin
  if p_w.status <> 'published' or p_w.starts_at <= now() then return; end if;
  loop
    select count(*) into taken from public.workshop_registrations where workshop_id = p_w.id and status = 'registered';
    exit when taken >= p_w.seats;
    select user_id into nxt from public.workshop_registrations where workshop_id = p_w.id and status = 'waitlist' order by created_at, user_id limit 1 for update;
    exit when nxt is null;
    update public.workshop_registrations set status = 'registered' where workshop_id = p_w.id and user_id = nxt;
    perform public._workshop_reminders(p_w, nxt);
    insert into public.notifications (user_id, kind, title, body, url, urgency, ref_id)
    values (nxt, 'workshop', 'You got a seat: ' || p_w.title, 'A seat opened up and you moved off the waitlist.', '/dashboard/workshops/' || p_w.id, 1, p_w.id);
    nxt := null;
  end loop;
end $$;
revoke execute on function public._workshop_promote(public.workshops) from public, anon, authenticated;

create or replace function public.cancel_registration(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare w public.workshops; was text;
begin
  select * into w from public.workshops where id = p_id for update;
  select status into was from public.workshop_registrations where workshop_id = p_id and user_id = auth.uid();
  if was is null then return; end if;
  delete from public.workshop_registrations where workshop_id = p_id and user_id = auth.uid();
  delete from public.reminders where user_id = auth.uid() and kind = 'workshop' and ref_id = p_id and sent_at is null;
  if was = 'registered' then perform public._workshop_promote(w); end if;
end $$;
grant execute on function public.cancel_registration(uuid) to authenticated;

-- ============================================================
-- 4. Keeping reminders right when a workshop changes
-- ============================================================
create or replace function public.workshops_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then new.published_at := now(); end if;
  return new;
end $$;
drop trigger if exists workshops_guard on public.workshops;
create trigger workshops_guard before insert or update on public.workshops for each row execute function public.workshops_guard();

create or replace function public.workshops_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  -- Taken offline or cancelled: nobody should be reminded about it.
  if new.status <> 'published' then
    if old.status = 'published' then delete from public.reminders where kind = 'workshop' and ref_id = new.id and sent_at is null; end if;
    return new;
  end if;
  -- New start time: move every unsent reminder by the same amount (those that would now be in the past are dropped).
  if old.status = 'published' and new.starts_at is distinct from old.starts_at then
    with gone as (
      delete from public.reminders where kind = 'workshop' and ref_id = new.id and sent_at is null returning *
    )
    insert into public.reminders (user_id, kind, ref_id, title, url, remind_at)
    select user_id, kind, ref_id, new.title, url, remind_at + (new.starts_at - old.starts_at) from gone
    where remind_at + (new.starts_at - old.starts_at) > now()
    on conflict do nothing;
  elsif new.title is distinct from old.title then
    update public.reminders set title = new.title where kind = 'workshop' and ref_id = new.id and sent_at is null;
  end if;
  -- Registered students get the standard reminders again after a new time, or after it is published again.
  if new.starts_at is distinct from old.starts_at or old.status <> 'published' then
    for u in select user_id from public.workshop_registrations where workshop_id = new.id and status = 'registered' loop
      perform public._workshop_reminders(new, u);
    end loop;
  end if;
  -- More seats (or published again): move the waitlist up.
  if new.seats > old.seats or old.status <> 'published' then perform public._workshop_promote(new); end if;
  return new;
end $$;
drop trigger if exists workshops_changed on public.workshops;
create trigger workshops_changed after update on public.workshops for each row execute function public.workshops_changed();

create or replace function public.workshops_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.reminders where kind = 'workshop' and ref_id = old.id and sent_at is null;
  return old;
end $$;
drop trigger if exists workshops_deleted on public.workshops;
create trigger workshops_deleted after delete on public.workshops for each row execute function public.workshops_deleted();

create or replace function public.workshops_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (tg_op = 'INSERT' or old.status is distinct from new.status) and (new.status <> 'draft' or tg_op = 'UPDATE') then
    perform public.log_audit('workshop.' || new.status, 'workshop', new.id::text, jsonb_build_object('title', new.title));
  end if;
  return new;
end $$;
drop trigger if exists workshops_audit on public.workshops;
create trigger workshops_audit after insert or update of status on public.workshops for each row execute function public.workshops_audit();

-- ============================================================
-- 5. Posters (PDF or a photo) and what the AI read from them
-- ============================================================
create table if not exists public.workshop_documents (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  storage_path text not null unique,            -- in the workshop-files bucket: <uploader id>/<file id>.<ext>
  original_filename text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  page_count smallint check (page_count is null or page_count > 0),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists workshop_documents_workshop_idx on public.workshop_documents (workshop_id);
create index if not exists workshop_documents_sha_idx on public.workshop_documents (sha256);
alter table public.workshop_documents enable row level security;

-- Anyone who can read the workshop can read its documents' rows (so students see the poster of a published one).
drop policy if exists "Read workshop documents" on public.workshop_documents;
create policy "Read workshop documents" on public.workshop_documents for select to authenticated
  using (exists (select 1 from public.workshops w where w.id = workshop_documents.workshop_id));
drop policy if exists "Add workshop documents" on public.workshop_documents;
create policy "Add workshop documents" on public.workshop_documents for insert to authenticated
  with check (uploaded_by = auth.uid() and public.workshop_manageable(workshop_id)
    and storage_path like auth.uid()::text || '/%');   -- never point a workshop at somebody else's file
drop policy if exists "Remove workshop documents" on public.workshop_documents;
create policy "Remove workshop documents" on public.workshop_documents for delete to authenticated
  using (public.workshop_manageable(workshop_id));

create table if not exists public.workshop_extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.workshop_documents (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  attempt smallint not null default 1,
  error text,
  model text,
  ocr_used boolean not null default false,
  result jsonb,
  field_meta jsonb not null default '{}',
  requires_review boolean not null default true,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workshop_extractions_doc_idx on public.workshop_extractions (document_id, created_at desc);
alter table public.workshop_extractions enable row level security;

create or replace function public.workshop_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists workshop_extractions_touch on public.workshop_extractions;
create trigger workshop_extractions_touch before update on public.workshop_extractions for each row execute function public.workshop_touch();

create or replace function public.workshop_document_manageable(p_doc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workshop_documents d where d.id = p_doc and public.workshop_manageable(d.workshop_id))
$$;
grant execute on function public.workshop_document_manageable(uuid) to authenticated;

-- Students never see extraction data.
drop policy if exists "Managers read workshop extractions" on public.workshop_extractions;
create policy "Managers read workshop extractions" on public.workshop_extractions for select to authenticated using (public.workshop_document_manageable(document_id));
drop policy if exists "Managers start workshop extractions" on public.workshop_extractions;
create policy "Managers start workshop extractions" on public.workshop_extractions for insert to authenticated with check (public.workshop_document_manageable(document_id));
drop policy if exists "Managers update workshop extractions" on public.workshop_extractions;
create policy "Managers update workshop extractions" on public.workshop_extractions for update to authenticated
  using (public.workshop_document_manageable(document_id)) with check (public.workshop_document_manageable(document_id));

create or replace function public.workshop_find_duplicates(p_sha256 text)
returns table (workshop_id uuid, title text, status text)
language sql stable security definer set search_path = public as $$
  select w.id, w.title, w.status from public.workshop_documents d join public.workshops w on w.id = d.workshop_id
  where d.sha256 = lower(p_sha256) and public.workshop_manageable(w.id)
$$;
revoke execute on function public.workshop_find_duplicates(text) from public, anon;
grant execute on function public.workshop_find_duplicates(text) to authenticated;

-- ============================================================
-- 6. Private storage for the poster files
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workshop-files', 'workshop-files', false, 20971520, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Organizers upload workshop files" on storage.objects;
create policy "Organizers upload workshop files" on storage.objects for insert to authenticated
  with check (bucket_id = 'workshop-files' and public.can_publish_workshops() and (storage.foldername(name))[1] = auth.uid()::text);

-- Read: the uploader, or anyone who can read the workshop the file belongs to (students: published ones).
drop policy if exists "Read workshop files" on storage.objects;
create policy "Read workshop files" on storage.objects for select to authenticated
  using (bucket_id = 'workshop-files' and (
    ((storage.foldername(name))[1] = auth.uid()::text and public.can_publish_workshops())
    or exists (select 1 from public.workshop_documents d where d.storage_path = storage.objects.name)
  ));

drop policy if exists "Remove workshop files" on storage.objects;
create policy "Remove workshop files" on storage.objects for delete to authenticated
  using (bucket_id = 'workshop-files' and (
    public.is_admin()
    or ((storage.foldername(name))[1] = auth.uid()::text and public.can_publish_workshops())
  ));
