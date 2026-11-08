// When, how often and how long a slide plays. Shared by uploaded flyers and designed slides.
//   Nights      which nights and dates (both ways of playing follow them)
//   Between the photos   mixed in: hours, how often (photos or minutes), how long on screen
//   At set times         takes over the screens at given times, for N minutes
//   Show now             any time, from the slide's card
import { useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { Field, Input, Segmented, Switch, TimeSelect, timeLabel } from '@/components/ui';
import { cn } from '@/lib/format';
import { DAY_SHORT, WEEK, daysLabel, hoursLabel, nightAt, slideState } from '@/lib/slides';
import type { Promo, Screen } from '@/types';

export type Schedule = Pick<Promo,
  'active' | 'starts_on' | 'ends_on' | 'days' | 'show_from' | 'show_until' | 'every_n' | 'every_minutes'
  | 'duration_seconds' | 'takeover_at' | 'takeover_minutes' | 'screen_ids'>;

export const scheduleOf = (p: Partial<Promo> | null | undefined, defaults: Partial<Schedule> = {}): Schedule => ({
  active: p?.active ?? defaults.active ?? true,
  starts_on: p?.starts_on ?? defaults.starts_on ?? null,
  ends_on: p?.ends_on ?? defaults.ends_on ?? null,
  days: p?.days ?? defaults.days ?? null,
  show_from: p?.show_from ?? defaults.show_from ?? null,
  show_until: p?.show_until ?? defaults.show_until ?? null,
  every_n: p?.every_n ?? defaults.every_n ?? 8,
  every_minutes: p?.every_minutes ?? defaults.every_minutes ?? null,
  duration_seconds: p?.duration_seconds ?? defaults.duration_seconds ?? 10,
  takeover_at: p?.takeover_at ?? defaults.takeover_at ?? null,
  takeover_minutes: p?.takeover_minutes ?? defaults.takeover_minutes ?? 10,
  screen_ids: p?.screen_ids ?? defaults.screen_ids ?? null,
});

const seconds = (t: string) => `${t.slice(0, 5)}:00`;
/** What goes to the database: times as HH:MM:SS, empty lists as null. */
export const scheduleRow = (s: Schedule) => ({
  ...s,
  show_from: s.show_from ? seconds(s.show_from) : null,
  show_until: s.show_until ? seconds(s.show_until) : null,
  takeover_at: s.takeover_at?.length ? [...new Set(s.takeover_at.map(seconds))].sort() : null,
  screen_ids: s.screen_ids?.length ? s.screen_ids : null,
});

export const scheduleProblem = (s: Schedule) =>
  s.days && !s.days.length ? 'Pick at least one night'
    : s.show_from && s.show_from.slice(0, 5) === s.show_until?.slice(0, 5) ? 'The hours start and end at the same time'
    : s.starts_on && s.ends_on && s.ends_on < s.starts_on ? 'The last night is before the first night'
    : s.takeover_at && !s.takeover_at.length ? 'Add a time, or switch off “At set times”'
    : !(s.every_minutes ?? s.every_n) || (s.every_minutes ?? 1) > 120 || s.every_n > 100 ? 'Check how often it shows'
    : s.duration_seconds < 3 || s.duration_seconds > 120 ? 'On screen for 3 to 120 seconds'
    : s.takeover_minutes < 1 || s.takeover_minutes > 240 ? 'Take over for 1 to 240 minutes'
    : null;

// Club-day order: 6:00 PM first, round to 5:30 PM (half hours), or 5-minute steps for set times.
const steps = (every: number) => Array.from({ length: 1440 / every }, (_, i) => {
  const mins = (18 * 60 + i * every) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
});
const HALF_HOURS = steps(30);
const FIVE_MINUTES = steps(5);
const byNight = (t: string) => (Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) + 1080) % 1440;

export function ScheduleFields({ value, onChange, screens, video }: {
  value: Schedule; onChange: (s: Schedule) => void; screens: Screen[]; video?: boolean;
}) {
  const set = (patch: Partial<Schedule>) => onChange({ ...value, ...patch });
  const tonight = nightAt().date;
  const toggleDay = (d: number) => {
    const days = value.days ?? [];
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    set({ days: next.length === 7 ? null : next });
  };
  const hours = !!value.show_from;
  const timed = value.takeover_at !== null;
  const [adding, setAdding] = useState('02:50');
  const pace = Number(screens[0]?.photo_seconds ?? 8);

  const { state, next } = slideState({ ...scheduleRow(value), live_until: null } as Promo);
  const summary = state === 'on' ? 'On the screens now, between the photos.'
    : state === 'live' ? 'Taking over the screens right now.'
    : state === 'later' ? `Next on the screens: ${next}.`
    : state === 'manual' ? 'Only comes on when you tap Show now.'
    : 'These dates are over: it won’t come on.';

  return (
    <div className="grid gap-4">
      <Block title="Nights" hint="A night runs until 6 AM: 1 AM Saturday still counts as Friday night.">
        <div className="flex flex-wrap gap-1.5">
          <Chip on={!value.days} onClick={() => set({ days: null })}>Every night</Chip>
          {WEEK.map((d) => <Chip key={d} on={!!value.days?.includes(d)} onClick={() => toggleDay(d)}>{DAY_SHORT[d]}</Chip>)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First night">{(id) => <Input id={id} type="date" value={value.starts_on ?? ''} onChange={(e) => set({ starts_on: e.target.value || null })} />}</Field>
          <Field label="Last night">{(id) => <Input id={id} type="date" min={value.starts_on || undefined} value={value.ends_on ?? ''} onChange={(e) => set({ ends_on: e.target.value || null })} />}</Field>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-mute">
          <span>{value.days?.length ? `${daysLabel(value.days)}. ` : ''}No dates: from now on, until you switch it off.</span>
          <button type="button" className="font-semibold text-gold hover:text-gold-soft" onClick={() => set({ starts_on: tonight, ends_on: tonight })}>Tonight only</button>
          {(value.starts_on || value.ends_on) && <button type="button" className="font-semibold text-white/70 hover:text-white" onClick={() => set({ starts_on: null, ends_on: null })}>Clear dates</button>}
        </div>
      </Block>

      <Block
        title="Between the photos"
        toggle={{ on: value.active, set: (active) => set({ active }) }}
        hint={value.active ? undefined : 'Not mixed in with the photos.'}
      >
        {value.active && (
          <>
            <Row label="When">
              <Segmented
                size="sm"
                value={hours ? 'set' : 'all'}
                onChange={(v) => set(v === 'all' ? { show_from: null, show_until: null } : { show_from: '22:00', show_until: '02:00' })}
                options={[{ value: 'all', label: 'All night' }, { value: 'set', label: 'Between' }]}
              />
              {hours && (
                <div className="flex flex-wrap items-center gap-2">
                  <TimeSelect aria-label="From" value={value.show_from} onChange={(v) => set({ show_from: v ?? '22:00' })} steps={HALF_HOURS} className="h-9" />
                  <span className="text-mute">and</span>
                  <TimeSelect aria-label="Until" value={value.show_until} onChange={(v) => set({ show_until: v ?? '02:00' })} steps={HALF_HOURS} className="h-9" />
                </div>
              )}
            </Row>
            <Row label="How often">
              <Segmented
                size="sm"
                value={value.every_minutes ? 'minutes' : 'photos'}
                onChange={(v) => set({ every_minutes: v === 'minutes' ? Math.max(1, Math.round((value.every_n * pace) / 60)) : null })}
                options={[{ value: 'photos', label: 'By photos' }, { value: 'minutes', label: 'By minutes' }]}
              />
              <div className="flex items-center gap-2">
                <span className="text-white/75">{value.every_minutes ? 'Every' : 'After every'}</span>
                <Input
                  aria-label={value.every_minutes ? 'Minutes' : 'Photos'}
                  type="number" min={1} max={value.every_minutes ? 120 : 100}
                  value={value.every_minutes ?? value.every_n}
                  onChange={(e) => set(value.every_minutes ? { every_minutes: Number(e.target.value) } : { every_n: Number(e.target.value) })}
                  className="h-9 w-20 text-center"
                />
                <span className="text-white/75">{value.every_minutes ? 'minutes' : 'photos'}</span>
              </div>
              <p className="text-[12px] text-mute">
                {value.every_minutes
                  ? 'Comes round on time, whatever else is playing.'
                  : `At ${pace} s a photo, that’s about every ${Math.max(1, Math.round((value.every_n * pace) / 60))} min.`}
                {' '}Several slides due at once take turns.
              </p>
            </Row>
            {!video && (
              <Row label="How long">
                <Presets
                  value={value.duration_seconds}
                  options={[5, 8, 10, 15, 20, 30]}
                  unit="s"
                  max={120}
                  min={3}
                  onChange={(duration_seconds) => set({ duration_seconds })}
                />
              </Row>
            )}
            {video && <p className="text-[12.5px] text-mute">Videos play to the end.</p>}
          </>
        )}
      </Block>

      <Block
        title="At set times"
        toggle={{ on: timed, set: (on) => set({ takeover_at: on ? [] : null }) }}
        hint={timed ? 'Takes over the screens at these times on its nights, then the photos carry on. An alert slide with a countdown counts down to the end.' : 'For example closing time: 2:50 AM for 10 minutes, every Friday and Saturday.'}
      >
        {timed && (
          <>
            <Row label="At">
              <div className="flex flex-wrap items-center gap-1.5">
                {[...value.takeover_at!].sort((a, b) => byNight(a) - byNight(b)).map((t) => (
                  <span key={t} className="inline-flex h-9 items-center gap-1 rounded-full border border-gold/50 bg-gold/10 pl-3.5 pr-1.5 text-[13px] font-semibold text-gold">
                    {timeLabel(t)}
                    <button type="button" aria-label={`Remove ${timeLabel(t)}`} className="grid size-6 place-items-center rounded-full hover:bg-gold/20" onClick={() => set({ takeover_at: value.takeover_at!.filter((x) => x !== t) })}><X className="size-3.5" /></button>
                  </span>
                ))}
                <div className="flex items-center gap-1.5">
                  <TimeSelect aria-label="Time to add" value={adding} onChange={(v) => setAdding(v ?? '02:50')} steps={FIVE_MINUTES} className="h-9" />
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-ink-850 px-3 text-[13px] font-semibold text-white/80 hover:border-white/20 hover:text-white"
                    onClick={() => !value.takeover_at!.some((x) => x.slice(0, 5) === adding) && set({ takeover_at: [...value.takeover_at!, adding] })}
                  >
                    <Plus className="size-3.5" />Add
                  </button>
                </div>
              </div>
            </Row>
            <Row label="For">
              <Presets value={value.takeover_minutes} options={[1, 5, 10, 15, 30]} unit="min" max={240} min={1} onChange={(takeover_minutes) => set({ takeover_minutes })} />
            </Row>
          </>
        )}
      </Block>

      {screens.length > 1 && (
        <Block title="Screens">
          <Switch label="All screens" checked={!value.screen_ids} onChange={(v) => set({ screen_ids: v ? null : [] })} />
          {value.screen_ids && screens.map((s) => (
            <label key={s.id} className="flex items-center gap-3 rounded-lg px-1 py-1">
              <input type="checkbox" className="size-4 accent-[#e4b11a]" checked={value.screen_ids!.includes(s.id)} onChange={(e) => set({ screen_ids: e.target.checked ? [...value.screen_ids!, s.id] : value.screen_ids!.filter((x) => x !== s.id) })} />
              {s.name}
            </label>
          ))}
        </Block>
      )}

      <p className={cn('rounded-xl border px-3.5 py-2.5 text-[13px]', state === 'on' || state === 'live' ? 'border-ok/25 bg-ok/[0.07] text-ok' : 'border-line bg-white/[0.03] text-white/75')}>
        {summary} {state !== 'off' && state !== 'manual' && 'You can also put it on any time with Show now.'}
        {value.active && hours && state !== 'off' ? ` Between the photos ${hoursLabel(value)}.` : ''}
      </p>
    </div>
  );
}

function Block({ title, hint, toggle, children }: { title: string; hint?: string; toggle?: { on: boolean; set: (v: boolean) => void }; children?: ReactNode }) {
  return (
    <fieldset className={cn('grid gap-3.5 rounded-2xl border p-4 transition-colors', !toggle || toggle.on ? 'border-line bg-white/[0.02]' : 'border-dashed border-line')}>
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-0.5">
          <legend className="contents"><span className="font-semibold">{title}</span></legend>
          {hint && <span className="text-[12.5px] text-mute">{hint}</span>}
        </div>
        {toggle && (
          <button
            type="button"
            role="switch"
            aria-checked={toggle.on}
            aria-label={title}
            onClick={() => toggle.set(!toggle.on)}
            className={cn('relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors', toggle.on ? 'bg-gold' : 'bg-white/15')}
          >
            <span className={cn('absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform', toggle.on ? 'translate-x-[18px]' : 'translate-x-0.5')} />
          </button>
        )}
      </div>
      {children}
    </fieldset>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 border-t border-line pt-3.5 sm:grid-cols-[88px_minmax(0,1fr)] sm:gap-4">
      <span className="pt-1.5 text-[13px] font-medium text-white/85">{label}</span>
      <div className="grid justify-items-start gap-2">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'h-9 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
        on ? 'border-gold bg-gold text-purple-deep' : 'border-line bg-ink-850 text-white/70 hover:border-white/20 hover:text-white',
      )}
    >
      {children}
    </button>
  );
}

/** Quick picks plus a box for any other number. */
function Presets({ value, options, unit, min, max, onChange }: { value: number; options: number[]; unit: string; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => <Chip key={o} on={value === o} onClick={() => onChange(o)}>{`${o} ${unit}`}</Chip>)}
      <div className="relative">
        <Input
          aria-label={`Other (${unit})`}
          type="number" min={min} max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn('h-9 w-24 pr-10 text-center', !options.includes(value) && 'border-gold/70')}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-mute">{unit}</span>
      </div>
    </div>
  );
}
