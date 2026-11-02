-- Choices about a night whose event itself lives in Fourvenues: whether the website features
-- it (homepage and VIP tables page), and whether it skips the usual happy hour. A night
-- without a row is a regular night. Name and start are copies, for the activity log.
create table public.event_settings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  starts_at timestamptz not null,
  highlighted boolean not null default false,
  no_happy_hour boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger event_settings_touch before update on public.event_settings
  for each row execute function public.touch_updated_at();
create trigger event_settings_audit after insert or update or delete on public.event_settings
  for each row execute function public.audit();

alter table public.event_settings enable row level security;
-- The website reads these with the anon key; nothing here is private.
create policy "Anyone can read event settings" on public.event_settings for select to anon, authenticated
  using (true);
create policy "Media team adds event settings" on public.event_settings for insert to authenticated
  with check (public.can_media());
create policy "Media team changes event settings" on public.event_settings for update to authenticated
  using (public.can_media()) with check (public.can_media());
create policy "Media team removes event settings" on public.event_settings for delete to authenticated
  using (public.can_media());

revoke all on public.event_settings from anon, authenticated;
grant select on public.event_settings to anon, authenticated;
grant insert, update, delete on public.event_settings to authenticated;
