// When a slide plays, in words, and the ready-made designs. The rules mirror
// public.screen_playlist() (supabase/migrations/20261108120000_slide_schedule_messages.sql):
// a club night runs 6 AM to 6 AM, so 1:30 AM on Saturday is still Friday night.
import { timeLabel } from '@/components/ui';
import { formatDate } from './format';
import type { Promo, SlideDesign } from '@/types';

// Aruba keeps UTC-4 all year (no daylight saving).
const ARUBA = -4 * 3_600_000;
const NIGHT_STARTS = 6 * 3_600_000;

/** The club night it is at `ms`: its date, weekday (0 = Sunday) and the wall-clock time. */
export function nightAt(ms = Date.now()) {
  const local = new Date(ms + ARUBA);
  const night = new Date(ms + ARUBA - NIGHT_STARTS);
  return { date: night.toISOString().slice(0, 10), dow: night.getUTCDay(), time: local.toISOString().slice(11, 16) };
}

/** The next 6 AM in Aruba: the end of tonight. */
export function endOfNight(ms = Date.now()) {
  const night = new Date(ms + ARUBA - NIGHT_STARTS);
  night.setUTCHours(0, 0, 0, 0);
  return night.getTime() + 86_400_000 + NIGHT_STARTS - ARUBA;
}

/** Monday first, the way the club plans its week. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
/** Minutes into the night (6 AM = 0), to compare times across midnight. */
const nightMinutes = (t: string) => ((Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) - 360) % 1440 + 1440) % 1440;
const inHours = (p: Pick<Promo, 'show_from' | 'show_until'>, time: string) => {
  const from = hhmm(p.show_from), until = hhmm(p.show_until);
  if (!from || !until) return true;
  return from < until ? time >= from && time < until : time >= from || time < until;
};
const onNight = (p: Pick<Promo, 'starts_on' | 'ends_on' | 'days'>, date: string, dow: number) =>
  (!p.starts_on || p.starts_on <= date) && (!p.ends_on || p.ends_on >= date) && (!p.days || p.days.includes(dow));

export const isLive = (p: Pick<Promo, 'live_until'>, ms = Date.now()) => !!p.live_until && new Date(p.live_until).getTime() > ms;

/** When a takeover at set times running right now ends (ms), or null. */
export function takeoverEnd(p: Pick<Promo, 'takeover_at' | 'takeover_minutes' | 'starts_on' | 'ends_on' | 'days' | 'skip_until'>, ms = Date.now()) {
  if (!p.takeover_at?.length) return null;
  const now = nightAt(ms);
  if (!onNight(p, now.date, now.dow)) return null;
  const nightStart = Date.parse(`${now.date}T00:00:00Z`) + NIGHT_STARTS - ARUBA;
  for (const t of p.takeover_at) {
    const start = nightStart + nightMinutes(t) * 60_000;
    const end = start + p.takeover_minutes * 60_000;
    if (ms >= start && ms < end && !(p.skip_until && Date.parse(p.skip_until) >= end)) return end;
  }
  return null;
}

/** When a slide takes over the screen right now (Show now or a set time) until, or null. */
export function liveUntil(p: Promo, ms = Date.now()) {
  const manual = isLive(p, ms) ? new Date(p.live_until!).getTime() : null;
  const timed = takeoverEnd(p, ms);
  return manual || timed ? Math.max(manual ?? 0, timed ?? 0) : null;
}

/** live: taking over now · on: in the rotation now · later: waiting for its night or hour ·
 *  manual: only comes on with Show now · off: switched off or its dates are over. */
export type SlideState = 'live' | 'on' | 'later' | 'manual' | 'off';

/** Where a slide stands right now, and when it next comes on if it's waiting. */
export function slideState(p: Promo, ms = Date.now()): { state: SlideState; next?: string; until?: number } {
  const until = liveUntil(p, ms);
  if (until) return { state: 'live', until };
  const now = nightAt(ms);
  const timed = !!p.takeover_at?.length;
  if (!p.active && !timed) return { state: 'manual' };
  if (p.ends_on && p.ends_on < now.date) return { state: 'off' };
  if (p.active && onNight(p, now.date, now.dow) && inHours(p, now.time)) return { state: 'on' };
  // The first moment it comes on in a night: its hours, or its earliest takeover.
  const starts = [
    ...(p.active ? [hhmm(p.show_from) ?? '06:00'] : []),
    ...(p.takeover_at ?? []).map(hhmm) as string[],
  ].sort((x, y) => nightMinutes(x) - nightMinutes(y));
  const label = (t: string) => (t === '06:00' && p.active && !p.show_from ? '' : ` ${timeLabel(t)}`);
  const tonight = onNight(p, now.date, now.dow) ? starts.find((t) => nightMinutes(t) > nightMinutes(now.time)) : undefined;
  if (tonight) return { state: 'later', next: `Tonight${label(tonight)}` };
  const start = p.starts_on && p.starts_on > now.date ? p.starts_on : now.date;
  for (let i = start === now.date ? 1 : 0; i < 400; i++) {
    const day = new Date(`${start}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() + i);
    const date = day.toISOString().slice(0, 10);
    if (p.ends_on && date > p.ends_on) break;
    if (!onNight(p, date, day.getUTCDay())) continue;
    const ahead = (day.getTime() - new Date(`${now.date}T12:00:00Z`).getTime()) / 86_400_000;
    const when = ahead === 1 ? 'Tomorrow' : ahead < 7 ? DAY_LONG[day.getUTCDay()] : formatDate(date, { month: 'short', day: 'numeric' });
    return { state: 'later', next: `${when}${label(starts[0])}` };
  }
  return { state: 'off' };
}

/** "after every 8 photos", "about every 5 minutes". */
export const oftenLabel = (p: Pick<Promo, 'every_n' | 'every_minutes'>) =>
  p.every_minutes ? `every ${p.every_minutes} min` : `after every ${p.every_n} photos`;
export const takeoverLabel = (p: Pick<Promo, 'takeover_at' | 'takeover_minutes'>) =>
  p.takeover_at?.length ? `${p.takeover_at.map((t) => timeLabel(t)).join(', ')} for ${p.takeover_minutes} min` : null;

/** "Fri & Sat", "Mon, Wed & Fri", "Every night". */
export function daysLabel(days: number[] | null) {
  if (!days || days.length === 7) return 'Every night';
  const names = WEEK.filter((d) => days.includes(d)).map((d) => DAY_SHORT[d]);
  return names.length === 1 ? `${DAY_LONG[days[0]]}s` : `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`;
}
export const hoursLabel = (p: Pick<Promo, 'show_from' | 'show_until'>) =>
  p.show_from && p.show_until ? `${timeLabel(p.show_from)} – ${timeLabel(p.show_until)}` : 'All night';

// --- designed slides ------------------------------------------------------------------

export const BLANK_DESIGN: SlideDesign = {
  layout: 'headline',
  kicker: '',
  headline: '',
  body: '',
  footer: '',
  accent: 'gold',
  background: { type: 'preset', id: 'velvet' },
  image: null,
  qr: null,
  countdown: false,
};

export const GALLERY_URL = 'https://gustoaruba.com/gallery';

/** Ready-made starting points. Each one fills the editor; everything stays editable. */
export const STARTERS: {
  id: string; label: string; title: string; seconds?: number; design: SlideDesign;
  /** How it plays by default: some nights only, tonight only, or only through "Show now". */
  schedule?: { days?: number[]; tonightOnly?: boolean; active?: boolean };
}[] = [
  {
    id: 'photos',
    label: 'Tonight’s photos',
    title: 'Tonight’s photos on the website',
    design: {
      ...BLANK_DESIGN,
      kicker: 'Find yourself',
      headline: 'Check out tonight’s photos',
      body: 'Every photo from the night, free to download.',
      footer: 'gustoaruba.com',
      background: { type: 'photos' },
      qr: { url: GALLERY_URL, label: 'Scan for photos' },
    },
    schedule: { days: [5, 6] },
  },
  {
    id: 'birthday',
    label: 'Happy birthday',
    title: 'Birthday',
    design: {
      ...BLANK_DESIGN,
      layout: 'celebrate',
      kicker: 'Happy birthday',
      headline: 'John',
      body: 'From all of us at Gusto',
      background: { type: 'preset', id: 'confetti' },
    },
    schedule: { tonightOnly: true },
  },
  {
    id: 'product',
    label: 'Product',
    title: 'Drink special',
    design: {
      ...BLANK_DESIGN,
      layout: 'spotlight',
      kicker: 'Tonight only',
      headline: 'Gusto Margarita',
      body: 'Ask your bartender',
      footer: '2 for 1',
      background: { type: 'preset', id: 'gold' },
    },
  },
  {
    id: 'closing',
    label: 'Closing soon',
    title: 'Closing soon',
    seconds: 15,
    design: {
      ...BLANK_DESIGN,
      layout: 'alert',
      kicker: 'Last call',
      headline: 'Closing soon',
      body: 'Thank you for partying with us tonight',
      footer: 'See you next time',
      background: { type: 'preset', id: 'spotlight' },
      countdown: true,
    },
    schedule: { active: false },
  },
  {
    id: 'blank',
    label: 'Blank',
    title: '',
    design: BLANK_DESIGN,
  },
];
