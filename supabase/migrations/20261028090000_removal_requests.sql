-- Photo removal requests, done properly:
--   * only from someone who unlocked the gallery with their email (visitor_id), and with a reason
--   * one open request per person per photo; a photo with several requests is handled once
--   * approving deletes the photo (website, album and screens); deleting a photo any other
--     way closes its open requests too
--   * who handled it and when, plus an optional note when declining

alter table public.photo_removal_requests
  add column visitor_id uuid references public.gallery_visitors (id) on delete set null,
  add column reason_type text check (reason_type in ('me', 'friend', 'inappropriate', 'other')),
  add column handled_by uuid references auth.users (id) on delete set null,
  add column decision_note text check (length(decision_note) <= 500),
  add constraint photo_removal_requests_reason_len check (reason is null or length(reason) <= 1000);

-- One open request per person per photo (asking again is a no-op).
create unique index photo_removal_requests_one_open
  on public.photo_removal_requests (photo_id, visitor_id)
  where status = 'open' and photo_id is not null and visitor_id is not null;
create index photo_removal_requests_status_idx on public.photo_removal_requests (status, created_at desc);

-- Stamp who handled a request.
create or replace function public.removal_requests_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> old.status and new.status <> 'open' then
    new.handled_at = coalesce(new.handled_at, now());
    new.handled_by = coalesce(new.handled_by, auth.uid());
  end if;
  return new;
end;
$$;
create trigger removal_requests_stamp before update on public.photo_removal_requests
  for each row execute function public.removal_requests_stamp();

-- A photo that's deleted (approved request, deleted in the album, or its whole album
-- deleted) is gone everywhere, so its open requests are done.
create or replace function public.event_photos_close_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.photo_removal_requests
     set status = 'done', handled_at = now(), handled_by = auth.uid()
   where photo_id = old.id and status = 'open';
  return old;
end;
$$;
create trigger event_photos_close_requests before delete on public.event_photos
  for each row execute function public.event_photos_close_requests();

create trigger photo_removal_requests_audit after insert or update or delete on public.photo_removal_requests
  for each row execute function public.audit();
