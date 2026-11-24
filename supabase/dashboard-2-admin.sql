-- Stage 2: audit trail for admin actions that go through plain table writes. Safe to re-run.

create or replace function public.audit_notice_changes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.log_audit('notice.deleted', 'announcement', old.id::text, jsonb_build_object('title', old.title));
    return old;
  end if;
  if tg_op = 'INSERT' then
    perform public.log_audit('notice.created', 'announcement', new.id::text, jsonb_build_object('title', new.title, 'urgency', new.urgency, 'status', new.status));
  elsif old.status is distinct from new.status then
    perform public.log_audit('notice.' || new.status, 'announcement', new.id::text, jsonb_build_object('title', new.title));
  end if;
  return new;
end $$;
drop trigger if exists announcements_audit on public.announcements;
create trigger announcements_audit after insert or update or delete on public.announcements
  for each row when (auth.uid() is not null) execute function public.audit_notice_changes();

create or replace function public.audit_club_lead_changes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit('club_lead.added', 'club', new.club_id::text, jsonb_build_object('user', new.user_id));
    return new;
  end if;
  perform public.log_audit('club_lead.removed', 'club', old.club_id::text, jsonb_build_object('user', old.user_id));
  return old;
end $$;
drop trigger if exists club_admins_audit on public.club_admins;
create trigger club_admins_audit after insert or delete on public.club_admins
  for each row when (auth.uid() is not null) execute function public.audit_club_lead_changes();

-- Lets the people page show names beside audit entries.
create or replace function public.audit_feed(p_limit integer default 100)
returns table (id bigint, created_at timestamptz, action text, target_type text, target_id text, detail jsonb, actor_name text, actor_email text)
language sql stable security definer set search_path = public as $$
  select l.id, l.created_at, l.action, l.target_type, l.target_id, l.detail, p.full_name, p.email
  from public.audit_log l left join public.profiles p on p.id = l.actor
  where public.is_admin()
  order by l.created_at desc limit least(coalesce(p_limit, 100), 500)
$$;
grant execute on function public.audit_feed(integer) to authenticated;

-- Follower counts for the clubs page (follows are private per student, so admins get only the number).
create or replace function public.club_follower_count(p_club uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then (select count(*)::integer from public.club_follows where club_id = p_club) else 0 end
$$;
grant execute on function public.club_follower_count(uuid) to authenticated;
