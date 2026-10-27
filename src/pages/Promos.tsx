import { useEffect, useState, type FormEvent } from 'react';
import { CalendarRange, Film, Megaphone, Pencil, Plus, Trash2, UploadCloud } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Badge, Button, Dialog, Empty, Field, IconButton, Input, Switch, useConfirm, useToast } from '@/components/ui';
import { createPromo, deletePromo, listPromos, listScreens, updatePromo } from '@/lib/data';
import { arubaToday, cn, formatDate } from '@/lib/format';
import { publicUrl } from '@/lib/media';
import { useLoad } from '@/lib/useLoad';
import type { Promo, Screen } from '@/types';

type State = 'running' | 'scheduled' | 'off';
const stateOf = (p: Promo, today = arubaToday()): State =>
  !p.active || (p.ends_on && p.ends_on < today) ? 'off' : p.starts_on && p.starts_on > today ? 'scheduled' : 'running';

const short = (d: string) => formatDate(d, { month: 'short', day: 'numeric' });
const dateRange = (p: Promo) =>
  p.starts_on && p.ends_on ? `${short(p.starts_on)} – ${short(p.ends_on)}`
    : p.starts_on ? `From ${short(p.starts_on)}`
    : p.ends_on ? `Until ${short(p.ends_on)}`
    : 'No end date';

export function Promos() {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data, loading, set } = useLoad(async () => ({ promos: await listPromos(), screens: await listScreens() }));
  const [editing, setEditing] = useState<Promo | 'new' | null>(null);

  const groups: { key: State; title: string }[] = [
    { key: 'running', title: 'Running now' },
    { key: 'scheduled', title: 'Scheduled' },
    { key: 'off', title: 'Off or ended' },
  ];

  const save = async (promo: Promo, patch: Partial<Promo>) => {
    set((d) => d && { ...d, promos: d.promos.map((p) => (p.id === promo.id ? { ...p, ...patch } : p)) });
    try {
      await updatePromo(promo.id, patch);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'bad');
    }
  };

  return (
    <>
      <PageHeader
        title="Promo slides"
        subtitle="Flyers and videos for upcoming events, mixed in between the photos on the screens."
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>New promo</Button>}
      />

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-72 rounded-2xl" />)}</div>
      ) : !data?.promos.length ? (
        <Empty
          icon={<Megaphone />}
          title="No promo slides yet"
          body="Upload an event flyer or a short video. Set the dates and it switches itself on and off."
          action={<Button variant="primary" onClick={() => setEditing('new')}>New promo</Button>}
        />
      ) : (
        <div className="grid gap-10">
          {groups.map(({ key, title }) => {
            const list = data.promos.filter((p) => stateOf(p) === key);
            if (!list.length) return null;
            return (
              <section key={key} className="grid gap-4">
                <h2 className="label">{title} · {list.length}</h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((p) => (
                    <article key={p.id} className={cn('panel overflow-hidden', key === 'off' && 'opacity-60')}>
                      <div className="relative aspect-video bg-black">
                        {p.kind === 'video'
                          ? <video src={publicUrl(p.path)} muted playsInline loop preload="metadata" className="size-full object-contain" onMouseEnter={(e) => e.currentTarget.play()} onMouseLeave={(e) => e.currentTarget.pause()} />
                          : <img src={publicUrl(p.path)} alt="" loading="lazy" className="size-full object-contain" />}
                        <div className="absolute left-2.5 top-2.5 flex gap-1.5">
                          {key === 'running' && <Badge tone="ok" dot className="bg-ink-950/80 backdrop-blur">Live</Badge>}
                          {key === 'scheduled' && <Badge tone="gold" className="bg-ink-950/80 backdrop-blur">Scheduled</Badge>}
                          {p.kind === 'video' && <Badge className="bg-ink-950/80 backdrop-blur"><Film className="size-3" />Video</Badge>}
                        </div>
                      </div>
                      <div className="grid gap-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate font-sans text-[15px] font-semibold tracking-normal">{p.title}</h3>
                            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-mute"><CalendarRange className="size-3.5" />{dateRange(p)}</p>
                          </div>
                          <div className="flex shrink-0">
                            <IconButton label="Edit" className="size-9" onClick={() => setEditing(p)}><Pencil className="size-4" /></IconButton>
                            <IconButton
                              label="Delete"
                              className="size-9 hover:text-bad"
                              onClick={async () => {
                                if (!(await confirm('Delete this promo?', `“${p.title}” will be removed from the screens.`))) return;
                                set((d) => d && { ...d, promos: d.promos.filter((x) => x.id !== p.id) });
                                await deletePromo(p).catch((e) => toast(e.message, 'bad'));
                              }}
                            >
                              <Trash2 className="size-4" />
                            </IconButton>
                          </div>
                        </div>
                        <p className="text-[12.5px] text-white/60">
                          After every {p.every_n} photos · {p.kind === 'video' ? 'plays to the end' : `${p.duration_seconds} s on screen`}
                          {p.screen_ids?.length ? ` · ${p.screen_ids.length} screen${p.screen_ids.length > 1 ? 's' : ''}` : ''}
                        </p>
                        <Switch label="Active" checked={p.active} onChange={(v) => save(p, { active: v })} />
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
        promo={editing}
        screens={data?.screens ?? []}
        onClose={() => setEditing(null)}
        onSaved={(p, isNew) => set((d) => d && { ...d, promos: isNew ? [p, ...d.promos] : d.promos.map((x) => (x.id === p.id ? p : x)) })}
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
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [everyN, setEveryN] = useState(8);
  const [seconds, setSeconds] = useState(10);
  const [screenIds, setScreenIds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!promo) return;
    setFile(null);
    setPreview(existing ? publicUrl(existing.path) : null);
    setTitle(existing?.title ?? '');
    setStartsOn(existing?.starts_on ?? '');
    setEndsOn(existing?.ends_on ?? '');
    setEveryN(existing?.every_n ?? 8);
    setSeconds(existing?.duration_seconds ?? 10);
    setScreenIds(existing?.screen_ids ?? null);
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
    setBusy(true);
    const fields = {
      title: title.trim(),
      starts_on: startsOn || null,
      ends_on: endsOn || null,
      every_n: everyN,
      duration_seconds: seconds,
      screen_ids: screenIds?.length ? screenIds : null,
    };
    try {
      if (existing) onSaved(await updatePromo(existing.id, fields), false);
      else onSaved(await createPromo(file!, { ...fields, active: true }), true);
      toast(existing ? 'Promo saved' : 'Promo added');
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!promo} onClose={onClose} title={existing ? 'Edit promo' : 'New promo'}>
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">{(id) => <Input id={id} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />}</Field>
          <Field label="End date">{(id) => <Input id={id} type="date" min={startsOn || undefined} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />}</Field>
        </div>
        <p className="-mt-2 text-[12.5px] text-mute">Leave empty to start now and run until you switch it off. Tip: end on the night of the event.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Show after every">
            {(id) => (
              <div className="relative">
                <Input id={id} type="number" min={1} max={100} required value={everyN} onChange={(e) => setEveryN(Number(e.target.value))} className="pr-16" />
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-mute">photos</span>
              </div>
            )}
          </Field>
          {kind === 'image' && (
            <Field label="On screen for">
              {(id) => (
                <div className="relative">
                  <Input id={id} type="number" min={3} max={120} required value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} className="pr-16" />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-mute">seconds</span>
                </div>
              )}
            </Field>
          )}
        </div>
        {screens.length > 1 && (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-[13px] font-medium text-white/85">Screens</legend>
            <Switch label="All screens" checked={!screenIds} onChange={(v) => setScreenIds(v ? null : [])} />
            {screenIds && screens.map((s) => (
              <label key={s.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                <input type="checkbox" className="size-4 accent-[#e4b11a]" checked={screenIds.includes(s.id)} onChange={(e) => setScreenIds(e.target.checked ? [...screenIds, s.id] : screenIds.filter((x) => x !== s.id))} />
                {s.name}
              </label>
            ))}
          </fieldset>
        )}
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!existing && !file}>{existing ? 'Save' : 'Add promo'}</Button>
      </form>
    </Dialog>
  );
}
