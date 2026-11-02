// Special events: the few nights the website features on the homepage and the VIP tables
// page, and the nights without happy hour. The nights themselves live in Fourvenues; only
// these two choices are kept here, per night. Past nights drop off by themselves.
import { useMemo, useState, type ReactNode } from 'react';
import { CalendarX2, RotateCw, Search, Star, X } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Badge, Button, Empty, IconButton, Input, Spinner, Switch, useToast } from '@/components/ui';
import { listEventSettings, listUpcomingEvents, refreshWebsiteNights, saveEventSetting } from '@/lib/data';
import { cn } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import type { EventSetting, UpcomingEvent } from '@/types';

const MAX_HIGHLIGHTED = 3;
const FIRST_NIGHTS = 10;
const REGULAR = { highlighted: false, no_happy_hour: false };

const aruba = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Aruba', ...opts });
const nightDate = (e: UpcomingEvent) => `${aruba(e.start, { weekday: 'short', month: 'short', day: 'numeric' })} · ${aruba(e.start, { hour: 'numeric', minute: '2-digit' }).replace(':00', '')}`;

const Flyer = ({ event, className }: { event: UpcomingEvent; className?: string }) => (
  <div className={cn('aspect-[1/1.05] shrink-0 overflow-hidden rounded-xl bg-ink-800', className)}>
    {event.image && <img src={event.image} alt="" loading="lazy" decoding="async" className="size-full object-cover" />}
  </div>
);

export function SpecialEvents() {
  const toast = useToast();
  const { data, error, loading, reload, set } = useLoad(async () => {
    const [events, settings] = await Promise.all([listUpcomingEvents(), listEventSettings()]);
    return { events, settings: new Map(settings.map((s) => [s.code, s])) };
  });
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(false);

  const settingOf = (e: UpcomingEvent) => data?.settings.get(e.code) ?? REGULAR;
  const featured = useMemo(() => data?.events.filter((e) => data.settings.get(e.code)?.highlighted) ?? [], [data]);
  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data?.events.filter((e) => !q || e.name.toLowerCase().includes(q) || nightDate(e).toLowerCase().includes(q)) ?? [];
  }, [data, query]);
  const shown = all || query.trim() ? matching : matching.slice(0, FIRST_NIGHTS);
  const full = featured.length >= MAX_HIGHLIGHTED;

  // Shown at once; put back if the save fails.
  const change = async (event: UpcomingEvent, patch: Partial<EventSetting>) => {
    const before = data!.settings;
    const next = { ...REGULAR, ...before.get(event.code), ...patch, code: event.code };
    set({ ...data!, settings: new Map(before).set(event.code, next) });
    try {
      await saveEventSetting(event, next);
    } catch (err) {
      set((d) => d && { ...d, settings: before });
      toast(err instanceof Error ? err.message : 'Could not save that', 'bad');
      return;
    }
    await refreshWebsiteNights().catch(() => toast('Saved, but the website may take up to 5 minutes to show it', 'bad'));
  };

  return (
    <>
      <PageHeader
        title="Special events"
        subtitle="Feature up to 3 nights on the homepage and the VIP tables page, so people can book them right away. Changes show on the website immediately."
      />

      {!data ? (
        loading ? <div className="grid place-items-center py-20"><Spinner /></div> : (
          <Empty
            icon={<CalendarX2 />}
            title="Couldn’t get the nights"
            body={error ?? 'The website didn’t answer.'}
            action={<Button variant="secondary" icon={<RotateCw className="size-4" />} onClick={reload}>Try again</Button>}
          />
        )
      ) : !data.events.length ? (
        <Empty icon={<CalendarX2 />} title="No nights coming up" body="Nights show here once they’re in Fourvenues." />
      ) : (
        <div className="grid gap-8">
          <section aria-labelledby="featured-title" className="grid gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="featured-title" className="label">Featured on the website</h2>
              <span className="text-[13px] tabular-nums text-mute">{featured.length} of {MAX_HIGHLIGHTED}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {featured.map((e) => (
                <article key={e.code} className="panel flex items-center gap-3 p-3">
                  <Flyer event={e} className="w-16" />
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                    <div className="grid min-w-0 gap-1">
                      <h3 className="font-sans text-[15px] font-semibold tracking-normal">{e.name}</h3>
                      <p className="text-[13px] text-mute">{nightDate(e)}</p>
                      {settingOf(e).no_happy_hour && <Badge className="w-fit">No happy hour</Badge>}
                    </div>
                    <IconButton label={`Stop featuring ${e.name}`} onClick={() => change(e, { highlighted: false })}><X className="size-4" /></IconButton>
                  </div>
                </article>
              ))}
              {Array.from({ length: MAX_HIGHLIGHTED - Math.min(featured.length, MAX_HIGHLIGHTED) }, (_, i) => (
                <FreeSpot key={i} hiddenOnPhone={i > 0 || featured.length > 0}>
                  {featured.length || i ? 'Free spot' : 'Nothing featured yet. Tap Feature on a night below.'}
                </FreeSpot>
              ))}
            </div>
          </section>

          <section aria-labelledby="nights-title" className="grid gap-3">
            <div className="grid gap-1">
              <h2 id="nights-title" className="label">Coming nights</h2>
              <p className="max-w-2xl text-[13px] text-mute">Turn happy hour off for a night without one. It then disappears from that night’s event page and the homepage card, and the site won’t say “Happy Hour now”.</p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute" />
              <Input aria-label="Find a night" placeholder="Find a night" className="pl-9" value={query} onChange={(ev) => setQuery(ev.target.value)} />
            </div>
            {matching.length === 0 ? (
              <p className="panel p-5 text-center text-mute">No night matches “{query.trim()}”.</p>
            ) : (
              <ul className="panel divide-y divide-line">
                {shown.map((e) => {
                  const s = settingOf(e);
                  return (
                    <li key={e.code} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-3">
                      <div className="flex min-w-0 flex-[1_1_220px] items-center gap-3">
                        <Flyer event={e} className="w-12 rounded-lg" />
                        <div className="grid min-w-0 gap-0.5">
                          <span className="font-medium">{e.name}</span>
                          <span className="text-[13px] text-mute">{nightDate(e)}</span>
                        </div>
                      </div>
                      <div className="flex flex-[1_0_auto] items-center justify-between gap-4 sm:flex-none sm:justify-end">
                        <Switch label="Happy hour" checked={!s.no_happy_hour} onChange={(on) => change(e, { no_happy_hour: !on })} />
                        <Button
                          size="sm"
                          variant={s.highlighted ? 'primary' : 'secondary'}
                          className="w-[108px]"
                          aria-pressed={s.highlighted}
                          disabled={!s.highlighted && full}
                          title={!s.highlighted && full ? `${MAX_HIGHLIGHTED} nights are featured. Remove one first.` : undefined}
                          icon={<Star className={cn('size-3.5', s.highlighted && 'fill-current')} />}
                          onClick={() => change(e, { highlighted: !s.highlighted })}
                        >
                          {s.highlighted ? 'Featured' : 'Feature'}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {shown.length < matching.length && (
              <Button variant="ghost" className="justify-self-center" onClick={() => setAll(true)}>Show all {matching.length} nights</Button>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function FreeSpot({ hiddenOnPhone, children }: { hiddenOnPhone: boolean; children: ReactNode }) {
  return (
    <div className={cn('grid min-h-[72px] place-items-center rounded-2xl border border-dashed border-line p-4 text-center text-[13px] text-mute', hiddenOnPhone && 'hidden md:grid')}>
      {children}
    </div>
  );
}
