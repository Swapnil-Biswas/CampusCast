-- Stage 7: automatic exam reminders and PDF retention. Safe to re-run.
-- Run after dashboard-6-exams.sql (and after dashboard-5-alerts.sql, which sends the emails).
--
--   1. Every verified student of a published timetable gets a reminder 1 day and 2 hours before each exam:
--      in the app, and by email / push exactly as their alert settings say (reminders are sent at once).
--   2. The original PDF of a notice is removed from storage about 20 days after its last exam. The notice and its
--      timetable stay; only the file goes.

-- ============================================================
-- 1. Reminders
-- ============================================================
-- Which reminder was already sent for which exam row, so nobody gets one twice.
create table if not exists public.exam_reminders_sent (
  entry_id uuid not null references public.exam_timetable_entries (id) on delete cascade,
  lead text not null check (lead in ('1d', '2h')),
  sent_at timestamptz not null default now(),
  recipients integer not null default 0,
  primary key (entry_id, lead)
);
alter table public.exam_reminders_sent enable row level security;
revoke all on public.exam_reminders_sent from anon, authenticated;

-- Exam dates and times are college-local, so they are read as India time.
create or replace function public.exam_starts_at(p_date date, p_time time) returns timestamptz
language sql immutable as $$ select ((p_date + p_time) at time zone 'Asia/Kolkata') $$;

-- Called every minute. A reminder goes out when its moment arrives, and only within the hour after it: a notice
-- published only 3 hours before an exam does not send a stale "1 day before" message.
create or replace function public.due_exam_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; v_claimed boolean; v_count integer; v_total integer := 0; v_title text; v_body text;
begin
  for r in
    select e.id as entry_id, e.department, e.semester, e.subject_name, e.subject_code, e.exam_date, e.start_time, e.end_time, e.session,
           n.audience_depts, n.semesters, coalesce(n.category, 'ia1') as category, c.label as category_label, l.lead
    from public.exam_timetable_entries e
    join public.exam_notices n on n.id = e.notice_id and n.status = 'published'
    left join public.exam_categories c on c.code = n.category
    cross join (values ('1d', interval '1 day'), ('2h', interval '2 hours')) as l(lead, span)
    where e.exam_date is not null and e.start_time is not null
      and now() >= public.exam_starts_at(e.exam_date, e.start_time) - l.span
      and now() <  public.exam_starts_at(e.exam_date, e.start_time) - l.span + interval '1 hour'
      and not exists (select 1 from public.exam_reminders_sent s where s.entry_id = e.id and s.lead = l.lead)
    order by e.exam_date, e.start_time
    limit 200
  loop
    insert into public.exam_reminders_sent (entry_id, lead) values (r.entry_id, r.lead) on conflict do nothing;
    get diagnostics v_count = row_count;
    v_claimed := v_count = 1;
    continue when not v_claimed;                      -- another run already took it

    v_title := case r.lead when '1d' then 'Exam tomorrow: ' else 'Exam in 2 hours: ' end
               || coalesce(r.subject_name, 'Examination') || coalesce(' (' || r.subject_code || ')', '');
    v_body := trim(to_char(r.exam_date, 'FMDay, DD FMMon')) || ' at ' || to_char(r.start_time, 'FMHH12:MI AM')
              || coalesce(' to ' || to_char(r.end_time, 'FMHH12:MI AM'), '')
              || coalesce(' (' || r.session || ')', '')
              || ' · ' || coalesce(r.category_label, 'Examination')
              || '. Open CampusCast for the full timetable and instructions.';

    insert into public.notifications (user_id, kind, title, body, url, urgency, ref_id)
    select p.id, 'reminder', v_title, v_body, '/dashboard/exams?tab=' || r.category, 1, r.entry_id
    from public.profiles p
    where p.status = 'verified'
      and p.branch = any (r.audience_depts)
      and (r.department is null or p.branch = r.department)
      and (r.semesters is null or public.exam_semester(p.id) = any (r.semesters))
      and (r.semester is null or public.exam_semester(p.id) = r.semester);
    get diagnostics v_count = row_count;
    update public.exam_reminders_sent set recipients = v_count where entry_id = r.entry_id and lead = r.lead;
    v_total := v_total + v_count;
  end loop;
  return v_total;
end $$;
revoke execute on function public.due_exam_reminders() from public, anon, authenticated;

-- ============================================================
-- 2. PDF retention
-- ============================================================
alter table public.exam_documents add column if not exists deleted_at timestamptz;

-- Is this notice's PDF past its keep-until date? Last exam date + p_days; a notice with no dated rows is kept 60 days
-- after it was published. Only published or archived notices ever expire.
create or replace function public.exam_pdf_expired(p_notice uuid, p_days integer default 20) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.exam_notices n
    where n.id = p_notice and n.status in ('published', 'archived')
      and case
        when exists (select 1 from public.exam_timetable_entries e where e.notice_id = n.id and e.exam_date is not null)
          then (select max(e.exam_date) from public.exam_timetable_entries e where e.notice_id = n.id) + greatest(p_days, 1) < (now() at time zone 'Asia/Kolkata')::date
        else coalesce(n.published_at, n.created_at) + interval '60 days' < now()
      end
  )
$$;
grant execute on function public.exam_pdf_expired(uuid, integer) to authenticated;

-- The files that can be removed now. A signed-in admin gets only those for departments they approve for.
create or replace function public.exam_expired_pdfs(p_days integer default 20)
returns table (document_id uuid, notice_id uuid, storage_path text)
language sql stable security definer set search_path = public as $$
  select d.id, d.notice_id, d.storage_path
  from public.exam_documents d join public.exam_notices n on n.id = d.notice_id
  where d.deleted_at is null and public.exam_pdf_expired(n.id, p_days)
    and (auth.uid() is null or public.can_approve_exam_depts(n.audience_depts))
  limit 200
$$;
grant execute on function public.exam_expired_pdfs(integer) to authenticated;

-- Called after the files were removed from storage.
create or replace function public.exam_mark_pdfs_deleted(p_ids uuid[], p_days integer default 20) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.exam_documents d set deleted_at = now()
  from public.exam_notices x
  where d.id = any (p_ids) and d.deleted_at is null and x.id = d.notice_id
    and public.exam_pdf_expired(x.id, p_days)
    and (auth.uid() is null or public.can_approve_exam_depts(x.audience_depts));
  get diagnostics n = row_count;
  if n > 0 then perform public.log_audit('exam.pdf_removed', 'exam_document', array_to_string(p_ids, ','), jsonb_build_object('count', n)); end if;
  return n;
end $$;
grant execute on function public.exam_mark_pdfs_deleted(uuid[], integer) to authenticated;

-- Approvers may delete the stored file of an expired notice for their departments (super admins already can).
drop policy if exists "Remove expired exam PDFs" on storage.objects;
create policy "Remove expired exam PDFs" on storage.objects for delete to authenticated
  using (bucket_id = 'exam-pdfs' and public.is_admin() and exists (
    select 1 from public.exam_documents d join public.exam_notices n on n.id = d.notice_id
    where d.storage_path = storage.objects.name and public.exam_pdf_expired(n.id) and public.can_approve_exam_depts(n.audience_depts)
  ));

-- ============================================================
-- 3. Schedule the reminder job (every minute), where pg_cron is available.
-- ============================================================
-- Named "exams-reminders" (not "campuscast-...") so that re-running dashboard-5's schedule_jobs() leaves it alone.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'exams-reminders';
    perform cron.schedule('exams-reminders', '* * * * *', 'select public.due_exam_reminders()');
  end if;
end $$;
