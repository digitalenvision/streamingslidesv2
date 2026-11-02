-- How a screen looks: a background image behind the photos, spacing around them and the
-- length of the fade. The defaults keep a screen as it was (full-bleed, no background).
alter table public.screens
  add column background_path text,
  add column margin_percent numeric(3, 1) not null default 0 check (margin_percent between 0 and 20),
  add column transition_seconds numeric(3, 1) not null default 0.8 check (transition_seconds between 0.2 and 3);
