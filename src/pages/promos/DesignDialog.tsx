// The slide designer: pick a starting point, write the words, choose a background. The
// preview is the TV's own renderer, so what you see here is what the screens show.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ImagePlus, Images, Loader2, Maximize2, PartyPopper, RotateCcw, Siren, Type, Wine, X } from 'lucide-react';
import { Button, Dialog, Field, Input, Segmented, Switch, Textarea, useToast } from '@/components/ui';
import { createDesignedSlide, removeSlideFiles, slideFiles, updatePromo, uploadSlidePicture } from '@/lib/data';
import { cn } from '@/lib/format';
import { publicUrl } from '@/lib/media';
import { BLANK_DESIGN, GALLERY_URL, STARTERS, nightAt } from '@/lib/slides';
import { ACCENTS, BackdropSwatch, MessageSlide, akiraCan } from '@/player/MessageSlide';
import type { Promo, Screen, SlideAccent, SlideBackground, SlideDesign, SlideLayout, SlidePreset } from '@/types';
import { ScheduleFields, scheduleOf, scheduleProblem, scheduleRow, type Schedule } from './ScheduleFields';

const LAYOUTS: { id: SlideLayout; label: string; hint: string; icon: ReactNode }[] = [
  { id: 'headline', label: 'Headline', hint: 'A big title, left', icon: <Type /> },
  { id: 'celebrate', label: 'Celebrate', hint: 'Birthdays, shout-outs', icon: <PartyPopper /> },
  { id: 'spotlight', label: 'Product', hint: 'A drink or bottle, with its price', icon: <Wine /> },
  { id: 'alert', label: 'Alert', hint: 'Closing time, last call', icon: <Siren /> },
];

const PRESETS: { id: SlidePreset; label: string }[] = [
  { id: 'velvet', label: 'Velvet' },
  { id: 'gold', label: 'Gold' },
  { id: 'neon', label: 'Neon' },
  { id: 'electric', label: 'Electric' },
  { id: 'confetti', label: 'Confetti' },
  { id: 'spotlight', label: 'Spotlight' },
];

const LABELS: Record<SlideLayout, { kicker: string; headline: string; body: string; footer: string; footerHint?: string }> = {
  headline: { kicker: 'Small line on top', headline: 'Title', body: 'Line underneath', footer: 'Bottom line', footerHint: 'A website, a hashtag, a time.' },
  celebrate: { kicker: 'Small line on top', headline: 'Name', body: 'Line underneath', footer: 'Bottom line' },
  spotlight: { kicker: 'Small line on top', headline: 'Product', body: 'Line underneath', footer: 'Price or offer', footerHint: 'Big, in the accent colour: “AWG 15”, “2 for 1”.' },
  alert: { kicker: 'Label on top', headline: 'Message', body: 'Line underneath', footer: 'Bottom line', footerHint: 'Shown when there’s no countdown.' },
};

const ACCEPT = 'image/jpeg,image/png,image/webp';

export function DesignDialog({ promo, screens, photos, onClose, onSaved }: {
  promo: Promo | 'new' | null; screens: Screen[]; photos: string[]; onClose: () => void; onSaved: (p: Promo, isNew: boolean) => void;
}) {
  const toast = useToast();
  const existing = promo && promo !== 'new' ? promo : null;
  const [id, setId] = useState('');
  const [starter, setStarter] = useState<string | null>(null);
  const [design, setDesign] = useState<SlideDesign>(BLANK_DESIGN);
  const [title, setTitle] = useState('');
  const [schedule, setSchedule] = useState<Schedule>(scheduleOf(null));
  const [uploading, setUploading] = useState<'bg' | 'item' | null>(null);
  const [busy, setBusy] = useState(false);
  const [replay, setReplay] = useState(0);
  const [demoUntil, setDemoUntil] = useState(0);
  // Pictures uploaded while the editor is open, removed again if they end up unused.
  const uploaded = useRef<string[]>([]);
  const stage = useRef<HTMLDivElement>(null);

  const applyStarter = (key: string) => {
    const s = STARTERS.find((x) => x.id === key)!;
    const tonight = nightAt().date;
    setStarter(key);
    setDesign(s.design);
    setTitle(s.title);
    setSchedule(scheduleOf(null, {
      days: s.schedule?.days ?? null,
      active: s.schedule?.active ?? true,
      starts_on: s.schedule?.tonightOnly ? tonight : null,
      ends_on: s.schedule?.tonightOnly ? tonight : null,
      duration_seconds: s.seconds ?? 10,
    }));
    setReplay((n) => n + 1);
  };

  useEffect(() => {
    if (!promo) return;
    uploaded.current = [];
    setDemoUntil(Date.now() + 10 * 60_000);
    if (existing) {
      setId(existing.id);
      setStarter(null);
      setDesign({ ...BLANK_DESIGN, ...existing.design });
      setTitle(existing.title);
      setSchedule(scheduleOf(existing));
    } else {
      setId(crypto.randomUUID());
      applyStarter(STARTERS[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promo]);

  const set = (patch: Partial<SlideDesign>) => setDesign((d) => ({ ...d, ...patch }));
  const setBackground = (background: SlideBackground) => set({ background });

  const close = () => {
    // Nothing saved: drop the pictures uploaded in this visit.
    const keep = new Set(existing ? slideFiles(existing) : []);
    removeSlideFiles(uploaded.current.filter((p) => !keep.has(p))).catch(() => {});
    uploaded.current = [];
    onClose();
  };

  const upload = async (file: File | undefined, role: 'bg' | 'item') => {
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) return toast('Use a JPG, PNG or WebP image', 'bad');
    if (file.size > 40 * 1024 * 1024) return toast('That picture is over 40 MB', 'bad');
    setUploading(role);
    try {
      const path = await uploadSlidePicture(id, file, role);
      uploaded.current.push(path);
      if (role === 'bg') setBackground({ type: 'image', path, dim: design.background.type === 'image' ? design.background.dim : 'medium' });
      else set({ image: path });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not upload', 'bad');
    } finally {
      setUploading(null);
    }
  };

  const qrProblem = design.qr && !/^https?:\/\/\S+\.\S+/.test(design.qr.url.trim()) ? 'Start the link with https://' : null;
  const problem = !design.headline.trim() && !design.kicker.trim() ? 'Write a title' : qrProblem ?? scheduleProblem(schedule);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (problem) return toast(problem, 'bad');
    setBusy(true);
    const clean: SlideDesign = {
      ...design,
      kicker: design.kicker.trim(), headline: design.headline.trim(), body: design.body.trim(), footer: design.footer.trim(),
      qr: design.qr ? { url: design.qr.url.trim(), label: design.qr.label.trim() } : null,
      image: design.layout === 'spotlight' ? design.image : null,
      countdown: design.layout === 'alert' && design.countdown,
    };
    const fields = { ...scheduleRow(schedule), title: title.trim() || clean.headline || clean.kicker };
    try {
      const saved = existing ? await updatePromo(existing.id, { ...fields, design: clean }) : await createDesignedSlide(id, clean, fields);
      // Pictures no longer used (replaced, removed, or uploaded and not kept) go.
      const used = new Set(slideFiles(saved));
      removeSlideFiles([...(existing ? slideFiles(existing) : []), ...uploaded.current].filter((p) => !used.has(p))).catch(() => {});
      uploaded.current = [];
      onSaved(saved, !existing);
      toast(existing ? 'Slide saved' : 'Slide added');
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'bad');
    } finally {
      setBusy(false);
    }
  };

  const labels = LABELS[design.layout];
  const bg = design.background;

  return (
    <Dialog open={!!promo} onClose={close} title={existing ? 'Edit slide' : 'Design a slide'} wide="xl">
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-8">
        {/* Preview */}
        <div className="sticky top-0 z-10 -mx-5 -mt-2 bg-ink-850 px-5 pb-3 pt-2 lg:static lg:mx-0 lg:mt-0 lg:bg-transparent lg:p-0">
          <div className="grid gap-3 lg:sticky lg:top-0">
            <div ref={stage} className="relative aspect-video overflow-hidden rounded-xl border border-line bg-black shadow-pop">
              <MessageSlide key={replay} design={design} photos={photos} liveUntil={design.countdown ? demoUntil : null} />
              <div className="absolute right-2 top-2 flex gap-1.5">
                <PreviewButton label="Play again" onClick={() => { setReplay((n) => n + 1); setDemoUntil(Date.now() + 10 * 60_000); }}><RotateCcw className="size-3.5" /></PreviewButton>
                <PreviewButton label="Full screen" onClick={() => stage.current?.requestFullscreen?.().catch(() => {})}><Maximize2 className="size-3.5" /></PreviewButton>
              </div>
            </div>
            {!existing && (
              <div className="grid gap-2">
                <span className="kicker">Start from</span>
                <div className="flex gap-1.5 overflow-x-auto pb-1 scroll-thin">
                  {STARTERS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => applyStarter(s.id)}
                      className={cn('h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
                        starter === s.id ? 'border-gold bg-gold text-purple-deep' : 'border-line bg-ink-900 text-white/75 hover:border-white/20 hover:text-white')}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="hidden text-[12.5px] text-mute lg:block">This is the screen’s own drawing: it looks the same on the TVs, sharp at any size. A countdown shows here as it will when the slide takes over the screens.</p>
          </div>
        </div>

        {/* Form */}
        <div className="grid content-start gap-7">
          <Section title="Layout">
            <div className="grid grid-cols-2 gap-2">
              {LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={design.layout === l.id}
                  onClick={() => set({ layout: l.id, countdown: l.id === 'alert' ? design.countdown : false })}
                  className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition-colors [&_svg]:size-5',
                    design.layout === l.id ? 'border-gold bg-gold/[0.09] text-white' : 'border-line bg-ink-900 text-white/75 hover:border-white/20')}
                >
                  <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', design.layout === l.id ? 'bg-gold text-purple-deep' : 'bg-white/[0.06]')}>{l.icon}</span>
                  <span className="grid min-w-0">
                    <span className="font-semibold">{l.label}</span>
                    <span className="truncate text-[12px] text-mute">{l.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Words">
            <Field label={labels.kicker}>{(fid) => <Input id={fid} maxLength={40} value={design.kicker} onChange={(e) => set({ kicker: e.target.value })} />}</Field>
            <Field
              label={labels.headline}
              hint={design.headline && !akiraCan(design.headline) ? 'Akira has no accents or emoji, so this one shows in wide Archivo instead.' : 'In Akira, sized to fill the screen. Short and loud works best.'}
            >
              {(fid) => <Textarea id={fid} rows={2} maxLength={80} value={design.headline} onChange={(e) => set({ headline: e.target.value.replace(/\n/g, ' ') })} className="min-h-0 font-semibold uppercase tracking-wide" />}
            </Field>
            <Field label={labels.body}>{(fid) => <Input id={fid} maxLength={110} value={design.body} onChange={(e) => set({ body: e.target.value })} />}</Field>
            {!(design.layout === 'alert' && design.countdown) && (
              <Field label={labels.footer} hint={labels.footerHint}>{(fid) => <Input id={fid} maxLength={40} value={design.footer} onChange={(e) => set({ footer: e.target.value })} />}</Field>
            )}
            {design.layout === 'alert' && (
              <Switch
                label="Countdown"
                description="When it takes over the screens (Show now or a set time), a live clock counts down to the end: 10 minutes runs 10:00 to 0:00, then the photos come back. Between the photos it shows the bottom line instead."
                checked={design.countdown}
                onChange={(countdown) => set({ countdown })}
              />
            )}
          </Section>

          <Section title="Look">
            <div className="grid gap-2">
              <span className="text-[13px] font-medium text-white/85">Colour</span>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(ACCENTS) as SlideAccent[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={design.accent === a}
                    title={ACCENTS[a].label}
                    onClick={() => set({ accent: a })}
                    className={cn('flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold transition-colors',
                      design.accent === a ? 'border-white bg-white/[0.08]' : 'border-line text-white/70 hover:border-white/20')}
                  >
                    <span className="size-4 rounded-full ring-1 ring-white/20" style={{ background: ACCENTS[a].color }} />
                    {ACCENTS[a].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <span className="text-[13px] font-medium text-white/85">Background</span>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {PRESETS.map((p) => (
                  <Swatch key={p.id} label={p.label} on={bg.type === 'preset' && bg.id === p.id} onClick={() => setBackground({ type: 'preset', id: p.id })}>
                    <BackdropSwatch background={{ type: 'preset', id: p.id }} />
                  </Swatch>
                ))}
                <Swatch label="Latest photos" on={bg.type === 'photos'} disabled={!photos.length} onClick={() => setBackground({ type: 'photos' })}>
                  {photos.length ? <BackdropSwatch background={{ type: 'photos' }} photos={photos} /> : <span className="grid size-full place-items-center bg-ink-900 text-white/40"><Images className="size-5" /></span>}
                </Swatch>
                <label className="group grid cursor-pointer gap-1.5">
                  <span className={cn('relative grid aspect-video place-items-center overflow-hidden rounded-lg border-2 transition-colors',
                    bg.type === 'image' ? 'border-gold' : 'border-dashed border-white/15 group-hover:border-gold/60')}>
                    {bg.type === 'image' ? <img src={publicUrl(bg.path)} alt="" className="absolute inset-0 size-full object-cover" /> : null}
                    <span className={cn('relative grid size-8 place-items-center rounded-full', bg.type === 'image' ? 'bg-black/60' : 'text-gold')}>
                      {uploading === 'bg' ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                    </span>
                  </span>
                  <span className={cn('text-center text-[12px] font-medium', bg.type === 'image' ? 'text-gold' : 'text-white/70')}>{bg.type === 'image' ? 'Change picture' : 'Your picture'}</span>
                  <input type="file" accept={ACCEPT} hidden disabled={!!uploading} onChange={(e) => { upload(e.target.files?.[0], 'bg'); e.target.value = ''; }} />
                </label>
              </div>
              {!photos.length && <p className="text-[12px] text-mute">Latest photos needs a published album.</p>}
              {bg.type === 'photos' && <p className="text-[12px] text-mute">The newest album’s photos drift behind the words, and change by themselves when a new album goes up.</p>}
              {bg.type === 'image' && (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[13px] text-white/75">Darken</span>
                  <Segmented size="sm" value={bg.dim} onChange={(dim) => setBackground({ ...bg, dim })} options={[{ value: 'light', label: 'A little' }, { value: 'medium', label: 'Medium' }, { value: 'strong', label: 'A lot' }]} />
                </div>
              )}
            </div>

            {design.layout === 'spotlight' && (
              <div className="grid gap-2">
                <span className="text-[13px] font-medium text-white/85">Product picture</span>
                <div className="flex items-center gap-3">
                  <label className="grid size-20 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed border-white/15 bg-ink-900 hover:border-gold/60">
                    {uploading === 'item' ? <Loader2 className="size-5 animate-spin text-gold" />
                      : design.image ? <img src={publicUrl(design.image)} alt="" className="size-full object-contain p-1" />
                      : <ImagePlus className="size-5 text-gold" />}
                    <input type="file" accept={ACCEPT} hidden disabled={!!uploading} onChange={(e) => { upload(e.target.files?.[0], 'item'); e.target.value = ''; }} />
                  </label>
                  <div className="grid gap-1 text-[12.5px] text-mute">
                    <span>A bottle or drink on a see-through background (PNG) looks best: it floats in a glow.</span>
                    {design.image && <button type="button" className="inline-flex w-fit items-center gap-1 font-semibold text-white/75 hover:text-white" onClick={() => set({ image: null })}><X className="size-3.5" />Remove</button>}
                  </div>
                </div>
              </div>
            )}

            <Switch
              label="QR code"
              description="A code guests can scan with their phone camera."
              checked={!!design.qr}
              onChange={(on) => set({ qr: on ? { url: GALLERY_URL, label: 'Scan for photos' } : null })}
            />
            {design.qr && (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <Field label="Link" error={qrProblem ?? undefined}>{(fid) => <Input id={fid} inputMode="url" value={design.qr!.url} onChange={(e) => set({ qr: { ...design.qr!, url: e.target.value } })} />}</Field>
                <Field label="Under the code">{(fid) => <Input id={fid} maxLength={24} value={design.qr!.label} onChange={(e) => set({ qr: { ...design.qr!, label: e.target.value } })} />}</Field>
              </div>
            )}
          </Section>

          <Section title="When it plays">
            <Field label="Name" hint="Only for you; not shown on the screens.">{(fid) => <Input id={fid} value={title} placeholder={design.headline || 'Slide name'} onChange={(e) => setTitle(e.target.value)} />}</Field>
            <ScheduleFields value={schedule} onChange={setSchedule} screens={screens} />
          </Section>

          <div className="sticky bottom-0 -mx-5 -mb-5 flex gap-2 border-t border-line bg-ink-850 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:mx-0 lg:mb-0 lg:px-0">
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!!uploading} className="flex-1">{existing ? 'Save slide' : 'Add slide'}</Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4">
      <h3 className="label">{title}</h3>
      {children}
    </section>
  );
}

function Swatch({ label, on, onClick, disabled, children }: { label: string; on: boolean; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick} className="group grid gap-1.5 disabled:opacity-40">
      <span className={cn('relative block aspect-video overflow-hidden rounded-lg border-2 transition-colors', on ? 'border-gold' : 'border-transparent group-hover:border-white/25')}>{children}</span>
      <span className={cn('text-[12px] font-medium', on ? 'text-gold' : 'text-white/70')}>{label}</span>
    </button>
  );
}

function PreviewButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="grid size-8 place-items-center rounded-lg bg-black/55 text-white/85 backdrop-blur hover:bg-black/75 hover:text-white">
      {children}
    </button>
  );
}
