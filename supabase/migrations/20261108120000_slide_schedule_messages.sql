-- Slides get a weekly schedule, can be designed in Command, and can take over the screens.
--
--   days        nights of the week it plays (0 = Sunday … 6 = Saturday), null = every night
--   show_from   hours it plays within the night (both null = all night). Windows may run
--   show_until  past midnight: 22:00 → 02:00.
--   every_minutes  how often it comes round in minutes instead of every_n photos (the player
--               turns minutes into photos with the screen's seconds per photo).
--   takeover_at    times it takes over its screens on its nights (2:50 AM: closing soon),
--   takeover_minutes  for this long. Follows days and dates, not hours or the on/off switch.
--   skip_until  Stop pressed during a set-time takeover: takeovers ending by then don't play.
--   live_until  "Show now": until then the slide takes over its screens, whatever its
--               schedule or on/off switch says.
--   design      kind 'message': a slide made in Command (layout, words, background).
--               Rendered live on the TV, so it's sharp on any screen. No file of its own;
--               uploaded backgrounds and product shots live under promos/<id>/.
--
-- A club night runs 6 AM to 6 AM: at 1:30 AM on a Saturday it's still Friday night, so a
-- Friday slide (and a slide ending on Friday) keeps playing until the club closes.

alter table public.promo_slides
  add column days smallint[],
  add column show_from time,
  add column show_until time,
  add column live_until timestamptz,
  add column every_minutes smallint check (every_minutes between 1 and 120),
  add column takeover_at time[] check (cardinality(takeover_at) <= 12),
  add column takeover_minutes smallint not null default 10 check (takeover_minutes between 1 and 240),
  add column skip_until timestamptz,
  add column design jsonb,
  alter column path drop not null;

-- The kind check was created inline, so find it by what it says rather than by name.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.promo_slides'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%kind%'
  loop
    execute format('alter table public.promo_slides drop constraint %I', c);
  end loop;
end $$;

alter table public.promo_slides
  add constraint promo_slides_kind_check check (kind in ('image', 'video', 'message')),
  add constraint promo_slides_content_check check (
    case when kind = 'message' then design is not null and jsonb_typeof(design) = 'object' else path is not null end
  ),
  add constraint promo_slides_days_check check (
    days is null or (cardinality(days) between 1 and 7 and days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
  ),
  add constraint promo_slides_hours_check check (
    (show_from is null) = (show_until is null) and (show_from is null or show_from <> show_until)
  );

-- What a screen plays. Albums are unchanged from 20261102090000. New: slides follow their
-- nights and hours, "live" holds the slides taking over the screen, "now" is the server's
-- clock (TVs' clocks can be off) and "refresh_in" says when the clock alone will next
-- change what plays, so the TV asks again right then instead of waiting for its poll.
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
  night as (
    select ((now() at time zone 'America/Aruba') - interval '6 hours')::date as d,
           extract(dow from (now() at time zone 'America/Aruba') - interval '6 hours')::int as dow,
           (now() at time zone 'America/Aruba')::time as t,
           now() at time zone 'America/Aruba' as l
  ),
  picked as (
    select a.*
      from public.event_albums a, s, today
     where a.status = 'published'
       and a.screen_mode <> 'hidden'
       and (a.screen_mode = 'pinned' or a.event_date >= today.d - s.max_days)
     order by (a.screen_mode = 'pinned') desc, a.event_date desc, a.created_at desc
     limit (select max_albums from s)
  ),
  on_screen as (
    select pr.* from public.promo_slides pr, s
     where pr.screen_ids is null or s.id = any (pr.screen_ids)
  ),
  rotation as (
    select pr.* from on_screen pr, night
     where pr.active
       and (pr.starts_on is null or pr.starts_on <= night.d)
       and (pr.ends_on is null or pr.ends_on >= night.d)
       and (pr.days is null or night.dow = any (pr.days))
       and (
         pr.show_from is null
         or (pr.show_from < pr.show_until and night.t >= pr.show_from and night.t < pr.show_until)
         or (pr.show_from > pr.show_until and (night.t >= pr.show_from or night.t < pr.show_until))
       )
  ),
  -- Takeovers at set times tonight: each time falls in tonight's 6 AM to 6 AM.
  scheduled as (
    select pr.id, (st.at + make_interval(mins => pr.takeover_minutes)) at time zone 'America/Aruba' as until
      from on_screen pr, night,
           lateral (select night.d + (case when tt >= time '06:00' then 0 else 1 end) + tt as at from unnest(pr.takeover_at) tt) st
     where (pr.starts_on is null or pr.starts_on <= night.d)
       and (pr.ends_on is null or pr.ends_on >= night.d)
       and (pr.days is null or night.dow = any (pr.days))
       and night.l >= st.at and night.l < st.at + make_interval(mins => pr.takeover_minutes)
       and (pr.skip_until is null or pr.skip_until < (st.at + make_interval(mins => pr.takeover_minutes)) at time zone 'America/Aruba')
  ),
  live as (
    select id, max(until) as until from (
      select id, live_until as until from on_screen where live_until > now()
      union all select id, until from scheduled
    ) x group by id
  ),
  changes as (
    select extract(epoch from until - now()) as secs from live
    union all
    -- Next time any slide's hours or takeovers start or end, and the 6 AM change of night.
    select mod(extract(epoch from (b.at - night.t) + interval '24 hours'), 86400)
      from night, (
        select show_from as at from on_screen where show_from is not null
        union select show_until from on_screen where show_until is not null
        union select tt from on_screen, unnest(takeover_at) tt
        union select tt + make_interval(mins => takeover_minutes) from on_screen, unnest(takeover_at) tt
        union select time '06:00'
      ) b
  ),
  slide as (
    select pr.id, jsonb_build_object(
      'id', pr.id, 'title', pr.title, 'kind', pr.kind, 'path', pr.path, 'w', pr.width, 'h', pr.height,
      'duration_seconds', pr.duration_seconds, 'every_n', pr.every_n, 'every_minutes', pr.every_minutes, 'design', pr.design
    ) as j, pr.position, pr.created_at
      from on_screen pr
  )
  select case when not exists (select 1 from s) then null else jsonb_build_object(
    'screen', (select to_jsonb(s) - 'created_at' - 'updated_at' from s),
    'albums', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'title', p.title,
        'event_date', p.event_date,
        'fresh', coalesce(p.published_at > now() - interval '15 minutes', false),
        'photos', coalesce((
          select jsonb_agg(jsonb_build_object('id', ph.id, 'w', ph.width, 'h', ph.height, 'f', ph.format) order by ph.position, ph.created_at)
            from public.event_photos ph
           where ph.album_id = p.id and not ph.hidden_screen
        ), '[]'::jsonb)
      ) order by p.event_date desc, p.created_at desc)
      from picked p
    ), '[]'::jsonb),
    'promos', coalesce((
      select jsonb_agg(sl.j order by sl.position, sl.created_at)
        from slide sl where sl.id in (select id from rotation)
    ), '[]'::jsonb),
    'live', coalesce((
      select jsonb_agg(sl.j || jsonb_build_object('live_until', lv.until) order by lv.until desc)
        from slide sl join live lv on lv.id = sl.id
    ), '[]'::jsonb),
    'now', floor(extract(epoch from now()) * 1000),
    'refresh_in', (select ceil(greatest(min(secs), 1)) from changes)
  ) end;
$$;
