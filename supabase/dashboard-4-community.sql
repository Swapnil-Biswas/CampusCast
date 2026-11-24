-- Stage 4: community modules (Connect, notes and papers, CampusXchange, mentorship) with reports and blocks. Safe to re-run.

-- ============================================================
-- Blocks and reports (used by every module)
-- ============================================================
create table if not exists public.blocks (
  blocker uuid not null references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.blocks enable row level security;
drop policy if exists "Own blocks" on public.blocks;
create policy "Own blocks" on public.blocks for all to authenticated
  using (blocker = auth.uid()) with check (blocker = auth.uid() and public.is_verified());

-- True when either person has blocked the other.
create or replace function public.is_blocked_pair(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;
grant execute on function public.is_blocked_pair(uuid, uuid) to authenticated;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('connect_post', 'note', 'listing', 'message', 'user')),
  ref_id uuid not null,
  reason text not null check (char_length(reason) between 3 and 500),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  resolution text,
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter, kind, ref_id)
);
alter table public.reports enable row level security;
drop policy if exists "File a report" on public.reports;
create policy "File a report" on public.reports for insert to authenticated
  with check (reporter = auth.uid() and public.is_verified() and status = 'open');
drop policy if exists "Read reports" on public.reports;
create policy "Read reports" on public.reports for select to authenticated using (reporter = auth.uid() or public.is_admin());
-- Admins resolve through resolve_report() so every decision is audited.

-- ============================================================
-- Connect: "need a frontend dev" / "looking for a team"
-- ============================================================
create table if not exists public.connect_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('need', 'team')),          -- need = I need teammates, team = I am looking for a team
  title text not null check (char_length(title) between 3 and 140),
  body text not null check (char_length(body) between 1 and 2000),
  skills text[] not null default '{}',
  hackathon_id uuid references public.hackathons (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed', 'removed')),
  created_at timestamptz not null default now()
);
create index if not exists connect_posts_idx on public.connect_posts (status, created_at desc);
alter table public.connect_posts enable row level security;
drop policy if exists "Read posts" on public.connect_posts;
create policy "Read posts" on public.connect_posts for select to authenticated using (
  public.is_admin() or author_id = auth.uid()
  or (public.is_verified() and status = 'open' and not public.is_blocked_pair(author_id, auth.uid())));
drop policy if exists "Write own posts" on public.connect_posts;
create policy "Write own posts" on public.connect_posts for insert to authenticated with check (author_id = auth.uid() and public.is_verified() and status = 'open');
drop policy if exists "Edit own posts" on public.connect_posts;
create policy "Edit own posts" on public.connect_posts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid() and status in ('open', 'closed'));
drop policy if exists "Delete own posts" on public.connect_posts;
create policy "Delete own posts" on public.connect_posts for delete to authenticated using (author_id = auth.uid() or public.is_admin());

create table if not exists public.connect_requests (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.connect_posts (id) on delete cascade,
  requester_id uuid not null references auth.users (id) on delete cascade,
  message text not null check (char_length(message) between 1 and 500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (post_id, requester_id)
);
alter table public.connect_requests enable row level security;
drop policy if exists "Read own connect requests" on public.connect_requests;
create policy "Read own connect requests" on public.connect_requests for select to authenticated using (
  requester_id = auth.uid() or exists (select 1 from public.connect_posts p where p.id = post_id and p.author_id = auth.uid()));
-- Writes only through request_connect / respond_connect.

create or replace function public.request_connect(p_post uuid, p_message text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.connect_posts;
begin
  if not public.is_verified() then raise exception 'Verify your student ID first.' using errcode = '42501'; end if;
  select * into p from public.connect_posts where id = p_post;
  if p.id is null or p.status <> 'open' then raise exception 'This post is no longer open.'; end if;
  if p.author_id = auth.uid() then raise exception 'That is your own post.'; end if;
  if public.is_blocked_pair(p.author_id, auth.uid()) then raise exception 'You cannot contact this person.' using errcode = '42501'; end if;
  insert into public.connect_requests (post_id, requester_id, message) values (p_post, auth.uid(), left(trim(p_message), 500))
    on conflict (post_id, requester_id) do nothing;
  insert into public.notifications (user_id, kind, title, body, url, urgency, ref_id)
  values (p.author_id, 'connect', 'Someone wants to team up: ' || p.title, left(p_message, 140), '/dashboard/connect?tab=requests', 2, p_post);
end $$;
grant execute on function public.request_connect(uuid, text) to authenticated;

create or replace function public.respond_connect(p_request uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r public.connect_requests; p public.connect_posts;
begin
  select * into r from public.connect_requests where id = p_request;
  select * into p from public.connect_posts where id = r.post_id;
  if p.author_id is distinct from auth.uid() then raise exception 'Only the author can answer this.' using errcode = '42501'; end if;
  update public.connect_requests set status = case when p_accept then 'accepted' else 'declined' end where id = p_request and status = 'pending';
  if p_accept then
    insert into public.notifications (user_id, kind, title, body, url, urgency, ref_id)
    values (r.requester_id, 'connect', 'Accepted: ' || p.title, 'You can now see each other''s contact details.', '/dashboard/connect?tab=requests', 2, p.id);
  end if;
end $$;
grant execute on function public.respond_connect(uuid, boolean) to authenticated;

-- Contact details are revealed only after the author accepted, and only to the two people involved.
create or replace function public.connect_contact(p_request uuid) returns table (full_name text, email text, branch text, year smallint)
language plpgsql stable security definer set search_path = public as $$
declare r public.connect_requests; p public.connect_posts; other uuid;
begin
  select * into r from public.connect_requests where id = p_request;
  select * into p from public.connect_posts where id = r.post_id;
  if r.id is null or r.status <> 'accepted' then raise exception 'Contact details are shared only after the request is accepted.' using errcode = '42501'; end if;
  if auth.uid() = r.requester_id then other := p.author_id; elsif auth.uid() = p.author_id then other := r.requester_id;
  else raise exception 'Not allowed.' using errcode = '42501'; end if;
  return query select pr.full_name, pr.email, pr.branch, pr.year::smallint from public.profiles pr where pr.id = other;
end $$;
grant execute on function public.connect_contact(uuid) to authenticated;

-- Author names for the board (nothing else about the author is exposed).
create or replace function public.author_names(p_ids uuid[]) returns table (id uuid, full_name text, branch text, year smallint)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.branch, p.year::smallint from public.profiles p where public.is_verified() and p.id = any (p_ids)
$$;
grant execute on function public.author_names(uuid[]) to authenticated;

-- ============================================================
-- Notes and previous papers
-- ============================================================
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  kind text not null default 'notes' check (kind in ('notes', 'paper')),
  title text not null check (char_length(title) between 3 and 140),
  subject text not null check (char_length(subject) between 2 and 80),
  semester smallint not null check (semester between 1 and 8),
  branch text,
  description text,
  file jsonb not null,                           -- { name, path, size, type }
  sha256 text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  created_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || coalesce(subject, '') || ' ' || coalesce(description, ''))) stored
);
-- The same file cannot be uploaded twice (rejected copies do not count).
create unique index if not exists notes_sha_unique on public.notes (sha256) where status <> 'rejected';
create index if not exists notes_search_idx on public.notes using gin (search);
alter table public.notes enable row level security;
drop policy if exists "Read notes" on public.notes;
create policy "Read notes" on public.notes for select to authenticated using (
  public.is_admin() or uploader_id = auth.uid() or (public.is_verified() and status = 'approved'));
drop policy if exists "Upload notes" on public.notes;
create policy "Upload notes" on public.notes for insert to authenticated with check (uploader_id = auth.uid() and public.is_verified() and status = 'pending');
drop policy if exists "Withdraw own notes" on public.notes;
create policy "Withdraw own notes" on public.notes for delete to authenticated using (uploader_id = auth.uid() or public.is_admin());
-- Approval goes through review_note().

create table if not exists public.note_votes (
  note_id uuid not null references public.notes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (note_id, user_id)
);
alter table public.note_votes enable row level security;
drop policy if exists "Own note votes" on public.note_votes;
create policy "Own note votes" on public.note_votes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_verified());

create or replace function public.note_vote_counts() returns table (note_id uuid, votes integer)
language sql stable security definer set search_path = public as $$
  select n.id, (select count(*)::integer from public.note_votes v where v.note_id = n.id)
  from public.notes n where public.is_verified() and n.status = 'approved'
$$;
grant execute on function public.note_vote_counts() to authenticated;

create or replace function public.review_note(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare n public.notes;
begin
  if not public.is_admin() then raise exception 'Not allowed.' using errcode = '42501'; end if;
  update public.notes set status = case when p_approve then 'approved' else 'rejected' end, review_note = nullif(trim(coalesce(p_note, '')), '')
    where id = p_id and status = 'pending' returning * into n;
  if n.id is null then raise exception 'That upload is not waiting for review.'; end if;
  perform public.log_audit(case when p_approve then 'note.approved' else 'note.rejected' end, 'note', p_id::text, jsonb_build_object('title', n.title, 'note', p_note));
  insert into public.notifications (user_id, kind, title, body, url, urgency, ref_id)
  values (n.uploader_id, 'note', case when p_approve then 'Your notes are live: ' else 'Upload not accepted: ' end || n.title,
          case when p_approve then 'Thanks for sharing. Classmates can find them now.' else coalesce(nullif(trim(p_note), ''), 'It did not meet the guidelines.') end,
          '/dashboard/notes?tab=mine', 3, p_id);
end $$;
grant execute on function public.review_note(uuid, boolean, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notes', 'notes', false, 15728640, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Read note files" on storage.objects;
create policy "Read note files" on storage.objects for select to authenticated using (
  bucket_id = 'notes' and public.is_verified() and (
    public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.notes n where n.file ->> 'path' = name and n.status = 'approved')));
drop policy if exists "Upload note files" on storage.objects;
create policy "Upload note files" on storage.objects for insert to authenticated
  with check (bucket_id = 'notes' and public.is_verified() and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Remove own note files" on storage.objects;
create policy "Remove own note files" on storage.objects for delete to authenticated
  using (bucket_id = 'notes' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ============================================================
-- CampusXchange: campus-only marketplace
-- ============================================================
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title text not null check (char_length(title) between 3 and 100),
  description text,
  price integer not null check (price between 0 and 1000000),
  category text not null default 'other' check (category in ('books', 'electronics', 'cycles', 'hostel', 'stationery', 'clothing', 'other')),
  condition text not null default 'good' check (condition in ('new', 'like_new', 'good', 'fair')),
  images jsonb not null default '[]',
  status text not null default 'active' check (status in ('active', 'sold', 'removed', 'expired')),
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now()
);
create index if not exists listings_idx on public.listings (status, created_at desc);
alter table public.listings enable row level security;
drop policy if exists "Read listings" on public.listings;
create policy "Read listings" on public.listings for select to authenticated using (
  public.is_admin() or seller_id = auth.uid()
  or (public.is_verified() and status = 'active' and expires_at > now() and not public.is_blocked_pair(seller_id, auth.uid())));
drop policy if exists "Create listings" on public.listings;
create policy "Create listings" on public.listings for insert to authenticated with check (seller_id = auth.uid() and public.is_verified() and status = 'active');
drop policy if exists "Edit own listings" on public.listings;
create policy "Edit own listings" on public.listings for update to authenticated
  using (seller_id = auth.uid()) with check (seller_id = auth.uid() and status in ('active', 'sold'));
drop policy if exists "Delete own listings" on public.listings;
create policy "Delete own listings" on public.listings for delete to authenticated using (seller_id = auth.uid() or public.is_admin());

create table if not exists public.listing_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  message text not null check (char_length(message) between 1 and 500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (listing_id, buyer_id)
);
alter table public.listing_requests enable row level security;
drop policy if exists "Read own listing requests" on public.listing_requests;
create policy "Read own listing requests" on public.listing_requests for select to authenticated using (
  buyer_id = auth.uid() or exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid()));

create or replace function public.request_listing(p_listing uuid, p_message text) returns void
language plpgsql security definer set search_path = public as $$
declare l public.listings;
begin
  if not public.is_verified() then raise exception 'Verify your student ID first.' using errcode = '42501'; end if;
  select * into l from public.listings where id = p_listing;
  if l.id is null or l.status <> 'active' or l.expires_at <= now() then raise exception 'This listing is no longer available.'; end if;
  if l.seller_id = auth.uid() then raise exception 'That is your own listing.'; end if;
  if public.is_blocked_pair(l.seller_id, auth.uid()) then raise exception 'You cannot contact this seller.' using errcode = '42501'; end if;
  insert into public.listing_requests (listing_id, buyer_id, message) values (p_listing, auth.uid(), left(trim(p_message), 500))
    on conflict (listing_id, buyer_id) do nothing;
  insert into public.notifications (user_id, kind, title, body, url, urgency, ref_id)
  values (l.seller_id, 'xchange', 'Someone wants to buy: ' || l.title, left(p_message, 140), '/dashboard/xchange?tab=chats', 2, p_listing);
end $$;
grant execute on function public.request_listing(uuid, text) to authenticated;

create or replace function public.respond_listing(p_request uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r public.listing_requests; l public.listings;
begin
  select * into r from public.listing_requests where id = p_request;
  select * into l from public.listings where id = r.listing_id;
  if l.seller_id is distinct from auth.uid() then raise exception 'Only the seller can answer this.' using errcode = '42501'; end if;
  update public.listing_requests set status = case when p_accept then 'accepted' else 'declined' end where id = p_request and status = 'pending';
  if p_accept then
    insert into public.notifications (user_id, kind, title, body, url, urgency, ref_id)
    values (r.buyer_id, 'xchange', 'Chat opened: ' || l.title, 'The seller accepted. You can message each other now.', '/dashboard/xchange?tab=chats', 2, l.id);
  end if;
end $$;
grant execute on function public.respond_listing(uuid, boolean) to authenticated;

-- Chat exists only between the seller and a buyer the seller accepted.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.listing_requests (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists messages_idx on public.messages (request_id, created_at);
alter table public.messages enable row level security;
create or replace function public.in_chat(p_request uuid, p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.listing_requests r join public.listings l on l.id = r.listing_id
    where r.id = p_request and r.status = 'accepted' and (r.buyer_id = p_uid or l.seller_id = p_uid)
      and not public.is_blocked_pair(r.buyer_id, l.seller_id))
$$;
grant execute on function public.in_chat(uuid, uuid) to authenticated;
drop policy if exists "Read own chat" on public.messages;
create policy "Read own chat" on public.messages for select to authenticated using (public.in_chat(request_id));
drop policy if exists "Send in own chat" on public.messages;
create policy "Send in own chat" on public.messages for insert to authenticated with check (sender_id = auth.uid() and public.in_chat(request_id));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

create or replace function public.expire_listings() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.listings set status = 'expired' where status = 'active' and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.expire_listings() from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-images', 'listing-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Read listing images" on storage.objects;
create policy "Read listing images" on storage.objects for select to authenticated using (bucket_id = 'listing-images' and public.is_verified());
drop policy if exists "Upload listing images" on storage.objects;
create policy "Upload listing images" on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-images' and public.is_verified() and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Remove listing images" on storage.objects;
create policy "Remove listing images" on storage.objects for delete to authenticated
  using (bucket_id = 'listing-images' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ============================================================
-- Free mentorship (mentors are students in year 3 or above)
-- ============================================================
create table if not exists public.mentor_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  domains text[] not null default '{}',
  bio text check (char_length(bio) <= 600),
  availability text check (char_length(availability) <= 200),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.mentor_profiles enable row level security;
drop policy if exists "Read mentors" on public.mentor_profiles;
create policy "Read mentors" on public.mentor_profiles for select to authenticated using (public.is_verified() and (active or user_id = auth.uid() or public.is_admin()));
drop policy if exists "Create own mentor profile" on public.mentor_profiles;
create policy "Create own mentor profile" on public.mentor_profiles for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'verified' and p.year >= 3));
drop policy if exists "Edit own mentor profile" on public.mentor_profiles;
create policy "Edit own mentor profile" on public.mentor_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Delete own mentor profile" on public.mentor_profiles;
create policy "Delete own mentor profile" on public.mentor_profiles for delete to authenticated using (user_id = auth.uid());

create table if not exists public.mentor_requests (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references auth.users (id) on delete cascade,
  mentee_id uuid not null references auth.users (id) on delete cascade,
  topic text not null check (char_length(topic) between 3 and 140),
  message text check (char_length(message) <= 500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  check (mentor_id <> mentee_id)
);
create unique index if not exists mentor_requests_open on public.mentor_requests (mentor_id, mentee_id) where status in ('pending', 'accepted');
alter table public.mentor_requests enable row level security;
drop policy if exists "Read own mentor requests" on public.mentor_requests;
create policy "Read own mentor requests" on public.mentor_requests for select to authenticated using (mentor_id = auth.uid() or mentee_id = auth.uid());

create table if not exists public.mentor_sessions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.mentor_requests (id) on delete cascade,
  scheduled_at timestamptz not null,
  note text,                                      -- meeting link or place
  status text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled')),
  rating smallint check (rating between 1 and 5),
  feedback text check (char_length(feedback) <= 500),
  created_at timestamptz not null default now()
);
alter table public.mentor_sessions enable row level security;
drop policy if exists "Read own sessions" on public.mentor_sessions;
create policy "Read own sessions" on public.mentor_sessions for select to authenticated using (
  exists (select 1 from public.mentor_requests r where r.id = request_id and (r.mentor_id = auth.uid() or r.mentee_id = auth.uid())));

create or replace function public.request_mentor(p_mentor uuid, p_topic text, p_message text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_verified() then raise exception 'Verify your student ID first.' using errcode = '42501'; end if;
  if p_mentor = auth.uid() then raise exception 'You cannot mentor yourself.'; end if;
  if not exists (select 1 from public.mentor_profiles where user_id = p_mentor and active) then raise exception 'This mentor is not taking requests.'; end if;
  if public.is_blocked_pair(p_mentor, auth.uid()) then raise exception 'You cannot contact this mentor.' using errcode = '42501'; end if;
  insert into public.mentor_requests (mentor_id, mentee_id, topic, message) values (p_mentor, auth.uid(), left(trim(p_topic), 140), left(trim(coalesce(p_message, '')), 500));
  insert into public.notifications (user_id, kind, title, body, url, urgency, ref_id)
  values (p_mentor, 'mentor', 'New mentorship request', left(p_topic, 140), '/dashboard/mentors?tab=requests', 2, null);
exception when unique_violation then raise exception 'You already have an open request with this mentor.';
end $$;
grant execute on function public.request_mentor(uuid, text, text) to authenticated;

create or replace function public.respond_mentor(p_request uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r public.mentor_requests;
begin
  select * into r from public.mentor_requests where id = p_request;
  if r.mentor_id is distinct from auth.uid() then raise exception 'Only the mentor can answer this.' using errcode = '42501'; end if;
  update public.mentor_requests set status = case when p_accept then 'accepted' else 'declined' end where id = p_request and status = 'pending';
  insert into public.notifications (user_id, kind, title, body, url, urgency)
  values (r.mentee_id, 'mentor', case when p_accept then 'Your mentor said yes' else 'Mentor request declined' end,
          case when p_accept then 'They will suggest a time soon.' else 'Try another mentor in the same domain.' end, '/dashboard/mentors?tab=requests', 2);
end $$;
grant execute on function public.respond_mentor(uuid, boolean) to authenticated;

create or replace function public.schedule_session(p_request uuid, p_at timestamptz, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.mentor_requests; sid uuid; t timestamptz; u uuid;
begin
  select * into r from public.mentor_requests where id = p_request;
  if r.mentor_id is distinct from auth.uid() or r.status <> 'accepted' then raise exception 'Only the mentor can schedule an accepted request.' using errcode = '42501'; end if;
  if p_at <= now() then raise exception 'Pick a time in the future.'; end if;
  insert into public.mentor_sessions (request_id, scheduled_at, note) values (p_request, p_at, left(trim(coalesce(p_note, '')), 300)) returning id into sid;
  foreach u in array array[r.mentor_id, r.mentee_id] loop
    foreach t in array array[p_at - interval '1 day', p_at - interval '1 hour'] loop
      if t > now() then
        insert into public.reminders (user_id, kind, ref_id, title, url, remind_at)
        values (u, 'mentor_session', sid, 'Mentoring session: ' || r.topic, '/dashboard/mentors?tab=requests', t) on conflict do nothing;
      end if;
    end loop;
  end loop;
  insert into public.notifications (user_id, kind, title, body, url, urgency, ref_id)
  values (r.mentee_id, 'mentor', 'Session scheduled', to_char(p_at at time zone 'Asia/Kolkata', 'FMDay DD Mon, HH12:MI AM') || coalesce(' · ' || nullif(trim(p_note), ''), ''), '/dashboard/mentors?tab=requests', 1, sid);
end $$;
grant execute on function public.schedule_session(uuid, timestamptz, text) to authenticated;

create or replace function public.complete_session(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.mentor_sessions; r public.mentor_requests;
begin
  select * into s from public.mentor_sessions where id = p_session;
  select * into r from public.mentor_requests where id = s.request_id;
  if r.mentor_id is distinct from auth.uid() then raise exception 'Only the mentor can do this.' using errcode = '42501'; end if;
  update public.mentor_sessions set status = 'done' where id = p_session and status = 'scheduled';
  insert into public.notifications (user_id, kind, title, body, url, urgency, ref_id)
  values (r.mentee_id, 'mentor', 'How was your session?', 'Leave a rating and a line of feedback for your mentor.', '/dashboard/mentors?tab=requests', 2, p_session);
end $$;
grant execute on function public.complete_session(uuid) to authenticated;

create or replace function public.rate_session(p_session uuid, p_rating integer, p_feedback text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.mentor_sessions; r public.mentor_requests;
begin
  select * into s from public.mentor_sessions where id = p_session;
  select * into r from public.mentor_requests where id = s.request_id;
  if r.mentee_id is distinct from auth.uid() then raise exception 'Only the mentee can rate a session.' using errcode = '42501'; end if;
  if s.status <> 'done' then raise exception 'You can rate a session after it is marked done.'; end if;
  if s.rating is not null then raise exception 'You already rated this session.'; end if;
  if p_rating not between 1 and 5 then raise exception 'Rating must be 1 to 5.'; end if;
  update public.mentor_sessions set rating = p_rating, feedback = nullif(left(trim(coalesce(p_feedback, '')), 500), '') where id = p_session;
end $$;
grant execute on function public.rate_session(uuid, integer, text) to authenticated;

-- Mentor directory with names and average ratings.
create or replace function public.mentor_directory() returns table (user_id uuid, full_name text, branch text, year smallint, domains text[], bio text, availability text, avg_rating numeric, sessions integer)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.full_name, p.branch, p.year::smallint, m.domains, m.bio, m.availability,
         (select round(avg(s.rating)::numeric, 1) from public.mentor_sessions s join public.mentor_requests r on r.id = s.request_id where r.mentor_id = m.user_id and s.rating is not null),
         (select count(*)::integer from public.mentor_sessions s join public.mentor_requests r on r.id = s.request_id where r.mentor_id = m.user_id and s.status = 'done')
  from public.mentor_profiles m join public.profiles p on p.id = m.user_id
  where public.is_verified() and m.active and not public.is_blocked_pair(m.user_id, auth.uid())
$$;
grant execute on function public.mentor_directory() to authenticated;

-- Names of the people on my requests (mentors and mentees see each other once connected).
create or replace function public.mentor_people() returns table (id uuid, full_name text, branch text, year smallint)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.branch, p.year::smallint from public.profiles p
  where p.id in (select mentor_id from public.mentor_requests where mentee_id = auth.uid()
                 union select mentee_id from public.mentor_requests where mentor_id = auth.uid())
$$;
grant execute on function public.mentor_people() to authenticated;

-- ============================================================
-- Moderation: act on a report
-- ============================================================
create or replace function public.resolve_report(p_id uuid, p_remove boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r public.reports;
begin
  if not public.is_admin() then raise exception 'Not allowed.' using errcode = '42501'; end if;
  select * into r from public.reports where id = p_id and status = 'open';
  if r.id is null then raise exception 'That report is already resolved.'; end if;
  if p_remove then
    if r.kind = 'connect_post' then update public.connect_posts set status = 'removed' where id = r.ref_id;
    elsif r.kind = 'listing' then update public.listings set status = 'removed' where id = r.ref_id;
    elsif r.kind = 'note' then update public.notes set status = 'rejected', review_note = 'Removed after a report' where id = r.ref_id;
    elsif r.kind = 'message' then delete from public.messages where id = r.ref_id;
    end if;
  end if;
  update public.reports set status = case when p_remove then 'actioned' else 'dismissed' end, resolution = nullif(trim(coalesce(p_note, '')), ''),
    resolved_by = auth.uid(), resolved_at = now() where id = p_id;
  perform public.log_audit(case when p_remove then 'report.actioned' else 'report.dismissed' end, r.kind, r.ref_id::text, jsonb_build_object('reason', r.reason, 'note', p_note));
end $$;
grant execute on function public.resolve_report(uuid, boolean, text) to authenticated;

-- What admins see in the queue: the report plus a short preview of the reported item.
create or replace function public.report_queue() returns table (id uuid, kind text, ref_id uuid, reason text, created_at timestamptz, reporter_name text, preview text, owner_name text)
language sql stable security definer set search_path = public as $$
  select r.id, r.kind, r.ref_id, r.reason, r.created_at, rp.full_name,
         case r.kind
           when 'connect_post' then (select title || ' - ' || left(body, 120) from public.connect_posts where id = r.ref_id)
           when 'listing' then (select title || ' - Rs ' || price from public.listings where id = r.ref_id)
           when 'note' then (select title || ' (' || subject || ')' from public.notes where id = r.ref_id)
           when 'message' then (select left(body, 200) from public.messages where id = r.ref_id)
           else null end,
         (select op.full_name from public.profiles op where op.id = case r.kind
            when 'connect_post' then (select author_id from public.connect_posts where id = r.ref_id)
            when 'listing' then (select seller_id from public.listings where id = r.ref_id)
            when 'note' then (select uploader_id from public.notes where id = r.ref_id)
            when 'message' then (select sender_id from public.messages where id = r.ref_id)
            else r.ref_id end)
  from public.reports r join public.profiles rp on rp.id = r.reporter
  where public.is_admin() and r.status = 'open' order by r.created_at
$$;
grant execute on function public.report_queue() to authenticated;
