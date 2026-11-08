import { useEffect, useState, type FormEvent } from 'react';
import { CalendarRange, Clock, Film, Megaphone, Pencil, Plus, Radio, Trash2, UploadCloud, Wand2 } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Badge, Button, Dialog, Empty, Field, IconButton, Input, Switch, useConfirm, useToast } from '@/components/ui';
import { createPromo, deletePromo, latestWallPhotos, listPromos, listScreens, updatePromo } from '@/lib/data';
import { cn, formatDate } from '@/lib/format';
import { publicUrl } from '@/lib/media';
import { daysLabel, hoursLabel, oftenLabel, slideState, takeoverEnd, takeoverLabel, type SlideState } from '@/lib/slides';
import { useLoad } from '@/lib/useLoad';
import type { Promo, Screen } from '@/types';
import { DesignDialog } from './promos/DesignDialog';
import { ScheduleFields, scheduleOf, scheduleProblem, scheduleRow, type Schedule } from './promos/ScheduleFields';
import { LiveBar, ShowNowDialog, SlideThumb, useNow } from './promos/ShowNow';

const short = (d: string) => formatDate(d, { month: 'short', day: 'numeric' });
const dateRange = (p: Promo) =>
  p.starts_on && p.ends_on ? (p.starts_on === p.ends_on ? short(p.starts_on) : `${short(p.starts_on)} – ${short(p.ends_on)}`)
    : p.starts_on ? `From ${short(p.starts_on)}`
    : p.ends_on ? `Until ${short(p.ends_on)}`
    : null;
const whenLabel = (p: Promo) => [daysLabel(p.days), dateRange(p)].filter(Boolean).join(' · ');
const rotationLabel = (p: Promo) =>
  [p.show_from ? hoursLabel(p) : null, oftenLabel(p), p.kind === 'video' ? 'to the end' : `${p.duration_seconds} s`].filter(Boolean).join(' · ');

export function Promos() {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data, loading, set } = useLoad(async () => {
    const [promos, screens, photos] = await Promise.all([listPromos(), listScreens(), latestWallPhotos().catch(() => [])]);
    return { promos, screens, photos };
  });
  const [uploading, setUploading] = useState<Promo | 'new' | null>(null);
  const [designing, setDesigning] = useState<Promo | 'new' | null>(null);
  const [showing, setShowing] = useState<Promo | null>(null);
  // Re-sort every quarter minute, so a slide moves to "On the screens" when its hours begin.
  const now = useNow(true, 15_000);

  const groups: { key: SlideState; title: string }[] = [
    { key: 'live', title: 'Showing now' },
    { key: 'on', title: 'In the rotation now' },
    { key: 'later', title: 'Coming up' },
    { key: 'manual', title: 'Ready for Show now' },
    { key: 'off', title: 'Ended' },
  ];

  const save = async (promo: Promo, patch: Partial<Promo>) => {
    set((d) => d && { ...d, promos: d.promos.map((p) => (p.id === promo.id ? { ...p, ...patch } : p)) });
    try {
      const saved = await updatePromo(promo.id, patch);
      set((d) => d && { ...d, promos: d.promos.map((p) => (p.id === saved.id ? saved : p)) });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'bad');
      throw err;
    }
  };
  const goLive = async (p: Promo, until: string | null) => {
    // Stopping also skips a set-time takeover that's running.
    const timed = until ? null : takeoverEnd(p);
    await save(p, { live_until: until, ...(timed && { skip_until: new Date(timed).toISOString() }) });
    toast(until ? 'On the screens in a few seconds' : 'Back to the photos');
  };
  const edit = (p: Promo) => (p.kind === 'message' ? setDesigning(p) : setUploading(p));
  const onSaved = (p: Promo, isNew: boolean) => set((d) => d && { ...d, promos: isNew ? [p, ...d.promos] : d.promos.map((x) => (x.id === p.id ? p : x)) });

  return (
    <>
      <PageHeader
        title="Promo slides"
        subtitle="Flyers, videos and slides you design here, mixed in between the photos. Or put one on every screen right now."
        actions={
          <>
            <Button icon={<Plus className="size-4" />} onClick={() => setUploading('new')}>Upload flyer</Button>
            <Button variant="primary" icon={<Wand2 className="size-4" />} onClick={() => setDesigning('new')}>Design a slide</Button>
          </>
        }
      />

      {data && <LiveBar promos={data.promos} onOpen={setShowing} onStop={(p) => goLive(p, null).catch(() => {})} />}

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-72 rounded-2xl" />)}</div>
      ) : !data?.promos.length ? (
        <Empty
          icon={<Megaphone />}
          title="No promo slides yet"
          body="Design a slide here (a birthday, tonight’s photos, closing time), or upload an event flyer or a short video. Pick the nights and it switches itself on and off."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setUploading('new')}>Upload flyer</Button>
              <Button variant="primary" icon={<Wand2 className="size-4" />} onClick={() => setDesigning('new')}>Design a slide</Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-10">
          {groups.map(({ key, title }) => {
            const list = data.promos.map((p) => ({ p, ...slideState(p, now) })).filter((x) => x.state === key);
            if (!list.length) return null;
            return (
              <section key={key} className="grid gap-4">
                <h2 className="label">{title} · {list.length}</h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map(({ p, next, until }) => (
                    <article key={p.id} className={cn('panel overflow-hidden', key === 'off' && 'opacity-60', key === 'live' && 'border-gold/40')}>
                      <button type="button" className="relative block w-full text-left" onClick={() => edit(p)} aria-label={`Edit ${p.title}`}>
                        <SlideThumb promo={p} photos={data.photos} until={until} still={key !== 'live'} />
                        <div className="absolute left-2.5 top-2.5 flex gap-1.5">
                          {key === 'live' && <Badge tone="gold" dot className="bg-ink-950/85 backdrop-blur">Showing now</Badge>}
                          {key === 'on' && <Badge tone="ok" dot className="bg-ink-950/80 backdrop-blur">On now</Badge>}
                          {key === 'later' && next && <Badge tone="gold" className="bg-ink-950/80 backdrop-blur"><Clock className="size-3" />{next}</Badge>}
                          {p.kind === 'video' && <Badge className="bg-ink-950/80 backdrop-blur"><Film className="size-3" />Video</Badge>}
                        </div>
                      </button>
                      <div className="grid gap-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate font-sans text-[15px] font-semibold tracking-normal">{p.title}</h3>
                            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-mute"><CalendarRange className="size-3.5 shrink-0" />{p.active || p.takeover_at?.length ? whenLabel(p) : 'Only with Show now'}</p>
                          </div>
                          <div className="flex shrink-0">
                            <IconButton label="Edit" className="size-9" onClick={() => edit(p)}><Pencil className="size-4" /></IconButton>
                            <IconButton
                              label="Delete"
                              className="size-9 hover:text-bad"
                              onClick={async () => {
                                if (!(await confirm('Delete this slide?', `“${p.title}” will be removed from the screens.`))) return;
                                set((d) => d && { ...d, promos: d.promos.filter((x) => x.id !== p.id) });
                                await deletePromo(p).catch((e) => toast(e.message, 'bad'));
                              }}
                            >
                              <Trash2 className="size-4" />
                            </IconButton>
                          </div>
                        </div>
                        {(p.active || p.takeover_at?.length) && (
                          <dl className="grid gap-1 text-[12.5px]">
                            {p.active && <div className="flex gap-2"><dt className="w-[92px] shrink-0 text-mute">Between photos</dt><dd className="min-w-0 truncate text-white/75">{rotationLabel(p)}</dd></div>}
                            {p.takeover_at?.length ? <div className="flex gap-2"><dt className="w-[92px] shrink-0 text-mute">Takes over</dt><dd className="min-w-0 truncate text-white/75">{takeoverLabel(p)}</dd></div> : null}
                            {p.screen_ids?.length ? <div className="flex gap-2"><dt className="w-[92px] shrink-0 text-mute">Screens</dt><dd className="text-white/75">{p.screen_ids.length}</dd></div> : null}
                          </dl>
                        )}
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1"><Switch label="Between photos" checked={p.active} onChange={(v) => save(p, { active: v }).catch(() => {})} /></div>
                          <Button size="sm" variant={key === 'live' ? 'primary' : 'secondary'} icon={<Radio className="size-3.5" />} onClick={() => setShowing(p)}>
                            {key === 'live' ? 'Live' : 'Show now'}
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <PromoDialog
        promo={uploading}
        screens={data?.screens ?? []}
        onClose={() => setUploading(null)}
        onSaved={onSaved}
      />
      <DesignDialog
        promo={designing}
        screens={data?.screens ?? []}
        photos={data?.photos ?? []}
        onClose={() => setDesigning(null)}
        onSaved={onSaved}
      />
      <ShowNowDialog
        promo={showing && (data?.promos.find((p) => p.id === showing.id) ?? showing)}
        screens={data?.screens ?? []}
        photos={data?.photos ?? []}
        onClose={() => setShowing(null)}
        onSave={goLive}
      />
      {dialog}
    </>
  );
}

function PromoDialog({ promo, screens, onClose, onSaved }: { promo: Promo | 'new' | null; screens: Screen[]; onClose: () => void; onSaved: (p: Promo, isNew: boolean) => void }) {
  const toast = useToast();
  const existing = promo && promo !== 'new' ? promo : null;
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [schedule, setSchedule] = useState<Schedule>(scheduleOf(null));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!promo) return;
    setFile(null);
    setPreview(existing?.path ? publicUrl(existing.path) : null);
    setTitle(existing?.title ?? '');
    setSchedule(scheduleOf(existing));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promo]);

  const kind = file ? (file.type.startsWith('video/') ? 'video' : 'image') : existing?.kind ?? 'image';

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!/^(image\/(jpeg|png|webp)|video\/(mp4|webm))$/.test(f.type)) return toast('Use a JPG, PNG or WebP image, or an MP4 video', 'bad');
    if (f.size > 200 * 1024 * 1024) return toast('Videos can be up to 200 MB', 'bad');
    setFile(f);
    setPreview(URL.createObjectURL(f));
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = scheduleProblem(schedule);
    if (problem) return toast(problem, 'bad');
    setBusy(true);
    const fields = { ...scheduleRow(schedule), title: title.trim() };
    try {
      if (existing) onSaved(await updatePromo(existing.id, fields), false);
      else onSaved(await createPromo(file!, fields), true);
      toast(existing ? 'Promo saved' : 'Promo added');
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!promo} onClose={onClose} title={existing ? 'Edit flyer' : 'Upload a flyer or video'}>
      <form onSubmit={submit} className="grid gap-4">
        {existing ? (
          <div className="overflow-hidden rounded-xl bg-black">
            {kind === 'video' ? <video src={preview!} muted playsInline autoPlay loop className="aspect-video w-full object-contain" /> : <img src={preview!} alt="" className="aspect-video w-full object-contain" />}
          </div>
        ) : (
          <label className="grid cursor-pointer place-items-center gap-2 overflow-hidden rounded-xl border-2 border-dashed border-white/15 bg-ink-900 text-center transition-colors hover:border-gold/60">
            {preview
              ? kind === 'video' ? <video src={preview} muted playsInline autoPlay loop className="aspect-video w-full object-contain" /> : <img src={preview} alt="" className="aspect-video w-full object-contain" />
              : <span className="grid place-items-center gap-2 px-4 py-10"><UploadCloud className="size-7 text-gold" /><span className="font-medium">Choose a flyer or video</span><span className="text-[12.5px] text-mute">Landscape 1920×1080 fills the screen best</span></span>}
            <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" hidden onChange={(e) => pick(e.target.files?.[0])} />
          </label>
        )}
        <Field label="Title" hint="Only for you; not shown on the screens.">{(id) => <Input id={id} required value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <ScheduleFields value={schedule} onChange={setSchedule} screens={screens} video={kind === 'video'} />
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!existing && !file}>{existing ? 'Save' : 'Add slide'}</Button>
      </form>
    </Dialog>
  );
}
