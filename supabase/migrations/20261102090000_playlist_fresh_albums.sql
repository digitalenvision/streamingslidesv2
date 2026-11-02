-- Tells the players which albums were just published, so they play them first. Worked out
-- here rather than on the TV, whose clock may be off. Only the 'fresh' line is new.
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
