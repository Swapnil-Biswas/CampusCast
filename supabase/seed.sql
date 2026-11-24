-- Demo content so a fresh dashboard is not empty. Every row is labelled [Demo] and is safe to delete.
-- Run after dashboard-1..5 and after at least one super-admin exists:  node scripts/db.mjs -f supabase/seed.sql
do $$
declare admin_id uuid; c_id uuid;
begin
  select id into admin_id from public.profiles where role = 'super_admin' and status = 'verified' order by created_at limit 1;
  if admin_id is null then raise notice 'No super-admin yet, nothing seeded.'; return; end if;
  select id into c_id from public.clubs order by name limit 1;

  insert into public.announcements (author_id, title, body, category, urgency, status, publish_at)
  select admin_id, t.title, t.body, t.cat, t.urg, 'live', now()
  from (values
    ('[Demo] Welcome to CampusCast', 'This is a sample notice. Real notices from your department and clubs appear here the moment they are published.', 'general', 3),
    ('[Demo] Internal exam timetable released', 'The timetable for the internal assessment is now available under Examinations.', 'exam', 2),
    ('[Demo] Workshop: Git and GitHub for beginners', 'Hands-on session this Saturday. Seats are limited, register under Workshops.', 'workshop', 2)
  ) as t(title, body, cat, urg)
  where not exists (select 1 from public.announcements a where a.title = t.title);

  insert into public.hackathons (title, theme, mode, description, deadline, created_by)
  select '[Demo] Campus Build Sprint', 'Open innovation', 'offline', 'A 24-hour sample hackathon.', now() + interval '14 days', admin_id
  where not exists (select 1 from public.hackathons where title = '[Demo] Campus Build Sprint');

  insert into public.events (title, description, starts_at, venue, club_id, created_by)
  select '[Demo] Open mic evening', 'A sample cultural event.', now() + interval '10 days', 'Auditorium', c_id, admin_id
  where not exists (select 1 from public.events where title = '[Demo] Open mic evening');
end $$;
