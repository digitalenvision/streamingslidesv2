// A slide designed in Command: words in Akira over a brand background, drawn live on the
// TV so it stays sharp on any screen. The words sit on a fixed 1920×1080 stage scaled to fit,
// so the editor's preview, the thumbnails and the TV show exactly the same thing.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import qrcode from 'qrcode-generator';
import { cn } from '@/lib/format';
import { publicUrl } from '@/lib/media';
import type { SlideAccent, SlideBackground, SlideDesign } from '@/types';
import './slides.css';

const W = 1920;
const H = 1080;
const PAD = 128; // inside the TV's overscan

export const ACCENTS: Record<SlideAccent, { label: string; color: string; deep: string; glow: string }> = {
  gold: { label: 'Gold', color: '#e4b11a', deep: '#b8890b', glow: '228 177 26' },
  white: { label: 'White', color: '#ffffff', deep: '#c9bfd6', glow: '255 255 255' },
  lime: { label: 'Lime', color: '#83f50c', deep: '#4f9a00', glow: '131 245 12' },
  cyan: { label: 'Cyan', color: '#4fd1e2', deep: '#2a8c9b', glow: '54 169 188' },
  // The brand magenta (#870899) is too dark for words on purple; this is its light tint.
  magenta: { label: 'Magenta', color: '#e45cf5', deep: '#870899', glow: '135 8 153' },
};

// Akira draws plain letters only. Curly quotes and dashes become plain ones; anything else
// it can't draw (É, Ñ, emoji) sends the whole title to wide Archivo, so it never mixes faces.
export const akiraText = (s: string) => s.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...');
export const akiraCan = (s: string) => /^[\x20-\x5d\x5f\x61-\x7d ]*$/.test(akiraText(s));

// --- stage ----------------------------------------------------------------------------
function Stage({ fit, children }: { fit: 'contain' | 'cover'; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = box.current!;
    const measure = () => {
      const sx = el.clientWidth / W, sy = el.clientHeight / H;
      setScale(fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);
  return (
    <div ref={box} className="absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-1/2" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})`, visibility: scale ? undefined : 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

// --- fitted title ---------------------------------------------------------------------
const fontsReady = () => (document.fonts ? Promise.all([document.fonts.load('800 100px "Akira Expanded"'), document.fonts.load('800 100px "Gusto Wide"')]) : Promise.resolve());

/** A line that grows as big as its box allows: short words huge, long ones still on screen. */
function Fit({ text, width, height, max, min = 48, className, style, delay }: {
  text: string; width: number; height: number; max: number; min?: number; className?: string; style?: CSSProperties; delay?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    let gone = false;
    const fits = (size: number) => {
      node.style.fontSize = `${size}px`;
      return node.scrollWidth <= width + 1 && node.scrollHeight <= height + 1;
    };
    const fit = () => {
      if (gone) return;
      if (fits(max)) return;
      let lo = min, hi = max;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (fits(mid)) lo = mid; else hi = mid;
      }
      fits(lo);
    };
    fit();
    fontsReady().then(fit, fit);
    return () => { gone = true; };
  }, [text, width, height, max, min, className]);
  const fallback = !akiraCan(text);
  return (
    <div
      ref={el}
      className={cn('ms-akira ms-title ms-in', className)}
      data-fallback={fallback || undefined}
      style={{ width, maxHeight: height, animationDelay: delay != null ? `${delay}s` : undefined, ...style }}
    >
      {fallback ? text : akiraText(text)}
    </div>
  );
}

// --- QR code --------------------------------------------------------------------------
function Qr({ url, label, size = 250 }: { url: string; label: string; size?: number }) {
  const path = useMemo(() => {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      const n = qr.getModuleCount();
      let d = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      return { d, n };
    } catch {
      return null;
    }
  }, [url]);
  if (!path) return null;
  return (
    <div className="ms-in grid justify-items-center gap-5" style={{ animationDelay: '.7s' }}>
      <div className="rounded-[30px] bg-white p-[22px] shadow-[0_30px_80px_-20px_rgb(0_0_0/.8)]">
        <svg viewBox={`0 0 ${path.n} ${path.n}`} width={size} height={size} shapeRendering="crispEdges" aria-hidden>
          <path d={path.d} fill="#1a0530" />
        </svg>
      </div>
      {label && <span className="ms-wide text-[24px] font-bold uppercase tracking-[.22em] text-white/90">{label}</span>}
    </div>
  );
}

// --- countdown ------------------------------------------------------------------------
/** mm:ss to `until` (ms on this device's clock). Each digit sits in a fixed cell so it doesn't jitter. */
function Countdown({ until, size, still }: { until: number; size: number; still?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (still) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [still]);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  const text = left >= 3600 ? `${Math.floor(left / 3600)}:${String(Math.floor(left / 60) % 60).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}` : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return (
    <div className="ms-akira ms-in flex justify-center text-[var(--accent)]" style={{ fontSize: size, animationDelay: '.45s', filter: 'drop-shadow(0 0 60px rgb(var(--accent-glow) / .45))' }}>
      {[...text].map((ch, i) => (
        <span key={i} className="inline-block text-center" style={{ width: ch === ':' ? '.42em' : '.86em' }}>{ch}</span>
      ))}
    </div>
  );
}

// --- backgrounds ----------------------------------------------------------------------
// Fixed pseudo-random numbers, so confetti and dust land the same way on every render.
const rand = (i: number, salt = 1) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const CONFETTI_COLORS = ['#e4b11a', '#f3cf5f', '#ffffff', '#e45cf5', '#83f50c', '#e4b11a'];

function Backdrop({ background, photos }: { background: SlideBackground; photos: string[] }) {
  const base = 'absolute inset-0';
  if (background.type === 'image') {
    const dim = { light: 0.3, medium: 0.5, strong: 0.7 }[background.dim];
    return (
      <div className={base}>
        <img src={publicUrl(background.path)} alt="" crossOrigin="anonymous" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0" style={{ background: `linear-gradient(100deg, rgb(13 2 24 / ${Math.min(0.92, dim + 0.25)}) 0%, rgb(13 2 24 / ${dim}) 55%, rgb(13 2 24 / ${Math.max(0.1, dim - 0.15)}) 100%)` }} />
      </div>
    );
  }
  if (background.type === 'photos' && photos.length) {
    const cols = 7;
    const per = 6;
    const tiles = Array.from({ length: cols * per }, (_, i) => photos[i % photos.length]);
    return (
      <div className={cn(base, 'bg-[#0d0218]')}>
        <div className="absolute flex gap-[22px]" style={{ left: -260, top: -420, transform: 'rotate(-9deg)' }}>
          {Array.from({ length: cols }, (_, c) => {
            const list = tiles.slice(c * per, c * per + per);
            return (
              <div key={c} className="ms-col" data-down={c % 2 || undefined} style={{ animationDuration: `${80 + (c % 3) * 14}s` }}>
                {[...list, ...list].map((src, i) => (
                  <img key={i} src={src} alt="" crossOrigin="anonymous" className="h-[400px] w-[330px] rounded-[22px] object-cover" />
                ))}
              </div>
            );
          })}
        </div>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(100deg, rgb(13 2 24 / .94) 0%, rgb(26 5 48 / .82) 50%, rgb(43 9 76 / .6) 100%)' }} />
      </div>
    );
  }
  const id = background.type === 'preset' ? background.id : 'velvet';
  if (id === 'gold') {
    return (
      <div className={base} style={{ background: 'radial-gradient(120% 100% at 80% 100%, #3a2508 0%, #140a06 45%, #07040d 100%)' }}>
        <div className="ms-blob ms-drift-b" style={{ width: 1500, height: 1500, right: -500, bottom: -800, background: 'radial-gradient(circle, rgb(228 177 26 / .38), transparent 62%)' }} />
        <div className="ms-blob ms-drift-a" style={{ width: 1000, height: 1000, left: -300, top: -500, background: 'radial-gradient(circle, rgb(85 56 110 / .55), transparent 65%)' }} />
        {[340, 900, 1460].map((x, i) => <div key={x} className="ms-beam" style={{ left: x, animationDelay: `${-i * 5}s`, animationDuration: `${15 + i * 3}s` }} />)}
        {Array.from({ length: 26 }, (_, i) => (
          <span key={i} className="ms-dust" style={{ left: rand(i) * W, top: rand(i, 2) * H, width: 3 + rand(i, 3) * 5, height: 3 + rand(i, 3) * 5, animationDelay: `${-rand(i, 4) * 4}s`, animationDuration: `${3 + rand(i, 5) * 3}s` }} />
        ))}
      </div>
    );
  }
  if (id === 'neon') {
    return (
      <div className={base} style={{ background: '#0d0218' }}>
        <div className="ms-blob ms-drift-a" style={{ width: 1500, height: 1500, left: -500, top: -700, background: 'radial-gradient(circle, rgb(135 8 153 / .85), transparent 62%)' }} />
        <div className="ms-blob ms-drift-b" style={{ width: 1400, height: 1400, right: -500, bottom: -700, background: 'radial-gradient(circle, rgb(54 169 188 / .55), transparent 62%)' }} />
        <div className="ms-blob ms-drift-c" style={{ width: 900, height: 900, left: 700, top: 300, background: 'radial-gradient(circle, rgb(85 56 110 / .5), transparent 65%)' }} />
      </div>
    );
  }
  if (id === 'electric') {
    return (
      <div className={base} style={{ background: 'radial-gradient(110% 100% at 20% 0%, #2b094c 0%, #12031f 55%, #07040d 100%)' }}>
        <div className="ms-blob ms-drift-b" style={{ width: 1300, height: 1300, right: -400, top: -500, background: 'radial-gradient(circle, rgb(131 245 12 / .3), transparent 62%)' }} />
        <div className="ms-blob ms-drift-a" style={{ width: 1200, height: 1200, left: -400, bottom: -700, background: 'radial-gradient(circle, rgb(135 8 153 / .6), transparent 62%)' }} />
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="ms-streak" style={{ top: 80 + rand(i, 6) * 900, animationDelay: `${-rand(i, 7) * 7}s`, animationDuration: `${5 + rand(i, 8) * 5}s`, opacity: 0.35 + rand(i, 9) * 0.5 }} />
        ))}
      </div>
    );
  }
  if (id === 'spotlight') {
    return (
      <div className={base} style={{ background: 'radial-gradient(80% 60% at 50% 110%, #2b094c 0%, #0b0412 60%, #040207 100%)' }}>
        <div className="ms-cone" />
        <div className="ms-blob" style={{ width: 1600, height: 360, left: 160, bottom: -140, background: 'radial-gradient(ellipse, rgb(255 238 205 / .12), transparent 70%)' }} />
      </div>
    );
  }
  // velvet, and confetti on top of it
  return (
    <div className={base} style={{ background: 'radial-gradient(120% 95% at 30% 15%, #3d1069 0%, #2b094c 32%, #14041f 72%, #07020d 100%)' }}>
      <div className="ms-blob ms-drift-a" style={{ width: 1400, height: 1400, left: -500, top: 100, background: 'radial-gradient(circle, rgb(135 8 153 / .5), transparent 62%)' }} />
      <div className="ms-blob ms-drift-b" style={{ width: 1200, height: 1200, right: -300, top: -600, background: 'radial-gradient(circle, rgb(85 56 110 / .7), transparent 62%)' }} />
      <div className="ms-blob ms-drift-c" style={{ width: 800, height: 800, right: 100, bottom: -400, background: 'radial-gradient(circle, rgb(228 177 26 / .14), transparent 65%)' }} />
      {id === 'confetti' && Array.from({ length: 64 }, (_, i) => {
        const w = 14 + rand(i, 1) * 16;
        return (
          <span
            key={i}
            className="ms-confetti"
            style={{
              left: rand(i, 2) * W, width: w, height: w * (0.4 + rand(i, 3) * 0.3), borderRadius: rand(i, 4) > 0.8 ? 9999 : 3,
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              animationDuration: `${8 + rand(i, 5) * 8}s`, animationDelay: `${-rand(i, 6) * 16}s`,
              ['--drift' as string]: `${(rand(i, 7) - 0.5) * 360}px`, ['--spin' as string]: `${(rand(i, 8) > 0.5 ? 1 : -1) * (360 + rand(i, 9) * 540)}deg`,
              opacity: 0.55 + rand(i, 10) * 0.45,
            }}
          />
        );
      })}
    </div>
  );
}

// --- layouts --------------------------------------------------------------------------
const Kicker = ({ text, center }: { text: string; center?: boolean }) =>
  text ? (
    <div className={cn('ms-in flex items-center gap-7 text-[var(--accent)]', center && 'justify-center')} style={{ animationDelay: '.1s' }}>
      {!center && <span className="h-[6px] w-[84px] rounded-full bg-current" />}
      <span className="ms-wide text-[38px] font-bold uppercase tracking-[.34em]">{text}</span>
    </div>
  ) : null;

const Body = ({ text, className, delay = 0.55 }: { text: string; className?: string; delay?: number }) =>
  text ? <p className={cn('ms-mid ms-in text-[46px] font-medium leading-[1.3] text-white/85 [text-wrap:balance]', className)} style={{ animationDelay: `${delay}s` }}>{text}</p> : null;

const Footer = ({ text, className }: { text: string; className?: string }) =>
  text ? <span className={cn('ms-wide ms-in text-[32px] font-extrabold uppercase tracking-[.26em] text-[var(--accent)]', className)} style={{ animationDelay: '.7s' }}>{text}</span> : null;

const Sparkle = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 40 40" className={className} aria-hidden><path d="M20 0c1.6 10.4 9.6 18.4 20 20-10.4 1.6-18.4 9.6-20 20C18.4 29.6 10.4 21.6 0 20 10.4 18.4 18.4 10.4 20 0Z" fill="currentColor" /></svg>
);

function Headline({ d }: { d: SlideDesign }) {
  const width = W - PAD * 2 - (d.qr ? 400 : 0);
  return (
    <div className="absolute flex flex-col justify-center" style={{ inset: PAD }}>
      <div className="grid gap-[42px]">
        <Kicker text={d.kicker} />
        {d.headline && <Fit text={d.headline} width={width} height={d.body ? 520 : 640} max={250} delay={0.25} />}
        <Body text={d.body} className="max-w-[1250px]" />
      </div>
      <Footer text={d.footer} className="absolute bottom-0 left-0" />
      {d.qr && <div className="absolute bottom-[-20px] right-0"><Qr url={d.qr.url} label={d.qr.label} /></div>}
    </div>
  );
}

function Celebrate({ d }: { d: SlideDesign }) {
  return (
    <div className="absolute flex flex-col items-center justify-center text-center" style={{ inset: PAD }}>
      {d.kicker && (
        <div className="ms-in flex items-center gap-8 text-[var(--accent)]" style={{ animationDelay: '.1s' }}>
          <Sparkle className="ms-pulse size-[44px]" />
          <span className="ms-wide text-[54px] font-extrabold uppercase tracking-[.4em] [margin-right:-.4em]">{d.kicker}</span>
          <Sparkle className="ms-pulse size-[44px] [animation-delay:.9s]" />
        </div>
      )}
      {d.headline && <Fit text={d.headline} width={1640} height={d.body ? 470 : 560} max={320} className="ms-pour mt-[38px] text-center" delay={0.3} />}
      <Body text={d.body} className="mt-[46px] max-w-[1300px]" />
      <Footer text={d.footer} className="absolute bottom-0" />
      {d.qr && <div className="absolute bottom-[-20px] right-0 scale-[.8] origin-bottom-right"><Qr url={d.qr.url} label={d.qr.label} /></div>}
    </div>
  );
}

function Spotlight({ d }: { d: SlideDesign }) {
  const textWidth = 940;
  return (
    <div className="absolute" style={{ inset: PAD }}>
      <div className="absolute left-0 top-0 flex h-full flex-col justify-center gap-[38px]" style={{ width: textWidth }}>
        <Kicker text={d.kicker} />
        {d.headline && <Fit text={d.headline} width={textWidth} height={400} max={190} delay={0.25} />}
        <Body text={d.body} className="text-[42px]" />
        {d.footer && <Fit text={d.footer} width={textWidth} height={190} max={170} min={40} className="text-[var(--accent)] [filter:drop-shadow(0_0_50px_rgb(var(--accent-glow)/.4))]" delay={0.7} />}
      </div>
      <div className="absolute bottom-0 right-[-20px] top-0 grid w-[760px] place-items-center">
        <div className="ms-blob ms-pulse" style={{ width: 900, height: 900, background: 'radial-gradient(circle, rgb(var(--accent-glow) / .42), transparent 62%)', animationDuration: '6s' }} />
        {d.image ? (
          <div className="ms-in relative grid place-items-center" style={{ animationDelay: '.35s' }}>
            <img src={publicUrl(d.image)} alt="" crossOrigin="anonymous" className="ms-float max-h-[760px] max-w-[700px] object-contain [filter:drop-shadow(0_40px_60px_rgb(0_0_0/.6))]" />
            <div className="absolute -bottom-[50px] h-[40px] w-[460px] rounded-[50%] bg-black/60 blur-[24px]" />
          </div>
        ) : (
          // No picture: rings of light in the accent colour hold the space.
          <div className="ms-in relative grid place-items-center" style={{ animationDelay: '.35s' }}>
            <div className="ms-spin-slow absolute size-[640px] rounded-full border-[3px] border-dashed border-[var(--accent)] opacity-35" />
            <div className="ms-pulse absolute size-[470px] rounded-full border-2 border-[var(--accent)] opacity-50" style={{ animationDuration: '4s' }} />
            <div className="ms-float size-[300px] rounded-full" style={{ background: 'radial-gradient(circle at 35% 30%, #fff 0%, var(--accent) 38%, var(--accent-deep) 75%, transparent 76%)', boxShadow: '0 0 120px 20px rgb(var(--accent-glow) / .45)' }} />
          </div>
        )}
      </div>
      {d.qr && <div className="absolute bottom-[-20px] left-[calc(940px+40px)] scale-[.7] origin-bottom-left"><Qr url={d.qr.url} label={d.qr.label} /></div>}
    </div>
  );
}

function Alert({ d, liveUntil, still }: { d: SlideDesign; liveUntil: number | null; still?: boolean }) {
  const counting = d.countdown && liveUntil != null;
  return (
    <>
      <div className="ms-pulse absolute rounded-[44px] border-[5px] border-[var(--accent)]" style={{ inset: 52, boxShadow: '0 0 80px rgb(var(--accent-glow) / .35), inset 0 0 80px rgb(var(--accent-glow) / .2)' }} />
      <div className="absolute flex flex-col items-center justify-center text-center" style={{ inset: PAD }}>
        {d.kicker && (
          <div className="ms-in flex items-center gap-5 rounded-full bg-[var(--accent)] px-[44px] py-[18px] text-[#1a0530]" style={{ animationDelay: '.1s' }}>
            <span className="ms-pulse size-[18px] rounded-full bg-current" />
            <span className="ms-wide text-[36px] font-black uppercase tracking-[.3em] [margin-right:-.3em]">{d.kicker}</span>
          </div>
        )}
        {d.headline && <Fit text={d.headline} width={1600} height={counting ? 330 : d.body ? 440 : 540} max={260} className="mt-[52px] text-center" delay={0.25} />}
        {counting && <div className="mt-[40px]"><Countdown until={liveUntil!} size={210} still={still} /></div>}
        <Body text={d.body} className="mt-[44px] max-w-[1400px]" />
        {!counting && <Footer text={d.footer} className="mt-[54px]" />}
      </div>
    </>
  );
}

// --- the slide ------------------------------------------------------------------------
export function MessageSlide({ design, photos = [], liveUntil = null, still, className }: {
  design: SlideDesign;
  /** Thumbnails of the newest album, for the photo-wall background. */
  photos?: string[];
  /** End of "Show now" on this device's clock, for the countdown. */
  liveUntil?: number | null;
  /** Hold every animation (thumbnails). */
  still?: boolean;
  className?: string;
}) {
  const accent = ACCENTS[design.accent] ?? ACCENTS.gold;
  const style = { '--accent': accent.color, '--accent-deep': accent.deep, '--accent-glow': accent.glow } as CSSProperties;
  return (
    <div className={cn('ms absolute inset-0 overflow-hidden bg-[#0d0218]', still && 'ms-still', className)} style={style}>
      <Stage fit="cover"><Backdrop background={design.background} photos={photos} /></Stage>
      <div className="ms-vignette absolute inset-0" />
      <Stage fit="contain">
        {design.layout === 'celebrate' ? <Celebrate d={design} />
          : design.layout === 'spotlight' ? <Spotlight d={design} />
          : design.layout === 'alert' ? <Alert d={design} liveUntil={liveUntil} still={still} />
          : <Headline d={design} />}
      </Stage>
      <div className="ms-grain absolute inset-0" />
    </div>
  );
}

/** Just a background, for the editor's swatches. */
export function BackdropSwatch({ background, photos = [] }: { background: SlideBackground; photos?: string[] }) {
  return (
    <div className="ms ms-still absolute inset-0 overflow-hidden bg-[#0d0218]">
      <Stage fit="cover"><Backdrop background={background} photos={photos} /></Stage>
      <div className="ms-vignette absolute inset-0" />
    </div>
  );
}

/** Files a designed slide shows, to load before it comes on. */
export const designImages = (design: SlideDesign) =>
  [design.background.type === 'image' ? publicUrl(design.background.path) : null, design.image ? publicUrl(design.image) : null].filter(Boolean) as string[];

export const loadSlideFonts = fontsReady;
