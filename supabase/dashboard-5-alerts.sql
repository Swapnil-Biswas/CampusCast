-- ============================================================
-- CampusCast dashboard, stage 5: alerts (email, browser push, reminders, digests, schedules)
-- Safe to run more than once.
--
-- Flow: anything that inserts a notification  ->  trigger decides the channels from the student's
-- settings  ->  outbox row  ->  /api/jobs/dispatch (called every minute) sends the email / push.
-- ============================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Private key/value store (job secret). No policies: only the owner role and security-definer code can read it.
create table if not exists public.app_private (key text primary key, value text not null);
alter table public.app_private enable row level security;
revoke all on public.app_private from anon, authenticated;

create table if not exists public.outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null check (channel in ('email', 'push')),
  kind text not null default 'notification',          -- notification | reminder | digest
  subject text not null,
  body text,
  url text,
  urgency smallint not null default 2,
  notification_id uuid references public.notifications (id) on delete set null,
  dedupe text unique,                                 -- stops a digest or reminder being queued twice
  send_after timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts smallint not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists outbox_due_idx on public.outbox (send_after) where status in ('pending', 'sending');
alter table public.outbox enable row level security;
revoke all on public.outbox from anon, authenticated;

-- ---------- quiet hours (India time) ----------
-- Returns when a message may go out: now, or the end of the student's quiet hours.
create or replace function public._send_time(p public.notification_prefs, p_urgency smallint) returns timestamptz
language plpgsql stable as $$
declare
  h integer := extract(hour from (now() at time zone 'Asia/Kolkata'));
  qs integer := p.quiet_start; qe integer := p.quiet_end;
  inq boolean;
  base timestamp := date_trunc('day', now() at time zone 'Asia/Kolkata');
  t timestamp;
begin
  if qs is null or qe is null or qs = qe then return now(); end if;
  if p_urgency <= 1 and coalesce(p.urgent_overrides_quiet, true) then return now(); end if;
  inq := case when qs < qe then h >= qs and h < qe else h >= qs or h < qe end;
  if not inq then return now(); end if;
  t := base + make_interval(hours => qe);
  if t <= (now() at time zone 'Asia/Kolkata') then t := t + interval '1 day'; end if;
  return t at time zone 'Asia/Kolkata';
end $$;

-- ---------- notification -> outbox ----------
-- Urgent notices (Now, Today) and reminders are sent at once. Everything else waits for the daily digest.
create or replace function public.notifications_enqueue() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.notification_prefs; instant boolean; due timestamptz; ok boolean;
begin
  instant := new.urgency <= 1 or new.kind = 'reminder';
  if not instant then return new; end if;
  select * into p from public.notification_prefs where user_id = new.user_id;
  if not found then p.email := true; p.push := false; p.urgent_overrides_quiet := true; end if;
  select (status = 'verified') into ok from public.profiles where id = new.user_id;
  if not coalesce(ok, false) then return new; end if;
  due := public._send_time(p, new.urgency);
  if p.email then
    insert into public.outbox (user_id, channel, kind, subject, body, url, urgency, notification_id, send_after)
    values (new.user_id, 'email', case when new.kind = 'reminder' then 'reminder' else 'notification' end, new.title, new.body, new.url, new.urgency, new.id, due);
  end if;
  if p.push and exists (select 1 from public.push_subscriptions s where s.user_id = new.user_id) then
    insert into public.outbox (user_id, channel, kind, subject, body, url, urgency, notification_id, send_after)
    values (new.user_id, 'push', case when new.kind = 'reminder' then 'reminder' else 'notification' end, new.title, new.body, new.url, new.urgency, new.id, due);
  end if;
  return new;
end $$;
drop trigger if exists notifications_enqueue on public.notifications;
create trigger notifications_enqueue after insert on public.notifications
  for each row execute function public.notifications_enqueue();

-- ---------- reminders become notifications when due ----------
create or replace function public.due_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in select * from public.reminders where sent_at is null and remind_at <= now() order by remind_at limit 500 for update skip locked loop
    update public.reminders set sent_at = now() where id = r.id;
    -- Stale (the server was down for a day): mark done without alerting.
    if r.remind_at >= now() - interval '1 day' then
      insert into public.notifications (user_id, kind, title, body, url, urgency, ref_id)
      values (r.user_id, 'reminder', 'Reminder: ' || r.title, 'You asked to be reminded about this.', coalesce(r.url, '/dashboard/calendar'), 1, r.ref_id);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.due_reminders() from public, anon, authenticated;

-- ---------- daily digest (07:00 India time) ----------
create or replace function public.build_digests() returns integer
language plpgsql security definer set search_path = public as $$
declare u record; items text; c integer; n integer := 0; day text := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
begin
  for u in
    select p.id from public.profiles p
    left join public.notification_prefs np on np.user_id = p.id
    where p.status = 'verified' and coalesce(np.digest, true) and coalesce(np.email, true)
  loop
    select count(*), string_agg('- ' || t.title, E'\n' order by t.created_at desc)
      into c, items
      from (select title, created_at from public.notifications
            where user_id = u.id and urgency >= 2 and kind <> 'reminder' and created_at >= now() - interval '24 hours'
            order by created_at desc limit 12) t;
    if c > 0 then
      insert into public.outbox (user_id, channel, kind, subject, body, url, urgency, dedupe)
      values (u.id, 'email', 'digest', 'Your CampusCast digest: ' || c || ' update' || case when c = 1 then '' else 's' end, items, '/dashboard', 3, 'digest:' || u.id || ':' || day)
      on conflict (dedupe) do nothing;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.build_digests() from public, anon, authenticated;

-- ---------- the dispatcher talks to the database only through these, gated by the job secret ----------
create or replace function public._job_ok(p_secret text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_secret <> '' and exists (select 1 from public.app_private where key = 'job_secret' and value = p_secret), false)
$$;
revoke execute on function public._job_ok(text) from public, anon, authenticated;

-- Hands out due messages (with the address, and push subscriptions) and marks them as being sent.
create or replace function public.dispatch_claim(p_secret text, p_limit integer default 25) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  if not public._job_ok(p_secret) then raise exception 'Not allowed.'; end if;
  with picked as (
    select id from public.outbox
    where send_after <= now() and (status = 'pending' or (status = 'sending' and created_at < now() - interval '10 minutes'))
    order by urgency, send_after limit least(greatest(p_limit, 1), 100) for update skip locked
  ), upd as (
    update public.outbox o set status = 'sending', attempts = o.attempts + 1 from picked where o.id = picked.id returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id, 'channel', u.channel, 'kind', u.kind, 'subject', u.subject, 'body', u.body, 'url', u.url, 'urgency', u.urgency,
    'email', p.email, 'name', p.full_name,
    'subs', case when u.channel = 'push' then (select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]') from public.push_subscriptions s where s.user_id = u.user_id) else '[]'::jsonb end
  )), '[]'::jsonb) into out
  from upd u join public.profiles p on p.id = u.user_id;
  return out;
end $$;

create or replace function public.dispatch_finish(p_secret text, p_id bigint, p_ok boolean, p_error text default null, p_skip boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._job_ok(p_secret) then raise exception 'Not allowed.'; end if;
  update public.outbox set
    status = case when p_ok then 'sent' when p_skip then 'skipped' when attempts >= 3 then 'failed' else 'pending' end,
    sent_at = case when p_ok then now() else sent_at end,
    last_error = left(p_error, 300),
    send_after = case when p_ok or p_skip or attempts >= 3 then send_after else now() + interval '5 minutes' end
  where id = p_id;
end $$;

create or replace function public.dispatch_drop_subscription(p_secret text, p_endpoint text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._job_ok(p_secret) then raise exception 'Not allowed.'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
end $$;

revoke execute on function public.dispatch_claim(text, integer), public.dispatch_finish(text, bigint, boolean, text, boolean), public.dispatch_drop_subscription(text, text) from public;
grant execute on function public.dispatch_claim(text, integer), public.dispatch_finish(text, bigint, boolean, text, boolean), public.dispatch_drop_subscription(text, text) to anon, authenticated;

-- ---------- schedules ----------
-- Re-creates the jobs so this file can be run again. The dispatcher URL and secret are set by scripts/setup-alerts.mjs.
create or replace function public.schedule_jobs(p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare j text;
begin
  for j in select jobname from cron.job where jobname like 'campuscast-%' loop perform cron.unschedule(j); end loop;
  perform cron.schedule('campuscast-publish', '* * * * *', 'select public.publish_due()');
  perform cron.schedule('campuscast-reminders', '* * * * *', 'select public.due_reminders()');
  perform cron.schedule('campuscast-digest', '30 1 * * *', 'select public.build_digests()');   -- 01:30 UTC = 07:00 IST
  perform cron.schedule('campuscast-expire', '15 * * * *', 'select public.expire_listings()');
  perform cron.schedule('campuscast-dispatch', '* * * * *', format(
    $c$select net.http_post(url := %L, headers := jsonb_build_object('content-type', 'application/json', 'x-job-secret', (select value from public.app_private where key = 'job_secret')), body := '{}'::jsonb, timeout_milliseconds := 20000)$c$, p_url));
end $$;
revoke execute on function public.schedule_jobs(text) from public, anon, authenticated;

-- ---------- my own alert history, for the notifications page ----------
create or replace function public.my_outbox_summary() returns table (channel text, status text, n integer)
language sql stable security definer set search_path = public as $$
  select channel, status, count(*)::integer from public.outbox where user_id = auth.uid() and created_at > now() - interval '30 days' group by 1, 2
$$;
grant execute on function public.my_outbox_summary() to authenticated;

-- ---------- "send me a test alert" (checks email and push end to end) ----------
create or replace function public.send_test_alert() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_verified() then raise exception 'Not allowed.'; end if;
  if (select count(*) from public.notifications where user_id = auth.uid() and kind = 'test' and created_at > now() - interval '1 minute') >= 2 then
    raise exception 'Wait a minute before sending another test.';
  end if;
  insert into public.notifications (user_id, kind, title, body, url, urgency)
  values (auth.uid(), 'test', 'Test alert from CampusCast', 'If you can read this, this channel works.', '/dashboard/notifications', 1);
end $$;
grant execute on function public.send_test_alert() to authenticated;
