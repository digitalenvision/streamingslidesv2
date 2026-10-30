-- Gusto Command: one admin panel for media and staff.
--
-- * Admin accounts (owners and managers) replace the old `staff` table. Every admin must
--   sign in with a password AND an authenticator app code: the data is only readable
--   from an `aal2` session (see is_admin()).
-- * Team members (bar, DJs, security) are records, not logins: `employees`.
-- * Schedules: `shifts` (one per person per night), `time_off` (vacation, sick days,
--   other leave, asked-off days), `shift_types` and `departments` hold the rules the
--   schedule is checked against (days off per week, early/late targets, minimum
--   number of people per night).
-- * `audit_log`: who changed what, append-only, readable by owners.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Admin accounts
-- ---------------------------------------------------------------------------
alter table public.staff rename to admin_users;
alter table public.admin_users drop constraint if exists staff_role_check;
update public.admin_users set role = 'manager' where role = 'editor';
alter table public.admin_users
  alter column role set default 'manager',
  add constraint admin_users_role_check check (role in ('owner', 'manager')),
  add column name text;
alter policy "Staff can see the team" on public.admin_users rename to "Admins see admins";
-- Accounts are created, changed and removed by the admin-users edge function
-- (owners only), never straight from the browser.
drop policy "Owners manage the team" on public.admin_users;

-- Signed in with a second factor (authenticator app) in this session.
create or replace function public.is_mfa_session()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2';
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_mfa_session()
     and exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_mfa_session()
     and exists (select 1 from public.admin_users where user_id = (select auth.uid()) and role = 'owner');
$$;

-- Older policies (albums, photos, promos, screens, storage) call is_staff(): same rule.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin();
$$;

-- The signed-in person's role, before the second factor is done, so the app knows
-- whether to ask for a code (and doesn't show "no access" to a real admin).
create or replace function public.my_admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.admin_users where user_id = (select auth.uid());
$$;
revoke all on function public.my_admin_role() from public, anon;
grant execute on function public.my_admin_role() to authenticated;

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_email text,
  table_name text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  record_id text,
  record jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
alter table public.audit_log enable row level security;
create policy "Owners read the audit log" on public.audit_log for select to authenticated using (public.is_owner());

create or replace function public.audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (actor, actor_email, table_name, action, record_id, record)
  values (
    auth.uid(),
    auth.jwt() ->> 'email',
    tg_table_name,
    lower(tg_op),
    coalesce(rec ->> 'id', rec ->> 'user_id'),
    rec - 'lqip'
  );
  return null;
end;
$$;

-- (admin account changes are logged by the admin-users edge function, which knows who did it)
create trigger event_albums_audit after insert or update or delete on public.event_albums
  for each row execute function public.audit();
create trigger promo_slides_audit after insert or update or delete on public.promo_slides
  for each row execute function public.audit();
create trigger screens_audit after insert or delete on public.screens
  for each row execute function public.audit();

-- ---------------------------------------------------------------------------
-- Departments and shift types: the rules each schedule is checked against.
-- ---------------------------------------------------------------------------
create table public.departments (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 40),
  -- Shown on the schedule and the print-out ("Bar staff").
  plural text not null,
  position integer not null default 0,
  -- Days off every person gets each week (null = no rule).
  days_off_per_week integer check (days_off_per_week between 0 and 7),
  -- How the team is planned:
  --   week    a week at a time, a row per person (bar)
  --   blocks  a week at a time, each night in time blocks plus posts like the stair (security)
  --   month   a month at a time, who plays each night (DJs)
  --   none    not on the schedule (management); still in People, time off and openers
  schedule_by text not null default 'week' check (schedule_by in ('week', 'blocks', 'month', 'none')),
  -- Blocks and month teams: the times a new booking gets (DJs 9:00 PM; security 8:30 PM to
  -- 1:30 AM). No end = until closing. Single nights can differ.
  usual_start time not null default '21:00',
  usual_end time,
  -- Blocks teams: where people can be posted (Stair - Entrance) or tagged (VIP).
  locations text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.shift_types (
  id uuid primary key default gen_random_uuid(),
  department_id text not null references public.departments (id) on delete cascade,
  name text not null check (length(name) between 1 and 30),
  -- One or two letters for the grid, print-out and keyboard shortcut (E, L, D…).
  code text not null check (code ~ '^[A-Z0-9]{1,2}$'),
  start_time time not null,
  end_time time,
  -- Nights per person per week on this shift (null = no target).
  weekly_target integer check (weekly_target between 0 and 7),
  -- People needed on this shift each night, Monday to Sunday (null = no minimum).
  daily_minimum integer[] check (
    daily_minimum is null
    or (array_length(daily_minimum, 1) = 7 and 0 <= all (daily_minimum) and 50 >= all (daily_minimum))
  ),
  color text not null default 'gold',
  position integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (department_id, code)
);

insert into public.departments (id, name, plural, position, days_off_per_week, schedule_by) values
  ('bar', 'Bar', 'Bar staff', 0, 2, 'week'),
  ('dj', 'DJ', 'DJs', 1, null, 'month'),
  ('security', 'Security', 'Security', 2, null, 'blocks'),
  ('management', 'Management', 'Management', 3, null, 'none');
update public.departments set usual_start = '20:30', usual_end = '01:30', locations = '{Stair - Entrance,VIP}' where id = 'security';

-- Bar, from the manager: everyone gets 2 days off, 2 late starts and 3 early starts a week;
-- at least 3 people start at 17:30 every night, 4 on Fridays and Saturdays. Late starts at 19:45.
-- Both times can be changed in Schedule rules.
insert into public.shift_types (department_id, name, code, start_time, weekly_target, daily_minimum, color, position) values
  ('bar', 'Early', 'E', '17:30', 3, array[3, 3, 3, 3, 4, 4, 3], 'gold', 0),
  ('bar', 'Late', 'L', '19:45', 2, null, 'violet', 1);

-- ---------------------------------------------------------------------------
-- Team members (no logins)
-- ---------------------------------------------------------------------------
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  department_id text not null references public.departments (id),
  job_title text,
  phone text,
  email text,
  -- Default shift for this person (used when filling a week).
  default_shift_type_id uuid references public.shift_types (id) on delete set null,
  -- Vacation days per year, as in the contract.
  vacation_days numeric(4, 1) not null default 15 check (vacation_days between 0 and 60),
  started_on date,
  -- Shown on Today and the schedule in their birthday week.
  birthday date check (birthday between '1920-01-01' and '2020-12-31'),
  -- Invited for a night or two (guest DJs), not on the regular team.
  guest boolean not null default false,
  -- On the schedule but outside the team's numbers and weekly rules (e.g. hookah staff on the bar sheet).
  counted boolean not null default true,
  -- Has keys: can open the club for the early staff (Peter, Jordan; Alec as backup).
  can_open boolean not null default false,
  -- DJ logo in the public gallery bucket (dj-logos/…). Dark logos are flipped to white on screen.
  logo_path text,
  logo_invert boolean not null default false,
  active boolean not null default true,
  notes text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index employees_department_idx on public.employees (department_id, position);

-- The resident DJs. Invited DJs are added from the DJ schedule as guests.
insert into public.employees (name, department_id, job_title, vacation_days, position) values
  ('Bamfstarz', 'dj', 'Resident DJ', 0, 0),
  ('PTR', 'dj', 'Resident DJ', 0, 1),
  ('Rayden', 'dj', 'Resident DJ', 0, 2),
  ('Devin', 'dj', 'Resident DJ', 0, 3),
  ('MC Jayden', 'dj', 'MC', 0, 4);
create trigger employees_touch before update on public.employees
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Shifts: one row per person per night. The night's date is the evening it starts
-- (a Saturday shift from 22:00 to 04:00 is Saturday).
-- ---------------------------------------------------------------------------
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('work', 'off')),
  shift_type_id uuid references public.shift_types (id) on delete set null,
  start_time time,
  -- DJs: optional, for event nights (Halloween: 9:00 PM – 11:00 PM).
  -- Blocks teams (security): no end = until closing.
  end_time time,
  note text check (length(note) <= 200),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (employee_id, date),
  check ((kind = 'work') = (start_time is not null))
);
create index shifts_date_idx on public.shifts (date);
create trigger shifts_touch before update on public.shifts
  for each row execute function public.touch_updated_at();

-- Changing a shift's start time in the rules moves the shifts already planned from
-- tonight on (the ones still at the old time; one-off times set by hand stay).
create or replace function public.shift_types_retime()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.shifts
     set start_time = new.start_time
   where shift_type_id = new.id
     and start_time = old.start_time
     and date >= ((now() at time zone 'America/Aruba') - interval '6 hours')::date;
  return null;
end;
$$;
create trigger shift_types_retime after update of start_time on public.shift_types
  for each row when (old.start_time is distinct from new.start_time)
  execute function public.shift_types_retime();

-- A note per department per week, printed at the top of the schedule.
create table public.schedule_weeks (
  department_id text not null references public.departments (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  note text check (length(note) <= 500),
  updated_at timestamptz not null default now(),
  primary key (department_id, week_start)
);

-- A note per night for the whole venue ("Halloween"), shown above that day on every schedule.
create table public.schedule_days (
  date date primary key,
  note text not null check (length(note) between 1 and 60),
  updated_at timestamptz not null default now()
);

-- Who opens the club each night for the early staff. One per night for the whole venue.
create table public.night_openers (
  date date primary key,
  employee_id uuid not null references public.employees (id) on delete cascade,
  updated_at timestamptz not null default now()
);
create trigger night_openers_touch before update on public.night_openers
  for each row execute function public.touch_updated_at();

-- Posts on a night for blocks teams: who stands where, when ("Stair - Entrance, 8:30 PM to
-- 11:00 PM: Appel"). No end = until closing. Usually one person, sometimes two.
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  department_id text not null references public.departments (id) on delete cascade,
  date date not null,
  location text not null check (length(location) between 1 and 40),
  start_time time not null,
  end_time time,
  employee_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_date_idx on public.posts (date);
create trigger posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Time off
--   vacation  counts against the yearly vacation days (`days`, editable: by default
--             the nights in the range minus the usual days off for each full week)
--   sick      called in sick; `certificate` = doctor's note received
--   leave     other leave (family, unpaid…), doesn't count against vacation
--   request   asked for the day off: the week filler gives them a day off there
-- ---------------------------------------------------------------------------
create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  kind text not null check (kind in ('vacation', 'sick', 'leave', 'request')),
  starts_on date not null,
  ends_on date not null,
  days numeric(4, 1) check (days >= 0),
  certificate boolean not null default false,
  note text check (length(note) <= 300),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (ends_on - starts_on < 366),
  -- Nobody can be on two kinds of time off on the same day.
  constraint time_off_no_overlap exclude using gist (
    employee_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  )
);
create index time_off_dates_idx on public.time_off (starts_on, ends_on);

-- When someone is off (vacation, sick, leave), their shifts in that range are cleared.
create or replace function public.time_off_clear_shifts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind <> 'request' then
    delete from public.shifts
     where employee_id = new.employee_id and date between new.starts_on and new.ends_on;
    delete from public.night_openers
     where employee_id = new.employee_id and date between new.starts_on and new.ends_on;
  end if;
  return null;
end;
$$;
create trigger time_off_clear after insert or update on public.time_off
  for each row execute function public.time_off_clear_shifts();

create trigger employees_audit after insert or update or delete on public.employees
  for each row execute function public.audit();
create trigger time_off_audit after insert or update or delete on public.time_off
  for each row execute function public.audit();
create trigger shifts_audit after insert or update or delete on public.shifts
  for each row execute function public.audit();
create trigger departments_audit after insert or update or delete on public.departments
  for each row execute function public.audit();
create trigger shift_types_audit after insert or update or delete on public.shift_types
  for each row execute function public.audit();
create trigger night_openers_audit after insert or update or delete on public.night_openers
  for each row execute function public.audit();
create trigger posts_audit after insert or update or delete on public.posts
  for each row execute function public.audit();

-- ---------------------------------------------------------------------------
-- Row level security: admins (owner or manager, signed in with 2FA) only.
-- ---------------------------------------------------------------------------
alter table public.departments enable row level security;
alter table public.shift_types enable row level security;
alter table public.employees enable row level security;
alter table public.shifts enable row level security;
alter table public.schedule_weeks enable row level security;
alter table public.schedule_days enable row level security;
alter table public.time_off enable row level security;
alter table public.posts enable row level security;
alter table public.night_openers enable row level security;

create policy "Admins manage departments" on public.departments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage shift types" on public.shift_types for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage employees" on public.employees for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage shifts" on public.shifts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage week notes" on public.schedule_weeks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage night notes" on public.schedule_days for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage time off" on public.time_off for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage openers" on public.night_openers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage posts" on public.posts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Nothing here is for anonymous visitors.
revoke all on public.departments, public.shift_types, public.employees, public.shifts,
  public.schedule_weeks, public.schedule_days, public.time_off, public.posts, public.night_openers, public.audit_log, public.admin_users from anon;
