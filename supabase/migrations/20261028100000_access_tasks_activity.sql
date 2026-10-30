-- Gusto Command: what each account may do, a shared task list, and a full activity log.
--
-- Access (admin_users)
--   owner    everything, including accounts and the activity log
--   manager  what their account allows:
--              media  albums, promos, screens, gallery emails, removal requests
--              rules  schedule rules for their teams
--              teams  the teams whose schedule, people and time off they run
--                     (null = every team; {security} = only security)
--   e.g. the security manager: manager, media off, rules off, teams {security}.
-- Every check runs in the database (row level security), so the app can't be talked
-- into showing or changing more than an account allows.
--
-- Tasks: anyone with an account adds them ("bathroom sinks not working") and says who can
-- see them: everyone, owners only, the managers of a team, or chosen people. Owners see all.
--
-- Activity: every change with who, when and what changed (before → after), plus
-- sign-ins. Only owners can read it.

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
alter table public.admin_users
  add column media boolean not null default true,
  add column rules boolean not null default true,
  add column teams text[];

create or replace function public.my_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('role', role, 'media', role = 'owner' or media, 'rules', role = 'owner' or rules,
                            'teams', case when role = 'owner' then null else teams end)
    from public.admin_users where user_id = (select auth.uid());
$$;
revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

create or replace function public.can_media()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_mfa_session() and exists (
    select 1 from public.admin_users where user_id = (select auth.uid()) and (role = 'owner' or media));
$$;

create or replace function public.can_rules()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_mfa_session() and exists (
    select 1 from public.admin_users where user_id = (select auth.uid()) and (role = 'owner' or rules));
$$;

-- Runs this team (schedule, people, time off).
create or replace function public.can_team(p_dept text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_mfa_session() and exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
       and (role = 'owner' or teams is null or p_dept = any (teams)));
$$;

-- Runs every team (adding or removing teams, venue-wide things like who opens).
create or replace function public.all_teams()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_mfa_session() and exists (
    select 1 from public.admin_users where user_id = (select auth.uid()) and (role = 'owner' or teams is null));
$$;

-- Runs at least one team.
create or replace function public.any_team()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_mfa_session() and exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
       and (role = 'owner' or teams is null or cardinality(teams) > 0));
$$;

create or replace function public.can_employee(p_employee uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.employees e where e.id = p_employee and public.can_team(e.department_id));
$$;

-- Media policies (albums, photos, promos, screens, storage, removal requests, gallery
-- emails) all go through is_staff(): now "may work on media".
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_media();
$$;

-- Team data, per team.
drop policy "Admins manage departments" on public.departments;
create policy "Team managers see their teams" on public.departments for select to authenticated using (public.can_team(id));
create policy "Rule editors change their teams" on public.departments for update to authenticated
  using (public.can_rules() and public.can_team(id)) with check (public.can_rules() and public.can_team(id));
create policy "Rule editors for every team add teams" on public.departments for insert to authenticated
  with check (public.can_rules() and public.all_teams());
create policy "Rule editors for every team remove teams" on public.departments for delete to authenticated
  using (public.can_rules() and public.all_teams());

drop policy "Admins manage shift types" on public.shift_types;
create policy "Team managers see shift types" on public.shift_types for select to authenticated using (public.can_team(department_id));
create policy "Rule editors manage shift types" on public.shift_types for all to authenticated
  using (public.can_rules() and public.can_team(department_id)) with check (public.can_rules() and public.can_team(department_id));

drop policy "Admins manage employees" on public.employees;
create policy "Team managers manage their people" on public.employees for all to authenticated
  using (public.can_team(department_id)) with check (public.can_team(department_id));

drop policy "Admins manage shifts" on public.shifts;
create policy "Team managers manage their shifts" on public.shifts for all to authenticated
  using (public.can_employee(employee_id)) with check (public.can_employee(employee_id));

drop policy "Admins manage time off" on public.time_off;
create policy "Team managers manage their time off" on public.time_off for all to authenticated
  using (public.can_employee(employee_id)) with check (public.can_employee(employee_id));

drop policy "Admins manage posts" on public.posts;
create policy "Team managers manage their posts" on public.posts for all to authenticated
  using (public.can_team(department_id)) with check (public.can_team(department_id));

drop policy "Admins manage week notes" on public.schedule_weeks;
create policy "Team managers manage their week notes" on public.schedule_weeks for all to authenticated
  using (public.can_team(department_id)) with check (public.can_team(department_id));

-- Night notes ("Halloween") are for the whole venue.
drop policy "Admins manage night notes" on public.schedule_days;
create policy "Team managers manage night notes" on public.schedule_days for all to authenticated
  using (public.any_team()) with check (public.any_team());

-- Who opens: visible to anyone running a team, set by whoever runs the opener's team.
drop policy "Admins manage openers" on public.night_openers;
create policy "Team managers see openers" on public.night_openers for select to authenticated using (public.any_team());
create policy "Team managers set openers" on public.night_openers for all to authenticated
  using (public.can_employee(employee_id)) with check (public.can_employee(employee_id));

-- Everyone with an account sees who else has one (names for tasks). This used is_staff(),
-- which now means "works on media".
alter policy "Admins see admins" on public.admin_users using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 140),
  details text check (length(details) <= 2000),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'urgent')),
  status text not null default 'open' check (status in ('open', 'doing', 'done')),
  due_on date,
  -- Who can see it: 'everyone', 'owners', 'team:<department>', 'user:<user id>'.
  -- The creator and owners always see it.
  audience text[] not null default '{everyone}' check (cardinality(audience) > 0),
  -- Photos in the private task-photos bucket: <task id>/<file>.
  photos text[] not null default '{}' check (cardinality(photos) <= 6),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null
);
create index tasks_status_idx on public.tasks (status, created_at desc);
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

create or replace function public.tasks_stamp_done()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'done' and old.status <> 'done' then
    new.done_at = now();
    new.done_by = auth.uid();
  elsif new.status <> 'done' then
    new.done_at = null;
    new.done_by = null;
  end if;
  return new;
end;
$$;
create trigger tasks_done before update of status on public.tasks
  for each row execute function public.tasks_stamp_done();

create or replace function public.can_see_task(p_audience text[], p_created_by uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_mfa_session() and exists (
    select 1 from public.admin_users a
     where a.user_id = (select auth.uid())
       and (
         a.role = 'owner'
         or p_created_by = a.user_id
         or 'everyone' = any (p_audience)
         or ('user:' || a.user_id) = any (p_audience)
         -- team tasks: whoever runs that team (managers of every team included)
         or exists (select 1 from unnest(p_audience) t
                     where t like 'team:%' and (a.teams is null or substr(t, 6) = any (a.teams)))
       ));
$$;

alter table public.tasks enable row level security;
create policy "See tasks meant for you" on public.tasks for select to authenticated
  using (public.can_see_task(audience, created_by));
create policy "Anyone with an account adds tasks" on public.tasks for insert to authenticated
  with check (public.is_admin() and created_by = (select auth.uid()));
create policy "Work on tasks you can see" on public.tasks for update to authenticated
  using (public.can_see_task(audience, created_by)) with check (public.can_see_task(audience, created_by));
create policy "Creator or owner deletes tasks" on public.tasks for delete to authenticated
  using (public.is_admin() and (created_by = (select auth.uid()) or public.is_owner()));

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author uuid default auth.uid() references auth.users (id) on delete set null,
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index task_comments_task_idx on public.task_comments (task_id, created_at);
alter table public.task_comments enable row level security;
create policy "See comments on your tasks" on public.task_comments for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id and public.can_see_task(t.audience, t.created_by)));
create policy "Comment on your tasks" on public.task_comments for insert to authenticated
  with check (author = (select auth.uid()) and exists (select 1 from public.tasks t where t.id = task_id and public.can_see_task(t.audience, t.created_by)));
create policy "Delete your own comments" on public.task_comments for delete to authenticated
  using (author = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-photos', 'task-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy "Task photos: see on your tasks" on storage.objects for select to authenticated
  using (bucket_id = 'task-photos' and exists (
    select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1] and public.can_see_task(t.audience, t.created_by)));
create policy "Task photos: add to your tasks" on storage.objects for insert to authenticated
  with check (bucket_id = 'task-photos' and exists (
    select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1] and public.can_see_task(t.audience, t.created_by)));
create policy "Task photos: remove from your tasks" on storage.objects for delete to authenticated
  using (bucket_id = 'task-photos' and exists (
    select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1] and public.can_see_task(t.audience, t.created_by)));

revoke all on public.tasks, public.task_comments from anon;

-- ---------------------------------------------------------------------------
-- Activity log
-- ---------------------------------------------------------------------------
alter table public.audit_log
  add column changes jsonb,
  drop constraint audit_log_action_check,
  add constraint audit_log_action_check check (action in ('insert', 'update', 'delete', 'sign_in'));
create index audit_log_actor_idx on public.audit_log (actor, at desc);

-- Updates record only what changed (before → after); updates where nothing that matters
-- changed (counters, timestamps) aren't logged.
create or replace function public.audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  diff jsonb;
  noise text[] := array['updated_at', 'photo_count', 'content_version', 'lqip', 'last_seen_at', 'downloads'];
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value)) into diff
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o using (key)
     where n.value is distinct from o.value and not (n.key = any (noise));
    if diff is null then return null; end if;
  end if;
  insert into public.audit_log (actor, actor_email, table_name, action, record_id, record, changes)
  values (auth.uid(), auth.jwt() ->> 'email', tg_table_name, lower(tg_op),
          coalesce(rec ->> 'id', rec ->> 'user_id', rec ->> 'date'), rec - 'lqip', diff);
  return null;
end;
$$;

create trigger event_photos_audit after insert or update or delete on public.event_photos
  for each row execute function public.audit();
create trigger schedule_weeks_audit after insert or update or delete on public.schedule_weeks
  for each row execute function public.audit();
create trigger schedule_days_audit after insert or update or delete on public.schedule_days
  for each row execute function public.audit();
create trigger tasks_audit after insert or update or delete on public.tasks
  for each row execute function public.audit();
create trigger task_comments_audit after insert or delete on public.task_comments
  for each row execute function public.audit();
create trigger gallery_visitors_audit after delete on public.gallery_visitors
  for each row execute function public.audit();
drop trigger if exists screens_audit on public.screens;
create trigger screens_audit after insert or update or delete on public.screens
  for each row execute function public.audit();

-- Called by the app once a sign-in is complete (password + authenticator code).
create or replace function public.log_sign_in()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor, actor_email, table_name, action)
  select (select auth.uid()), auth.jwt() ->> 'email', 'session', 'sign_in'
   where public.is_admin();
$$;
revoke all on function public.log_sign_in() from public, anon;
grant execute on function public.log_sign_in() to authenticated;
