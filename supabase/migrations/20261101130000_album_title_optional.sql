-- An album without a title goes by its date ("Saturday October 17 2026"), so the title is
-- optional. A null passes the length check; an empty string still doesn't.
alter table public.event_albums alter column title drop not null;

-- Imported albums got their weekday as a placeholder name ("Friday Night"), not a real title.
alter table public.event_albums disable trigger event_albums_audit;
update public.event_albums set title = null where title ~* '^(mon|tues|wednes|thurs|fri|satur|sun)day night$';
alter table public.event_albums enable trigger event_albums_audit;
