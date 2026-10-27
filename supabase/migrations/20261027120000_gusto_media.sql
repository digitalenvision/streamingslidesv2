-- Gusto media: event albums for the website gallery and the TV screens, promo slides,
-- screen rules, gallery email sign-ups and photo removal requests.
--
-- Lives next to the old slideshow tables (albums, photos, slideshows, streams…) without
-- touching them, so the current TV slideshow keeps working until the new player is live.
--
-- Storage layout
--   gallery (public, CDN-cached, immutable paths)
--     albums/<album_id>/<photo_id>/400.<format> | 1080.<format> | 1920.<format>
--     (format is webp, or jpg when the uploading browser can't encode WebP)
--     promos/<promo_id>/<file>
--   gallery-originals (private; signed URLs only)
--     albums/<album_id>/<photo_id>.jpg      3000px download copy

-- ---------------------------------------------------------------------------
-- Staff: everyone allowed to manage media. Existing app users become owners.
-- ---------------------------------------------------------------------------
create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now()
);

insert into public.staff (user_id, email, role)
select id, email, 'owner' from auth.users
on conflict do nothing;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = (select auth.uid()));
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = (select auth.uid()) and role = 'owner');
$$;

alter table public.staff enable row level security;
create policy "Staff can see the team" on public.staff for select to authenticated using (public.is_staff());
create policy "Owners manage the team" on public.staff for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Screens: one row per TV (or group of TVs showing the same thing).
-- content_version goes up whenever anything a screen shows changes; players
-- listen for it over Realtime and refresh their playlist.
-- ---------------------------------------------------------------------------
create table public.screens (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  max_albums integer not null default 12 check (max_albums between 1 and 50),
  max_days integer not null default 45 check (max_days between 1 and 365),
  photo_seconds numeric(4, 1) not null default 6 check (photo_seconds between 2 and 60),
  transition text not null default 'fade' check (transition in ('fade', 'slide', 'zoom', 'none')),
  shuffle boolean not null default false,
  show_album_titles boolean not null default true,
  -- The TVs already open stream.gustoaruba.com/preview/<old slideshow id>. Setting that id
  -- here makes the same address play this screen instead, with nothing to change on the TV.
  legacy_slideshow_id uuid unique,
  content_version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger screens_touch before update on public.screens
  for each row execute function public.touch_updated_at();

insert into public.screens (name) values ('Main screens');

create or replace function public.bump_screens()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- (a WHERE clause is required: Supabase blocks unqualified UPDATEs from API calls)
  update public.screens set content_version = content_version + 1 where id is not null;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Albums and photos
-- ---------------------------------------------------------------------------
create table public.event_albums (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 120),
  event_date date not null,
  description text,
  fourvenues_code text,
  cover_photo_id uuid,
  status text not null default 'draft' check (status in ('draft', 'published')),
  show_on_web boolean not null default true,
  -- auto: on the screens while recent enough; pinned: always; hidden: never
  screen_mode text not null default 'auto' check (screen_mode in ('auto', 'pinned', 'hidden')),
  photo_count integer not null default 0,
  published_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_albums_date_idx on public.event_albums (event_date desc);

create table public.event_photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.event_albums (id) on delete cascade,
  position integer not null default 0,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  format text not null default 'webp' check (format in ('webp', 'jpg')),
  -- Tiny blurred preview (data URI, a few hundred bytes) shown while the image loads.
  lqip text,
  original_name text,
  taken_at timestamptz,
  hidden_web boolean not null default false,
  hidden_screen boolean not null default false,
  created_at timestamptz not null default now()
);
create index event_photos_album_idx on public.event_photos (album_id, position);

alter table public.event_albums
  add constraint event_albums_cover_fk foreign key (cover_photo_id) references public.event_photos (id) on delete set null;

create trigger event_albums_touch before update on public.event_albums
  for each row execute function public.touch_updated_at();

-- published_at is stamped the first time an album goes live.
create or replace function public.event_albums_stamp_published()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;
create trigger event_albums_published before insert or update of status on public.event_albums
  for each row execute function public.event_albums_stamp_published();

-- photo_count follows the photos table; the first photo becomes the cover.
create or replace function public.event_photos_sync_album()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.album_id, old.album_id);
begin
  update public.event_albums a
     set photo_count = (select count(*) from public.event_photos p where p.album_id = target),
         cover_photo_id = coalesce(
           a.cover_photo_id,
           (select p.id from public.event_photos p where p.album_id = target order by p.position, p.created_at limit 1)
         )
   where a.id = target;
  return null;
end;
$$;
create trigger event_photos_sync after insert or delete on public.event_photos
  for each row execute function public.event_photos_sync_album();

create trigger event_albums_bump after insert or update or delete on public.event_albums
  for each statement execute function public.bump_screens();
create trigger event_photos_bump after update or delete on public.event_photos
  for each statement execute function public.bump_screens();

-- Save a new photo order in one call (ids in display order).
create or replace function public.reorder_photos(p_album_id uuid, p_photo_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.event_photos p
     set position = o.ord
    from unnest(p_photo_ids) with ordinality as o (id, ord)
   where p.id = o.id and p.album_id = p_album_id;
$$;

-- ---------------------------------------------------------------------------
-- Promo slides: event flyers and videos mixed into the screens.
-- ---------------------------------------------------------------------------
create table public.promo_slides (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null check (kind in ('image', 'video')),
  path text not null,
  width integer,
  height integer,
  -- Images: seconds on screen. Videos play to the end.
  duration_seconds integer not null default 10 check (duration_seconds between 3 and 120),
  -- Shown after every N photos (the promos take turns).
  every_n integer not null default 8 check (every_n between 1 and 100),
  starts_on date,
  ends_on date,
  active boolean not null default true,
  position integer not null default 0,
  -- null = every screen
  screen_ids uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create trigger promo_slides_touch before update on public.promo_slides
  for each row execute function public.touch_updated_at();
create trigger promo_slides_bump after insert or update or delete on public.promo_slides
  for each statement execute function public.bump_screens();

-- ---------------------------------------------------------------------------
-- Gallery visitors (email gate) and removal requests. Written by the website's
-- server code with the service key; staff can read and export them.
-- ---------------------------------------------------------------------------
create table public.gallery_visitors (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  marketing_opt_in boolean not null default false,
  first_album_id uuid references public.event_albums (id) on delete set null,
  downloads integer not null default 0,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.photo_removal_requests (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid references public.event_photos (id) on delete set null,
  album_id uuid references public.event_albums (id) on delete set null,
  email text not null,
  reason text,
  status text not null default 'open' check (status in ('open', 'done', 'rejected')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

-- The website counts downloads per visitor (service key only).
create or replace function public.count_gallery_download(p_visitor uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.gallery_visitors set downloads = downloads + 1, last_seen_at = now() where id = p_visitor;
$$;
revoke all on function public.count_gallery_download(uuid) from public, anon, authenticated;
grant execute on function public.count_gallery_download(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.screens enable row level security;
alter table public.event_albums enable row level security;
alter table public.event_photos enable row level security;
alter table public.promo_slides enable row level security;
alter table public.gallery_visitors enable row level security;
alter table public.photo_removal_requests enable row level security;

create policy "Staff manage screens" on public.screens for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
-- Players read their own row (by id) to follow content_version over Realtime.
create policy "Anyone can read screens" on public.screens for select to anon using (true);

create policy "Public sees published albums" on public.event_albums for select to anon, authenticated
  using (status = 'published' and show_on_web);
create policy "Staff manage albums" on public.event_albums for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "Public sees photos of published albums" on public.event_photos for select to anon, authenticated
  using (
    not hidden_web
    and exists (select 1 from public.event_albums a where a.id = album_id and a.status = 'published' and a.show_on_web)
  );
create policy "Staff manage photos" on public.event_photos for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "Staff manage promos" on public.promo_slides for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "Staff read visitors" on public.gallery_visitors for select to authenticated using (public.is_staff());
create policy "Staff remove visitors" on public.gallery_visitors for delete to authenticated using (public.is_staff());

create policy "Staff handle removal requests" on public.photo_removal_requests for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- What a screen plays: published albums within its window (pinned always,
-- hidden never), newest first, plus the promo slides running today (Aruba time).
-- Callable without logging in: the TV only needs the screen's id (or the old slideshow
-- id it was set up with). Returns null when the id isn't a screen.
-- ---------------------------------------------------------------------------
create or replace function public.screen_playlist(p_screen_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select * from public.screens where id = p_screen_id or legacy_slideshow_id = p_screen_id
     order by (id = p_screen_id) desc
     limit 1
  ),
  today as (
    select (now() at time zone 'America/Aruba')::date as d
  ),
  picked as (
    select a.*
      from public.event_albums a, s, today
     where a.status = 'published'
       and a.screen_mode <> 'hidden'
       and (a.screen_mode = 'pinned' or a.event_date >= today.d - s.max_days)
     order by (a.screen_mode = 'pinned') desc, a.event_date desc, a.created_at desc
     limit (select max_albums from s)
  )
  select case when not exists (select 1 from s) then null else jsonb_build_object(
    'screen', (select to_jsonb(s) - 'created_at' - 'updated_at' from s),
    'albums', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'title', p.title,
        'event_date', p.event_date,
        'photos', coalesce((
          select jsonb_agg(jsonb_build_object('id', ph.id, 'w', ph.width, 'h', ph.height, 'f', ph.format) order by ph.position, ph.created_at)
            from public.event_photos ph
           where ph.album_id = p.id and not ph.hidden_screen
        ), '[]'::jsonb)
      ) order by p.event_date desc, p.created_at desc)
      from picked p
    ), '[]'::jsonb),
    'promos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id, 'title', pr.title, 'kind', pr.kind, 'path', pr.path, 'w', pr.width, 'h', pr.height,
        'duration_seconds', pr.duration_seconds, 'every_n', pr.every_n
      ) order by pr.position, pr.created_at)
      from public.promo_slides pr, today
      where pr.active
        and (pr.starts_on is null or pr.starts_on <= today.d)
        and (pr.ends_on is null or pr.ends_on >= today.d)
        and (pr.screen_ids is null or (select id from s) = any (pr.screen_ids))
    ), '[]'::jsonb)
  ) end;
$$;
revoke all on function public.screen_playlist(uuid) from public;
grant execute on function public.screen_playlist(uuid) to anon, authenticated;

-- Players subscribe to screen rows to notice content changes.
alter publication supabase_realtime add table public.screens;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('gallery', 'gallery', true, 209715200, array['image/webp', 'image/jpeg', 'image/png', 'video/mp4', 'video/webm']),
  ('gallery-originals', 'gallery-originals', false, 52428800, array['image/jpeg'])
on conflict (id) do nothing;

create policy "Staff upload gallery files" on storage.objects for insert to authenticated
  with check (bucket_id in ('gallery', 'gallery-originals') and public.is_staff());
create policy "Staff update gallery files" on storage.objects for update to authenticated
  using (bucket_id in ('gallery', 'gallery-originals') and public.is_staff());
create policy "Staff delete gallery files" on storage.objects for delete to authenticated
  using (bucket_id in ('gallery', 'gallery-originals') and public.is_staff());
create policy "Staff read gallery originals" on storage.objects for select to authenticated
  using (bucket_id in ('gallery', 'gallery-originals') and public.is_staff());
