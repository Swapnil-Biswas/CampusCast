-- Stage 8: hackathons with full details, a minute-by-minute schedule, and AI reading of posters / documents.
-- Safe to re-run. Run after dashboard-3-official.sql (which created `hackathons`) and dashboard-1-engine.sql.
--
-- Who posts: an admin, or the admin of a club (club_admins). Nobody else has to approve: a club admin publishes
-- straight away, exactly like before. The AI only fills in a DRAFT from an uploaded poster or document; a person
-- always presses Publish. Students see only published (or cancelled) hackathons.
-- No notifications are sent about hackathons from this file.

-- ============================================================
-- 1. More details on hackathons
-- ============================================================
alter table public.hackathons add column if not exists status text not null default 'published';
alter table public.hackathons add column if not exists organizer_name text;           -- when the organizer is not one of the clubs
alter table public.hackathons add column if not exists tagline text;
alter table public.hackathons add column if not exists ends_at timestamptz;
alter table public.hackathons add column if not exists registration_opens_at timestamptz;
alter table public.hackathons add column if not exists map_url text;
alter table public.hackathons add column if not exists prize_amount numeric(12, 2);   -- total prize pool in rupees (null = not stated)
alter table public.hackathons add column if not exists prize_breakdown jsonb not null default '[]';  -- [{ label, amount, note }]
alter table public.hackathons add column if not exists fee_amount numeric(10, 2);     -- null = not stated, 0 = free
alter table public.hackathons add column if not exists fee_note text;
alter table public.hackathons add column if not exists eligibility text;
alter table public.hackathons add column if not exists tracks text[] not null default '{}';
alter table public.hackathons add column if not exists contact_name text;
alter table public.hackathons add column if not exists contact_phone text;
alter table public.hackathons add column if not exists contact_email text;
alter table public.hackathons add column if not exists website_url text;              -- the official site: the QR code points here (else `link`)
alter table public.hackathons add column if not exists schedule jsonb not null default '[]';        -- [{ at, title, note }] minute by minute
alter table public.hackathons add column if not exists details jsonb not null default '{}';         -- { perks: [], rules: [], sponsors: [], extraction: {} }
-- Where it is. `location` (above) is the venue's name. For a hackathon outside BMSIT (another college, a hotel, a hall),
-- an admin switches off_campus on and pins the venue on the map; students then see the distance from BMSIT, can open the
-- route in a new window, and see the map on the page. The pin is a latitude / longitude pair; the road distance is measured
-- when the pin is saved (route_source says whether it is a real road distance or only a straight line).
alter table public.hackathons add column if not exists off_campus boolean not null default false;
alter table public.hackathons add column if not exists venue_address text;
alter table public.hackathons add column if not exists venue_lat numeric(9, 6);
alter table public.hackathons add column if not exists venue_lng numeric(9, 6);
alter table public.hackathons add column if not exists route_km numeric(6, 1);
alter table public.hackathons add column if not exists route_minutes integer;
alter table public.hackathons add column if not exists route_source text;
alter table public.hackathons add column if not exists published_at timestamptz;
alter table public.hackathons add column if not exists updated_at timestamptz not null default now();

-- A draft from a poster may not state a registration deadline yet. A published one needs a deadline or a start time.
alter table public.hackathons alter column deadline drop not null;
-- When registration closes: the deadline, or the start time when no deadline was given. Pages sort and filter on this.
alter table public.hackathons add column if not exists registration_closes timestamptz generated always as (coalesce(deadline, starts_at)) stored;
create index if not exists hackathons_closes_idx on public.hackathons (registration_closes);

do $$
declare c record;
begin
  for c in select * from (values
    ('hackathons_status_check', $c$check (status in ('draft', 'published', 'cancelled'))$c$, false),
    ('hackathons_time_order_check', $c$check (ends_at is null or starts_at is null or ends_at >= starts_at)$c$, false),
    ('hackathons_opens_before_closes_check', $c$check (registration_opens_at is null or deadline is null or registration_opens_at <= deadline)$c$, false),
    ('hackathons_published_needs_date_check', $c$check (status = 'draft' or coalesce(deadline, starts_at) is not null)$c$, true),
    ('hackathons_money_check', $c$check ((prize_amount is null or prize_amount >= 0) and (fee_amount is null or fee_amount >= 0))$c$, false),
    ('hackathons_urls_check', $c$check ((website_url is null or website_url ~* '^https?://') and (map_url is null or map_url ~* '^https?://'))$c$, false),
    ('hackathons_link_check', $c$check (link is null or link ~* '^https?://')$c$, true),
    ('hackathons_contact_check', $c$check ((contact_phone is null or contact_phone ~ '^[0-9+() -]{7,20}$') and (contact_email is null or contact_email ~ '^[^@ ]+@[^@ ]+\.[^@ ]+$'))$c$, false),
    ('hackathons_geo_check', $c$check ((venue_lat is null) = (venue_lng is null) and (venue_lat is null or (venue_lat between -90 and 90 and venue_lng between -180 and 180)))$c$, false),
    ('hackathons_route_check', $c$check ((route_source is null or route_source in ('road', 'straight')) and (route_km is null or route_km >= 0) and (route_minutes is null or route_minutes >= 0))$c$, false),
    ('hackathons_lists_check', $c$check (jsonb_typeof(schedule) = 'array' and jsonb_array_length(schedule) <= 100 and jsonb_typeof(prize_breakdown) = 'array' and jsonb_array_length(prize_breakdown) <= 20 and jsonb_typeof(details) = 'object' and cardinality(tracks) <= 20)$c$, false)
  ) as t(name, body, not_valid)
  loop
    -- NOT VALID: the rule applies to every new or changed row; hackathons that were posted before it are left alone.
    if not exists (select 1 from pg_constraint where conname = c.name and conrelid = 'public.hackathons'::regclass) then
      execute format('alter table public.hackathons add constraint %I %s%s', c.name, c.body, case when c.not_valid then ' not valid' else '' end);
    end if;
  end loop;
end $$;

-- ============================================================
-- 2. Who can see and manage
-- ============================================================
-- May the signed-in user post hackathons for at least one club (or as an admin)?
create or replace function public.can_publish_hackathons() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.is_verified() and exists (select 1 from public.club_admins where user_id = auth.uid()))
$$;
grant execute on function public.can_publish_hackathons() to authenticated;

-- May the signed-in user edit this hackathon? (an admin, or the admin of its club)
create or replace function public.hackathon_manageable(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.hackathons h where h.id = p_id and (public.is_admin() or (h.club_id is not null and public.can_publish(h.club_id))))
$$;
grant execute on function public.hackathon_manageable(uuid) to authenticated;

-- Students see published and cancelled hackathons only. Drafts belong to the people who manage them.
drop policy if exists "Read hackathons" on public.hackathons;
create policy "Read hackathons" on public.hackathons for select to authenticated using (
  (status in ('published', 'cancelled') and public.is_verified())
  or public.is_admin()
  or (club_id is not null and public.can_publish(club_id))
);
-- ("Manage hackathons" from dashboard-3 stays: an admin, or the admin of that club, for every action.)

-- Keeps updated_at and published_at, and writes publishing / cancelling to the audit log.
create or replace function public.hackathons_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := now();
  end if;
  return new;
end $$;
drop trigger if exists hackathons_guard on public.hackathons;
create trigger hackathons_guard before insert or update on public.hackathons for each row execute function public.hackathons_guard();

create or replace function public.hackathons_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (tg_op = 'INSERT' or old.status is distinct from new.status) and (new.status <> 'draft' or tg_op = 'UPDATE') then
    perform public.log_audit('hackathon.' || new.status, 'hackathon', new.id::text, jsonb_build_object('title', new.title));
  end if;
  return new;
end $$;
drop trigger if exists hackathons_audit on public.hackathons;
create trigger hackathons_audit after insert or update of status on public.hackathons for each row execute function public.hackathons_audit();

-- ============================================================
-- 3. Posters and documents (PDF or a photo) and what the AI read from them
-- ============================================================
create table if not exists public.hackathon_documents (
  id uuid primary key default gen_random_uuid(),
  hackathon_id uuid not null references public.hackathons (id) on delete cascade,
  storage_path text not null unique,            -- in the hackathon-files bucket: <uploader id>/<file id>.<ext>
  original_filename text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  page_count smallint check (page_count is null or page_count > 0),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists hackathon_documents_hackathon_idx on public.hackathon_documents (hackathon_id);
create index if not exists hackathon_documents_sha_idx on public.hackathon_documents (sha256);
alter table public.hackathon_documents enable row level security;

-- Anyone who can read the hackathon can read its documents' rows (so students see the poster of a published one).
drop policy if exists "Read hackathon documents" on public.hackathon_documents;
create policy "Read hackathon documents" on public.hackathon_documents for select to authenticated
  using (exists (select 1 from public.hackathons h where h.id = hackathon_documents.hackathon_id));
drop policy if exists "Add hackathon documents" on public.hackathon_documents;
create policy "Add hackathon documents" on public.hackathon_documents for insert to authenticated
  with check (uploaded_by = auth.uid() and public.hackathon_manageable(hackathon_id));
drop policy if exists "Remove hackathon documents" on public.hackathon_documents;
create policy "Remove hackathon documents" on public.hackathon_documents for delete to authenticated
  using (public.hackathon_manageable(hackathon_id));

create table if not exists public.hackathon_extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.hackathon_documents (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  attempt smallint not null default 1,
  error text,
  model text,
  ocr_used boolean not null default false,
  result jsonb,                                 -- the structured hackathon, checked by the server
  field_meta jsonb not null default '{}',       -- per field: { confidence, source: 'explicit' | 'inferred' | 'missing', pages, evidence, needsReview }
  requires_review boolean not null default true,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hackathon_extractions_doc_idx on public.hackathon_extractions (document_id, created_at desc);
alter table public.hackathon_extractions enable row level security;

create or replace function public.hackathon_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists hackathon_extractions_touch on public.hackathon_extractions;
create trigger hackathon_extractions_touch before update on public.hackathon_extractions for each row execute function public.hackathon_touch();

create or replace function public.hackathon_document_manageable(p_doc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.hackathon_documents d where d.id = p_doc and public.hackathon_manageable(d.hackathon_id))
$$;
grant execute on function public.hackathon_document_manageable(uuid) to authenticated;

-- Students never see extraction data.
drop policy if exists "Managers read hackathon extractions" on public.hackathon_extractions;
create policy "Managers read hackathon extractions" on public.hackathon_extractions for select to authenticated using (public.hackathon_document_manageable(document_id));
drop policy if exists "Managers start hackathon extractions" on public.hackathon_extractions;
create policy "Managers start hackathon extractions" on public.hackathon_extractions for insert to authenticated with check (public.hackathon_document_manageable(document_id));
drop policy if exists "Managers update hackathon extractions" on public.hackathon_extractions;
create policy "Managers update hackathon extractions" on public.hackathon_extractions for update to authenticated
  using (public.hackathon_document_manageable(document_id)) with check (public.hackathon_document_manageable(document_id));

-- Is the same file already uploaded for a hackathon this user can manage?
create or replace function public.hackathon_find_duplicates(p_sha256 text)
returns table (hackathon_id uuid, title text, status text)
language sql stable security definer set search_path = public as $$
  select h.id, h.title, h.status from public.hackathon_documents d join public.hackathons h on h.id = d.hackathon_id
  where d.sha256 = lower(p_sha256) and public.hackathon_manageable(h.id)
$$;
revoke execute on function public.hackathon_find_duplicates(text) from public, anon;
grant execute on function public.hackathon_find_duplicates(text) to authenticated;

-- ============================================================
-- 4. Private storage for the poster / document files
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hackathon-files', 'hackathon-files', false, 20971520, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Posters are uploaded into the poster's own folder: hackathon-files/<their user id>/<file>.<ext>
drop policy if exists "Organizers upload hackathon files" on storage.objects;
create policy "Organizers upload hackathon files" on storage.objects for insert to authenticated
  with check (bucket_id = 'hackathon-files' and public.can_publish_hackathons() and (storage.foldername(name))[1] = auth.uid()::text);

-- Read: the uploader, or anyone who can read the hackathon the file belongs to (students: published ones).
drop policy if exists "Read hackathon files" on storage.objects;
create policy "Read hackathon files" on storage.objects for select to authenticated
  using (bucket_id = 'hackathon-files' and (
    ((storage.foldername(name))[1] = auth.uid()::text and public.can_publish_hackathons())
    or exists (select 1 from public.hackathon_documents d where d.storage_path = storage.objects.name)
  ));

drop policy if exists "Remove hackathon files" on storage.objects;
create policy "Remove hackathon files" on storage.objects for delete to authenticated
  using (bucket_id = 'hackathon-files' and (
    public.is_admin()
    or ((storage.foldername(name))[1] = auth.uid()::text and public.can_publish_hackathons())
  ));

-- ============================================================
-- 5. The college's clubs, societies and chapters (the usual organisers of hackathons)
-- ============================================================
-- Added if they are not there yet (matched by name or address), so this is safe to run again. Coding Club already exists
-- from dashboard-1. A person becomes an admin of a club (and may then post its hackathons) when a central admin adds them
-- to club_admins. A hackathon by another college has no club: choose "Out of college" in the editor and type its name.
insert into public.clubs (name, slug, color)
select c.name, trim(both '-' from regexp_replace(lower(c.name), '[^a-z0-9]+', '-', 'g')), (array['#8ec5d6', '#e8603c', '#c58ad1', '#f3b63f', '#7fb48a', '#ffb8c6'])[1 + (c.n % 6)]
from (values
  (1, 'Coding Club'), (2, 'GenAI Club'), (3, 'OSCode Club'), (4, 'ASTRA Club'), (5, 'AR/VR Hub'), (6, 'E-Yantra Club'),
  (7, 'IEEE Computer Society'), (8, 'IEEE Robotics and Automation Society'), (9, 'IEEE Computational Intelligence Society'),
  (10, 'IEEE Signal Processing Society'), (11, 'IEEE Communications Society'), (12, 'IEEE Aerospace and Electronic Systems Society'),
  (13, 'IEEE Circuits and Systems Society'), (14, 'IETE Club'), (15, 'ISTE Club'), (16, 'BMESI Club'), (17, 'ICE Student Chapter'),
  (18, 'Motorheads Club'), (19, 'Access Denied Club'), (20, 'Money Plant Club'), (21, 'Alterino Club'), (22, 'Epoch Society'),
  (23, 'NODE – Network of Decentralised Engineers')
) as c(n, name)
on conflict do nothing;
