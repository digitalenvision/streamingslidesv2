// Which albums a screen plays right now. Mirrors public.screen_playlist() so the admin
// can show "On screens" without asking the database for every album.
import { arubaToday, daysAgo } from './format';
import type { Album, Screen } from '@/types';

export function albumsOnScreen(albums: Album[], screen: Pick<Screen, 'max_albums' | 'max_days'> | undefined): Set<string> {
  if (!screen) return new Set();
  const today = arubaToday();
  const picked = albums
    .filter((a) => a.status === 'published' && a.screen_mode !== 'hidden')
    .filter((a) => a.screen_mode === 'pinned' || (a.event_date <= today && daysAgo(a.event_date) <= screen.max_days) || a.event_date > today)
    .sort((a, b) => Number(b.screen_mode === 'pinned') - Number(a.screen_mode === 'pinned') || b.event_date.localeCompare(a.event_date) || b.created_at.localeCompare(a.created_at))
    .slice(0, screen.max_albums);
  return new Set(picked.map((a) => a.id));
}
