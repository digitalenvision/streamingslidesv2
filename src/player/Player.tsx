// The TV player. Lives at /preview/:id so the address already set up on the club's
// computer keeps working: the id can be a screen id or the old slideshow id a screen
// has taken over. Anything else falls back to the legacy player.
//
// Why it's fast: it plays the 1920px versions (~250 KB instead of multi-MB camera
// files), starts as soon as the first photo is decoded, keeps the next few photos
// decoded in the background, and the service worker keeps played photos on the TV.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { screenChannel, type Command, type PlayerStatus } from '@/lib/remote';
import { publicUrl } from '@/lib/media';
import { Logo, Mark } from '@/components/ui';
import type { Playlist, Transition } from '@/types';
import { buildSequence, firstArrival, locate, promoSlide, wallPhotos, type Slide } from './sequence';
import { MessageSlide, designImages, loadSlideFonts } from './MessageSlide';

const LegacyPreview = lazy(() => import('@/legacy/SlideshowPreview').then((m) => ({ default: m.SlideshowPreview })));

const AHEAD = 4;
const READY_TIMEOUT = 10_000;
const REFRESH_DEBOUNCE = 2_000;
const REFRESH_MAX_WAIT = 10_000;
const POLL_MS = 5 * 60_000;
const STATUS_MS = 10_000;
const FADE_MS = 900;
const playerId = (() => {
  try {
    return (localStorage.gustoPlayerId ??= crypto.randomUUID().slice(0, 8));
  } catch {
    return crypto.randomUUID().slice(0, 8);
  }
})();

// --- image preloading -------------------------------------------------------------
const ready = new Map<string, Promise<boolean>>();
function decode(src: string): Promise<boolean> {
  let p = ready.get(src);
  if (!p) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    // A failed load may be temporary, so the next pass asks again.
    p = img.decode().then(() => true, () => { ready.delete(src); return false; });
    ready.set(src, p);
    if (ready.size > 40) ready.delete(ready.keys().next().value!);
  }
  return p;
}
function preload(slide: Slide): Promise<boolean> {
  if (slide.kind === 'promo' && slide.promoKind === 'video') return Promise.resolve(true);
  // A designed slide waits for its fonts and pictures; a picture that won't load doesn't hold it back.
  const p = slide.kind === 'message'
    ? Promise.all([loadSlideFonts().catch(() => {}), ...designImages(slide.design).map(decode)]).then(() => true)
    : decode(slide.src);
  return Promise.race([p, new Promise<boolean>((r) => setTimeout(() => r(slide.kind === 'message'), READY_TIMEOUT))]);
}

// The TV's clock can be off, so "Show now" endings are worked out from the server's clock.
let skew = 0;
const serverTime = (iso: string) => Date.parse(iso) - skew;
// What plays, without the parts that change on every call.
const contentOf = (p: Playlist) => JSON.stringify({ ...p, now: undefined, refresh_in: undefined });

// --- playlist ---------------------------------------------------------------------
async function fetchPlaylist(id: string): Promise<Playlist | null | 'offline'> {
  const { data, error } = await supabase.rpc('screen_playlist', { p_screen_id: id });
  if (error) {
    try {
      const cached = localStorage.getItem(`gusto-playlist:${id}`);
      return cached ? (JSON.parse(cached) as Playlist) : 'offline';
    } catch {
      return 'offline';
    }
  }
  if (data) try { localStorage.setItem(`gusto-playlist:${id}`, JSON.stringify(data)); } catch { /* storage full: fine */ }
  if (data?.now) skew = data.now - Date.now();
  return data as Playlist | null;
}

export function Player() {
  const { id } = useParams<{ id: string }>();
  const [playlist, setPlaylist] = useState<Playlist | null | undefined>(undefined);

  useEffect(() => {
    let stop = false;
    const load = async (attempt = 0) => {
      const result = await fetchPlaylist(id!);
      if (stop) return;
      if (result === 'offline') setTimeout(() => load(attempt + 1), Math.min(30_000, 2000 * 2 ** attempt));
      else setPlaylist(result);
    };
    load();
    return () => { stop = true; };
  }, [id]);

  if (playlist === undefined) return <Idle />;
  if (playlist === null) return <Suspense fallback={<Idle />}><LegacyPreview /></Suspense>;
  return <Show id={id!} initial={playlist} />;
}

function Show({ id, initial }: { id: string; initial: Playlist }) {
  const [playlist, setPlaylist] = useState(initial);
  const [slides, setSlides] = useState(() => buildSequence(initial));
  const [index, setIndex] = useState(0);
  const [layers, setLayers] = useState<{ slide: Slide; n: number }[]>([]);
  const [playing, setPlaying] = useState(true);
  const [black, setBlack] = useState(false);
  const [started, setStarted] = useState(false);
  const screen = playlist.screen;
  const transition: Transition = screen.transition;
  const transitionSeconds = Number(screen.transition_seconds);
  const margin = Number(screen.margin_percent);
  const background = screen.background_path ? publicUrl(screen.background_path) : null;
  const counter = useRef(0);
  const advancing = useRef(false);
  const state = useRef({ index, slides, playing, black, playlist });
  state.current = { index, slides, playing, black, playlist };

  // Show a slide once it's decoded (skipping ones that fail to load).
  // The slide on screen right now (state.current.slides is already the new list after a refresh).
  const shown = useRef<string | null>(null);
  const lastPhoto = useRef<string | null>(null);
  const playNext = useRef<string | null>(null);
  const goTo = useCallback(async (target: number, step = 1) => {
    const list = state.current.slides;
    if (!list.length || advancing.current) return;
    advancing.current = true;
    try {
      for (let tries = 0; tries < Math.min(list.length, 12); tries++) {
        const i = ((target + tries * step) % list.length + list.length) % list.length;
        if (await preload(list[i])) {
          setIndex(i);
          shown.current = list[i].key;
          if (list[i].kind === 'photo') lastPhoto.current = list[i].key;
          setLayers((prev) => [...prev.slice(-1), { slide: list[i], n: ++counter.current }]);
          setStarted(true);
          return;
        }
      }
    } finally {
      advancing.current = false;
    }
  }, []);

  const next = useCallback(() => goTo(state.current.index + 1), [goTo]);
  const previous = useCallback(() => goTo(state.current.index - 1, -1), [goTo]);

  // First slide, once the background is there to show it on.
  useEffect(() => {
    if (!background) { goTo(0); return; }
    const img = new Image();
    img.src = background;
    img.decode().catch(() => {}).finally(() => goTo(0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goTo]);

  // Keep the next few slides decoded.
  useEffect(() => {
    for (let k = 1; k <= AHEAD && k < slides.length; k++) preload(slides[(index + k) % slides.length]);
  }, [index, slides]);

  // Timer for the current slide (videos advance when they end).
  const top = layers.at(-1);
  // "Show now": slides that take over the screen. The slideshow holds still underneath and
  // carries on from the same photo when they end.
  const [tick, setTick] = useState(0);
  const live = useMemo(
    () => (playlist.live ?? [])
      .filter((p) => p.kind !== 'message' || p.design)
      .map((p) => ({ slide: promoSlide(p, `live:${p.id}`), until: serverTime(p.live_until) }))
      .filter((l) => l.until > Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playlist, tick],
  );
  const taken = live.length > 0;
  useEffect(() => {
    const current = top?.slide;
    if (!playing || taken || !current || slides.length < 2) return;
    if (current.kind === 'promo' && current.promoKind === 'video') return;
    const t = setTimeout(next, current.seconds * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top?.n, playing, taken, next, slides.length]);

  // Drop the layer underneath once the new one has finished coming in.
  useEffect(() => {
    if (layers.length < 2) return;
    const t = setTimeout(() => setLayers((prev) => prev.slice(-1)), Math.max(1400, transitionSeconds * 1000 + 200));
    return () => clearTimeout(t);
  }, [layers, transitionSeconds]);

  // Playlist changes: Realtime on the screen row, plus a slow poll as a safety net.
  // The clock alone also changes what plays (a slide's hours, a new night, "Show now" ending):
  // the server says when, and the player asks again right then.
  const clockTimer = useRef<ReturnType<typeof setTimeout>>();
  const refresh = useCallback(async (): Promise<void> => {
    const fresh = await fetchPlaylist(id);
    if (!fresh || fresh === 'offline') return;
    clearTimeout(clockTimer.current);
    if (fresh.refresh_in) clockTimer.current = setTimeout(() => refresh(), Math.min(fresh.refresh_in * 1000, POLL_MS * 12) + 1500);
    const { playlist: old, slides: list } = state.current;
    if (contentOf(old) === contentOf(fresh)) return;
    // Turning shuffle on or off starts a new order; anything else keeps the current one.
    const previous = old.screen.shuffle === fresh.screen.shuffle ? list : [];
    playNext.current = firstArrival(fresh, previous);
    setPlaylist(fresh);
    setSlides(buildSequence(fresh, previous, lastPhoto.current));
  }, [id]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Changes that keep coming (an upload in progress) still refresh every so often.
    let waitingSince: number | null = null;
    const run = () => { waitingSince = null; refresh(); };
    const soon = () => {
      clearTimeout(timer);
      waitingSince ??= Date.now();
      timer = setTimeout(run, Math.min(REFRESH_DEBOUNCE, waitingSince + REFRESH_MAX_WAIT - Date.now()));
    };
    const ch = supabase
      .channel(`screen-row:${screen.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'screens', filter: `id=eq.${screen.id}` }, soon)
      .subscribe((s) => { if (s === 'SUBSCRIBED') soon(); });
    const poll = setInterval(refresh, POLL_MS);
    return () => { clearTimeout(timer); clearTimeout(clockTimer.current); clearInterval(poll); ch.unsubscribe(); };
  }, [screen.id, refresh]);

  // A "Show now" slide leaves the moment its time is up, even if the TV is offline.
  useEffect(() => {
    if (!live.length) return;
    const t = setTimeout(() => { setTick((n) => n + 1); refresh(); }, Math.max(0, Math.min(...live.map((l) => l.until)) - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [live, refresh]);

  // After a playlist change, carry on from the same slide if it's still there.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const at = locate(slides, shown.current, lastPhoto.current);
    // A just-published album comes next: its first photo follows the slide on screen.
    const arrival = slides.findIndex((s) => s.key === playNext.current);
    playNext.current = null;
    // A slide that's gone (photo removed) leaves the screen right away; carry on from there.
    const from = Math.min(state.current.index, Math.max(0, slides.length - 1));
    setIndex(at < 0 ? from : arrival >= 0 ? (arrival - 1 + slides.length) % slides.length : at);
    if (at < 0) goTo(arrival >= 0 ? arrival : from);
    // Tell the service worker which photos to keep on the TV.
    navigator.serviceWorker?.controller?.postMessage({ type: 'keep', urls: slides.filter((s) => s.kind === 'photo').map((s) => s.src) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides]);
  useEffect(() => {
    navigator.serviceWorker?.ready.then((reg) => reg.active?.postMessage({ type: 'keep', urls: slides.filter((s) => s.kind === 'photo').map((s) => s.src) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remote control and status heartbeat.
  const channel = useRef<ReturnType<typeof screenChannel> | null>(null);
  const liveRef = useRef(live);
  liveRef.current = live;
  const report = useCallback(() => {
    const { index: i, slides: list, playing: p, black: b } = state.current;
    const takeover = liveRef.current[0]?.slide;
    const s = takeover ?? list[i];
    const status: PlayerStatus = {
      player: playerId, playing: p, black: b, index: i, total: list.length,
      albums: playlist.albums.length, promos: playlist.promos.length, version: screen.content_version,
      now: s ? (s.kind === 'photo' ? { kind: 'photo', album: s.album, src: s.thumb } : { kind: 'promo', title: takeover ? `Show now · ${s.title}` : s.title, src: s.kind === 'promo' && s.promoKind === 'image' ? s.src : undefined }) : null,
      ua: navigator.userAgent, at: Date.now(),
    };
    channel.current?.send({ type: 'broadcast', event: 'status', payload: status });
  }, [playlist, screen.content_version]);

  useEffect(() => {
    const ch = screenChannel(screen.id);
    ch.on('broadcast', { event: 'command' }, ({ payload }) => {
      const command = payload.command as Command;
      if (command === 'next') next();
      if (command === 'previous') previous();
      if (command === 'play') setPlaying(true);
      if (command === 'pause') setPlaying(false);
      if (command === 'black') setBlack(true);
      if (command === 'unblack') setBlack(false);
      if (command === 'reload') location.reload();
    })
      .on('broadcast', { event: 'hello' }, () => report())
      .subscribe((s) => { if (s === 'SUBSCRIBED') report(); });
    channel.current = ch;
    const beat = setInterval(report, STATUS_MS);
    return () => { clearInterval(beat); ch.unsubscribe(); channel.current = null; };
  }, [screen.id, next, previous, report]);
  useEffect(() => { report(); }, [index, playing, black, live, report]);

  // Keyboard, idle cursor, keep the TV awake.
  const [cursor, setCursor] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const move = () => { setCursor(true); clearTimeout(t); t = setTimeout(() => setCursor(false), 2500); };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') previous();
      if (e.key === ' ') setPlaying((p) => !p);
      if (e.key === 'b') setBlack((b) => !b);
      if (e.key === 'f') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {});
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('keydown', key);
    let lock: WakeLockSentinel | undefined;
    const wake = () => navigator.wakeLock?.request('screen').then((l) => { lock = l; }, () => {});
    wake();
    document.addEventListener('visibilitychange', wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', wake);
      lock?.release();
    };
  }, [next, previous]);

  // Service worker: only the player registers it.
  useEffect(() => {
    navigator.serviceWorker?.register('/player-sw.js').catch(() => {});
  }, []);

  const wall = useMemo(() => wallPhotos(playlist), [playlist]);

  if (!slides.length && !taken) return <Idle message="Tonight’s photos are on their way" />;

  return (
    <div
      className={`player fixed inset-0 overflow-hidden bg-black ${cursor ? '' : 'cursor-none'}`}
      data-transition={transition}
      style={{
        ['--transition' as string]: `${transitionSeconds}s`,
        ...(background && { backgroundImage: `url(${background})`, backgroundSize: 'cover', backgroundPosition: 'center' }),
      }}
      onDoubleClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}))}
    >
      <div className="absolute inset-0">
        {layers.map(({ slide, n }) => (
          <div key={n} className="player-layer absolute inset-0" style={{ ['--secs' as string]: `${slide.seconds}s` }}>
            {slide.kind === 'photo' && !background && slide.h > slide.w * 0.8 && (
              <img src={slide.backdrop} crossOrigin="anonymous" alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-3xl" />
            )}
            {slide.kind === 'message' ? (
              // Designed slides fill the whole screen with their own background.
              <MessageSlide design={slide.design} photos={wall} />
            ) : (
              <div className="absolute flex items-center justify-center" style={{ inset: `${margin}%` }}>
                {slide.kind === 'photo' ? (
                  <img src={slide.src} crossOrigin="anonymous" alt="" className="player-photo max-h-full max-w-full object-contain" style={{ width: slide.w, height: slide.h }} />
                ) : slide.promoKind === 'video' ? (
                  <video src={slide.src} autoPlay muted playsInline className="size-full object-contain" onEnded={next} onError={next} />
                ) : (
                  <img src={slide.src} alt="" className="max-h-full max-w-full object-contain" style={slide.w && slide.h ? { width: slide.w, height: slide.h } : undefined} />
                )}
              </div>
            )}
            {slide.kind === 'photo' && screen.show_album_titles && (
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/70 to-transparent px-[3vw] pb-[2.6vw] pt-[8vw]">
                <div className="grid gap-[.3vw]">
                  <span className="font-display text-[2.1vw] font-bold leading-none tracking-tight text-white">{slide.album}</span>
                  {slide.date && <span className="text-[1.05vw] font-medium uppercase tracking-[.2em] text-gold">{slide.date}</span>}
                </div>
                <Mark className="h-[3.2vw] opacity-90" />
              </div>
            )}
          </div>
        ))}
      </div>
      {!started && slides.length > 0 && !taken && <Idle />}
      <Takeover live={live} wall={wall} />
      <div className={`pointer-events-none absolute inset-0 z-10 bg-black transition-opacity duration-700 ${black ? 'opacity-100' : 'opacity-0'}`} />
    </div>
  );
}

// "Show now" slides over the slideshow: fades in, takes turns if there are several (a video
// plays to its end, or loops when it's alone), and fades out when the time is up.
function Takeover({ live, wall }: { live: { slide: Slide; until: number }[]; wall: string[] }) {
  const [shown, setShown] = useState(live);
  const [leaving, setLeaving] = useState(false);
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    if (live.length) { setShown(live); setLeaving(false); return; }
    setLeaving(true);
    const t = setTimeout(() => setShown([]), FADE_MS);
    return () => clearTimeout(t);
  }, [live]);
  const item = shown.length ? shown[turn % shown.length] : null;
  const advance = useCallback(() => setTurn((n) => n + 1), []);
  useEffect(() => {
    if (!item || shown.length < 2 || (item.slide.kind === 'promo' && item.slide.promoKind === 'video')) return;
    const t = setTimeout(advance, item.slide.seconds * 1000);
    return () => clearTimeout(t);
  }, [item, shown.length, advance]);
  if (!item) return null;
  const { slide } = item;
  return (
    <div className="absolute inset-0 z-[5] bg-black transition-opacity ease-out" style={{ opacity: leaving ? 0 : 1, transitionDuration: `${FADE_MS}ms`, animation: `player-fade ${FADE_MS}ms ease-out both` }}>
      <div key={`${slide.key}:${turn % shown.length}`} className="absolute inset-0" style={{ animation: 'player-fade .8s ease-in-out both' }}>
        {slide.kind === 'message' ? (
          <MessageSlide design={slide.design} photos={wall} liveUntil={item.until} />
        ) : slide.kind === 'promo' && slide.promoKind === 'video' ? (
          <video src={slide.src} autoPlay muted playsInline loop={shown.length < 2} className="size-full object-contain" onEnded={advance} onError={advance} />
        ) : slide.kind === 'promo' ? (
          <img src={slide.src} alt="" className="size-full object-contain" />
        ) : null}
      </div>
    </div>
  );
}

function Idle({ message }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-[radial-gradient(60%_60%_at_50%_40%,#2b094c,#07040d)]">
      <div className="grid place-items-center gap-[2vw]">
        <Logo className="w-[22vw] animate-pulse" />
        {message && <p className="text-[1.4vw] text-white/60">{message}</p>}
      </div>
    </div>
  );
}
