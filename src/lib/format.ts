import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** Today in Aruba as YYYY-MM-DD (club nights before 6 AM count as the night before). */
export const arubaToday = (nightShift = false) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Aruba' }).format(new Date(Date.now() - (nightShift ? 6 * 3_600_000 : 0)));

const dateOnly = (d: string) => new Date(`${d}T12:00:00`);
export const formatDate = (d: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) =>
  dateOnly(d).toLocaleDateString('en-US', opts);

/** The date written out, "Saturday October 17 2026". */
export const longDate = (d: string) => formatDate(d, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).replace(/,/g, '');
/** An album goes by its title, or by its date when it has none. */
export const albumName = (a: { title: string | null; event_date: string }) => a.title || longDate(a.event_date);

export const daysAgo = (d: string) => Math.round((dateOnly(arubaToday()).getTime() - dateOnly(d).getTime()) / 86_400_000);

export const relativeTime = (iso: string) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const slugify = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ'’]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const albumSlug = (title: string, date: string) => `${date}-${slugify(title) || 'night'}`.slice(0, 80).replace(/-$/, '');

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
