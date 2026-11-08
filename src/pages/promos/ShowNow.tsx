// "Show now": put one slide on the screens straight away for a few minutes (closing time,
// a birthday shout-out), then the photos carry on where they left off.
import { useEffect, useRef, useState } from 'react';
import { Film, Radio, Square } from 'lucide-react';
import { Button, Dialog, Input } from '@/components/ui';
import { cn } from '@/lib/format';
import { publicUrl } from '@/lib/media';
import { endOfNight, isLive, liveUntil, takeoverEnd } from '@/lib/slides';
import { MessageSlide } from '@/player/MessageSlide';
import type { Promo, Screen } from '@/types';

const LENGTHS = [
  { label: '5 min', minutes: 5 },
  { label: '10 min', minutes: 10 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
] as const;

/** What's picked: a number of minutes, the rest of the night, or a length typed in. */
type Length = number | 'night' | 'custom';
const MAX_SECONDS = 12 * 3600;

/** Ticks once a second while something is counting down. */
export function useNow(active = true, every = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [active, every]);
  return now;
}

export const timeLeft = (until: string | number, now: number) => {
  const s = Math.max(0, Math.round((new Date(until).getTime() - now) / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${String(Math.floor(s / 60) % 60).padStart(2, '0')} min`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const screensLabel = (p: Pick<Promo, 'screen_ids'>, screens: Screen[]) =>
  !p.screen_ids?.length || screens.length < 2 ? 'every screen'
    : p.screen_ids.map((id) => screens.find((s) => s.id === id)?.name).filter(Boolean).join(', ');

/** The slide as a small picture: the flyer, the video, or the design itself. */
export function SlideThumb({ promo, photos, className, still = true, until = null }: {
  promo: Pick<Promo, 'kind' | 'path' | 'design'>; photos?: string[]; className?: string; still?: boolean;
  /** End of a takeover, for the countdown; without one it shows as it does between the photos. */
  until?: number | null;
}) {
  return (
    <div className={cn('relative aspect-video overflow-hidden bg-black', className)}>
      {promo.kind === 'message' && promo.design ? (
        <MessageSlide design={promo.design} photos={photos} still={still} liveUntil={until} />
      ) : promo.kind === 'video' && promo.path ? (
        <video src={publicUrl(promo.path)} muted playsInline loop preload="metadata" className="size-full object-contain" onMouseEnter={(e) => e.currentTarget.play()} onMouseLeave={(e) => e.currentTarget.pause()} />
      ) : promo.path ? (
        <img src={publicUrl(promo.path)} alt="" loading="lazy" className="size-full object-contain" />
      ) : null}
    </div>
  );
}

export function ShowNowDialog({ promo, screens, photos, onClose, onSave }: {
  promo: Promo | null; screens: Screen[]; photos: string[]; onClose: () => void; onSave: (p: Promo, liveUntil: string | null) => Promise<void>;
}) {
  const [length, setLength] = useState<Length>(10);
  const [mins, setMins] = useState('2');
  const [secs, setSecs] = useState('30');
  const [busy, setBusy] = useState(false);
  const live = !!promo && isLive(promo);
  const now = useNow(live);
  useEffect(() => { if (promo) setLength(10); }, [promo]);
  if (!promo) return null;

  const typed = (Number(mins) || 0) * 60 + (Number(secs) || 0);
  const typedProblem = length !== 'custom' ? null
    : typed < 5 ? 'At least 5 seconds.'
    : typed > MAX_SECONDS ? 'At most 12 hours. For longer, pick Rest of the night.'
    : null;
  /** How long it stays up, in ms; null = rest of the night. */
  const lengthMs = length === 'night' ? null : length === 'custom' ? Math.min(Math.max(typed, 5), MAX_SECONDS) * 1000 : length * 60_000;

  const go = async (until: string | null) => {
    setBusy(true);
    try {
      await onSave(promo, until);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  const untilFor = (ms: number | null, from = Date.now()) => new Date(ms == null ? endOfNight() : from + ms).toISOString();

  return (
    <Dialog open onClose={onClose} title={live ? 'On the screens now' : 'Show now'}>
      <div className="grid gap-5">
        <div className="overflow-hidden rounded-xl border border-line">
          <SlideThumb promo={promo} photos={photos} still={false} until={live ? liveUntil(promo, now) : lengthMs == null ? endOfNight() : Date.now() + lengthMs} />
        </div>
        {live ? (
          <>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/[0.08] px-4 py-3">
              <span className="flex items-center gap-2.5 font-semibold text-gold"><span className="size-2 animate-pulse rounded-full bg-gold" />Live on {screensLabel(promo, screens)}</span>
              <span className="num text-[17px] text-white">{timeLeft(promo.live_until!, now)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={busy} onClick={() => go(new Date(new Date(promo.live_until!).getTime() + 5 * 60_000).toISOString())}>+5 min</Button>
              <Button disabled={busy} onClick={() => go(untilFor(null))}>Rest of the night</Button>
            </div>
            <Button variant="danger" size="lg" loading={busy} icon={<Square className="size-4" />} onClick={() => go(null)}>Stop now</Button>
          </>
        ) : (
          <>
            <p className="text-white/80">
              Takes over {screensLabel(promo, screens)} within a few seconds. When the time is up, the photos carry on where they left off.
              {promo.kind === 'message' && promo.design?.countdown && ' The countdown runs to the end of this time.'}
              {promo.kind === 'video' && <span className="ml-1 inline-flex items-center gap-1 text-mute"><Film className="size-3.5" />The video loops.</span>}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[...LENGTHS.map((l) => ({ label: l.label, value: l.minutes as Length })), { label: 'Custom', value: 'custom' as Length }, { label: 'Rest of the night', value: 'night' as Length }].map((l) => (
                <button
                  key={l.label}
                  type="button"
                  aria-pressed={length === l.value}
                  onClick={() => setLength(l.value)}
                  className={cn(
                    'h-12 rounded-xl border px-2 text-[13.5px] font-semibold transition-colors',
                    l.value === 'night' && 'col-span-3 h-11',
                    length === l.value ? 'border-gold bg-gold text-purple-deep' : 'border-line bg-ink-900 text-white/80 hover:border-white/20',
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
            {length === 'custom' && (
              <div className="grid gap-2 rounded-xl border border-line bg-white/[0.02] p-3.5">
                <div className="flex items-center gap-2">
                  <span className="mr-1 text-[13px] font-medium text-white/85">For</span>
                  <TimePart label="Minutes" unit="min" value={mins} onChange={setMins} max={720} />
                  <TimePart label="Seconds" unit="sec" value={secs} onChange={setSecs} max={59} />
                </div>
                <p className={cn('text-[12.5px]', typedProblem ? 'text-bad' : 'text-mute')}>
                  {typedProblem ?? `Stays on the screens for ${spoken(typed)}.`}
                </p>
              </div>
            )}
            <Button variant="primary" size="lg" loading={busy} disabled={!!typedProblem} icon={<Radio className="size-4" />} onClick={() => go(untilFor(lengthMs))}>Show now</Button>
          </>
        )}
      </div>
    </Dialog>
  );
}

function TimePart({ label, unit, value, max, onChange }: { label: string; unit: string; value: string; max: number; onChange: (v: string) => void }) {
  // Clicking in selects the whole number, so typing replaces it. The browser would undo
  // a select() made on focus when the mouse comes up, so that first mouseup is skipped.
  const fresh = useRef(false);
  return (
    <div className="relative">
      <Input
        aria-label={label}
        type="text" inputMode="numeric" autoComplete="off" maxLength={String(max).length}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        onFocus={(e) => { fresh.current = true; e.currentTarget.select(); }}
        onMouseUp={(e) => { if (fresh.current) e.preventDefault(); fresh.current = false; }}
        onBlur={() => { fresh.current = false; }}
        className="h-11 w-[92px] pr-11 text-center text-[16px]"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-mute">{unit}</span>
    </div>
  );
}

/** 150 → "2 minutes 30 seconds". */
const spoken = (total: number) => {
  const h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
  const part = (n: number, w: string) => (n ? `${n} ${w}${n === 1 ? '' : 's'}` : '');
  return [part(h, 'hour'), part(m, 'minute'), part(s, 'second')].filter(Boolean).join(' ') || '0 seconds';
};

/** The slides taking over the screens right now, with time left and a stop button. */
export function LiveBar({ promos, onOpen, onStop }: { promos: Promo[]; onOpen: (p: Promo) => void; onStop: (p: Promo) => void }) {
  const now = useNow();
  const live = promos.filter((p) => liveUntil(p, now));
  if (!live.length) return null;
  return (
    <section className="mb-8 grid gap-2 rounded-2xl border border-gold/35 bg-[radial-gradient(120%_140%_at_0%_0%,rgb(228_177_26/.16),transparent_60%)] p-3 sm:p-4">
      <h2 className="kicker flex items-center gap-2 !text-gold"><span className="size-1.5 animate-pulse rounded-full bg-gold" />On the screens now</h2>
      {live.map((p) => (
        <div key={p.id} className="flex items-center gap-3">
          <button type="button" onClick={() => onOpen(p)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left">
            <SlideThumb promo={p} className="w-28 shrink-0 rounded-lg sm:w-36" still={false} until={liveUntil(p, now)} />
            <span className="grid min-w-0">
              <span className="truncate font-semibold">{p.title}</span>
              <span className="num text-[13px] text-gold">{timeLeft(liveUntil(p, now)!, now)} left{!isLive(p, now) && takeoverEnd(p, now) ? ' · set time' : ''}</span>
            </span>
          </button>
          <Button variant="danger" size="sm" icon={<Square className="size-3.5" />} onClick={() => onStop(p)}>Stop</Button>
        </div>
      ))}
    </section>
  );
}
