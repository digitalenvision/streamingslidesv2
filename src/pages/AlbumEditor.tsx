import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDownAZ, ArrowLeft, ChevronLeft, ChevronRight, Clock, Download, ExternalLink, Eye, EyeOff, ImagePlus, Monitor,
  MonitorOff, Star, Trash2, UploadCloud, X,
} from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { PhotoGrid } from '@/components/PhotoGrid';
import { Badge, Button, Dialog, Empty, Field, IconButton, Input, Segmented, Spinner, Switch, Textarea, useConfirm, useToast } from '@/components/ui';
import {
  deleteAlbum, deletePhotos, downloadUrl, getAlbum, listAlbums, listPhotos, listScreens, reorderPhotos, updateAlbum, updatePhotos,
} from '@/lib/data';
import { cn, daysAgo, formatDate, plural } from '@/lib/format';
import { photoUrl } from '@/lib/media';
import { albumsOnScreen } from '@/lib/screenRules';
import { ACCEPTED, uploadPhotos, type UploadTask } from '@/lib/upload';
import { useLoad } from '@/lib/useLoad';
import type { Album, Photo, ScreenMode } from '@/types';

const WEBSITE = import.meta.env.VITE_WEBSITE_URL || 'https://gustoaruba.com';

export function AlbumEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();

  const { data, loading, error, set } = useLoad(async () => {
    const [album, photos, albums, screens] = await Promise.all([getAlbum(id!), listPhotos(id!), listAlbums(), listScreens()]);
    return { album, photos, albums, screen: screens[0] };
  }, [id]);

  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Photo | null>(null);
  const [tab, setTab] = useState<'photos' | 'settings'>('photos');
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const uploading = tasks.some((t) => t.state !== 'done' && t.state !== 'error');

  const album = data?.album;
  const photos = data?.photos ?? [];
  const patchAlbum = (patch: Partial<Album>) => set((d) => d && { ...d, album: { ...d.album, ...patch } });
  const setPhotos = (fn: (p: Photo[]) => Photo[]) => set((d) => d && { ...d, photos: fn(d.photos) });

  // Leaving mid-upload would lose the queue.
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [uploading]);

  const addFiles = useCallback(async (list: FileList | File[]) => {
    if (!album) return;
    const files = [...list].filter((f) => ACCEPTED.includes(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    if (!files.length) return toast('Only photos (JPG, PNG, WebP or HEIC) can be added', 'bad');
    setTab('photos');
    const start = Math.max(0, ...photos.map((p) => p.position));
    const added = await uploadPhotos(album.id, files, start, (t) => {
      setTasks(t);
      const done = t.flatMap((x) => (x.state === 'done' && x.photo ? [x.photo] : []));
      setPhotos((prev) => [...prev, ...done.filter((p) => !prev.some((q) => q.id === p.id))]);
    });
    const failed = files.length - added.length;
    toast(failed ? `${plural(added.length, 'photo')} added, ${failed} failed` : `${plural(added.length, 'photo')} added`, failed ? 'bad' : 'ok');
    const fresh = await getAlbum(album.id);
    patchAlbum({ photo_count: fresh.photo_count, cover_photo_id: fresh.cover_photo_id });
    setTasks((t) => t.filter((x) => x.state === 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [album, photos]);

  // Drop files anywhere on the page.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => { if (hasFiles(e)) { depth++; setDragging(true); } };
    const leave = (e: DragEvent) => { if (hasFiles(e) && --depth <= 0) { depth = 0; setDragging(false); } };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [addFiles]);

  const save = async (patch: Partial<Album>, message?: string) => {
    if (!album) return;
    const before = album;
    patchAlbum(patch);
    try {
      const saved = await updateAlbum(album.id, patch);
      patchAlbum(saved);
      if (message) toast(message);
    } catch (err) {
      patchAlbum(before);
      toast(err instanceof Error ? err.message : 'Could not save', 'bad');
    }
  };

  const chosen = photos.filter((p) => selected.has(p.id));

  const setHidden = async (list: Photo[], patch: Partial<Pick<Photo, 'hidden_web' | 'hidden_screen'>>) => {
    const ids = list.map((p) => p.id);
    setPhotos((prev) => prev.map((p) => (ids.includes(p.id) ? { ...p, ...patch } : p)));
    if (open && ids.includes(open.id)) setOpen({ ...open, ...patch });
    try {
      await updatePhotos(ids, patch);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'bad');
    }
  };

  const remove = async (list: Photo[]) => {
    const ok = await confirm(
      list.length === 1 ? 'Delete this photo?' : `Delete ${list.length} photos?`,
      'They disappear from the website and the screens, and the download copies are deleted too.',
    );
    if (!ok) return;
    const ids = new Set(list.map((p) => p.id));
    setPhotos((prev) => prev.filter((p) => !ids.has(p.id)));
    setSelected(new Set());
    setOpen(null);
    try {
      await deletePhotos(list);
      const fresh = await getAlbum(album!.id);
      patchAlbum({ photo_count: fresh.photo_count, cover_photo_id: fresh.cover_photo_id });
      toast(`${plural(list.length, 'photo')} deleted`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete', 'bad');
    }
  };

  const reorder = async (ids: string[]) => {
    const byId = new Map(photos.map((p) => [p.id, p]));
    setPhotos(() => ids.map((id, i) => ({ ...byId.get(id)!, position: i + 1 })));
    try {
      await reorderPhotos(album!.id, ids);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save the order', 'bad');
    }
  };

  const sortBy = (how: 'time' | 'name') => {
    const sorted = [...photos].sort((a, b) =>
      how === 'time'
        ? (a.taken_at ?? '').localeCompare(b.taken_at ?? '') || (a.original_name ?? '').localeCompare(b.original_name ?? '', undefined, { numeric: true })
        : (a.original_name ?? '').localeCompare(b.original_name ?? '', undefined, { numeric: true }),
    );
    reorder(sorted.map((p) => p.id));
    toast(how === 'time' ? 'Sorted by time taken' : 'Sorted by file name');
  };

  const download = async (photo: Photo) => {
    try {
      window.location.href = await downloadUrl(photo);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Download failed', 'bad');
    }
  };

  if (error) return <Empty icon={<X />} title="Album not found" body={error} action={<Link to="/albums"><Button>Back to albums</Button></Link>} />;
  if (loading && !data) return <div className="grid place-items-center py-24"><Spinner /></div>;
  if (!album) return null;

  const live = album.status === 'published';
  const done = tasks.filter((t) => t.state === 'done').length;
  const failed = tasks.filter((t) => t.state === 'error');

  const settings = (
    <AlbumSettings
      album={album}
      onScreens={albumsOnScreen(data!.albums.map((a) => (a.id === album.id ? album : a)), data!.screen).has(album.id)}
      screen={data!.screen}
      onSave={save}
      onDelete={async () => {
        const ok = await confirm('Delete this album?', <>“{album.title}” and all {plural(album.photo_count, 'photo')} will be deleted from the website, the screens and storage. This can’t be undone.</>, 'Delete album');
        if (!ok) return;
        try {
          await deleteAlbum(album);
          toast('Album deleted');
          navigate('/albums');
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Could not delete', 'bad');
        }
      }}
    />
  );

  return (
    <>
      <PageHeader
        back={<Link to="/albums" className="inline-flex items-center gap-1.5 text-[13px] text-mute hover:text-white"><ArrowLeft className="size-4" />Albums</Link>}
        title={album.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {formatDate(album.event_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            <span className="text-white/25">·</span>
            {plural(album.photo_count, 'photo')}
            {live ? <Badge tone="ok" dot>Published</Badge> : <Badge tone="warn" dot>Draft</Badge>}
          </span>
        }
        actions={
          <>
            {live && album.show_on_web && (
              <a href={`${WEBSITE}/gallery/${album.slug}/`} target="_blank" rel="noreferrer">
                <Button variant="ghost" icon={<ExternalLink className="size-4" />}>View on website</Button>
              </a>
            )}
            <Button
              variant={live ? 'secondary' : 'primary'}
              disabled={!live && album.photo_count === 0}
              onClick={() => save({ status: live ? 'draft' : 'published' }, live ? 'Album unpublished' : 'Album published')}
            >
              {live ? 'Unpublish' : 'Publish'}
            </Button>
          </>
        }
      />

      <Segmented
        value={tab}
        onChange={setTab}
        className="mb-5 w-full lg:hidden"
        options={[{ value: 'photos', label: 'Photos' }, { value: 'settings', label: 'Settings' }]}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className={cn('min-w-0', tab !== 'photos' && 'hidden lg:block')} aria-label="Photos">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <Button variant="primary" icon={<ImagePlus className="size-4" />} onClick={() => input.current?.click()}>Add photos</Button>
            {photos.length > 1 && (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" icon={<Clock className="size-4" />} onClick={() => sortBy('time')}>Sort by time</Button>
                <Button variant="ghost" size="sm" icon={<ArrowDownAZ className="size-4" />} onClick={() => sortBy('name')}>By name</Button>
              </div>
            )}
            <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
          </div>

          {tasks.length > 0 && (
            <div className="panel mb-4 grid gap-2.5 p-4">
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="font-medium">{uploading ? `Uploading ${done} of ${tasks.length}` : `${failed.length} photo${failed.length === 1 ? '' : 's'} failed`}</span>
                {!uploading && failed.length > 0 && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" onClick={() => { const files = failed.map((f) => f.file); setTasks([]); addFiles(files); }}>Retry</Button>
                    <Button size="sm" variant="ghost" onClick={() => setTasks([])}>Dismiss</Button>
                  </div>
                )}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gold transition-[width] duration-300" style={{ width: `${(done / tasks.length) * 100}%` }} />
              </div>
              {uploading && <p className="text-[12px] text-mute">Keep this page open until it’s done. Photos are resized on this device first, so uploads stay small.</p>}
            </div>
          )}

          {photos.length === 0 && tasks.length === 0 ? (
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="grid w-full place-items-center gap-3 rounded-2xl border-2 border-dashed border-white/15 px-6 py-20 text-center transition-colors hover:border-gold/60 hover:bg-gold/[0.03]"
            >
              <UploadCloud className="size-9 text-gold" />
              <span className="grid gap-1">
                <span className="text-[16px] font-semibold">Drop the night’s photos here</span>
                <span className="text-mute">or tap to choose them. Hundreds at once is fine.</span>
              </span>
            </button>
          ) : (
            <PhotoGrid
              photos={photos}
              pending={tasks}
              coverId={album.cover_photo_id}
              selected={selected}
              onSelect={setSelected}
              onOpen={setOpen}
              onReorder={reorder}
            />
          )}
        </section>

        <aside className={cn('lg:sticky lg:top-8 lg:self-start', tab !== 'settings' && 'hidden lg:block')} aria-label="Album settings">{settings}</aside>
      </div>

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 md:bottom-6 md:pl-[240px]">
          <div className="flex max-w-full animate-fade-up items-center gap-1 overflow-x-auto rounded-2xl border border-line bg-ink-700 p-1.5 shadow-pop">
            <span className="px-3 font-semibold">{selected.size} selected</span>
            {chosen.length === 1 && <IconButton label="Make cover" onClick={() => { save({ cover_photo_id: chosen[0].id }, 'Cover updated'); setSelected(new Set()); }}><Star className="size-[18px]" /></IconButton>}
            <IconButton label={chosen.every((p) => p.hidden_web) ? 'Show on website' : 'Hide on website'} onClick={() => setHidden(chosen, { hidden_web: !chosen.every((p) => p.hidden_web) })}>
              {chosen.every((p) => p.hidden_web) ? <Eye className="size-[18px]" /> : <EyeOff className="size-[18px]" />}
            </IconButton>
            <IconButton label={chosen.every((p) => p.hidden_screen) ? 'Show on screens' : 'Hide on screens'} onClick={() => setHidden(chosen, { hidden_screen: !chosen.every((p) => p.hidden_screen) })}>
              {chosen.every((p) => p.hidden_screen) ? <Monitor className="size-[18px]" /> : <MonitorOff className="size-[18px]" />}
            </IconButton>
            <IconButton label="Delete" onClick={() => remove(chosen)} className="text-bad hover:text-bad"><Trash2 className="size-[18px]" /></IconButton>
            <span className="mx-1 h-6 w-px bg-line" />
            <IconButton label="Clear selection" onClick={() => setSelected(new Set())}><X className="size-[18px]" /></IconButton>
          </div>
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center bg-ink-950/80 backdrop-blur-sm">
          <div className="grid place-items-center gap-3 rounded-3xl border-2 border-dashed border-gold px-16 py-12 text-center">
            <UploadCloud className="size-10 text-gold" />
            <p className="text-[18px] font-semibold">Drop to add to “{album.title}”</p>
          </div>
        </div>
      )}

      <PhotoViewer
        photo={open}
        photos={photos}
        coverId={album.cover_photo_id}
        onClose={() => setOpen(null)}
        onMove={setOpen}
        actions={(p) => (
          <>
            <Button size="sm" variant="secondary" icon={<Star className={cn('size-4', p.id === album.cover_photo_id && 'fill-gold text-gold')} />} disabled={p.id === album.cover_photo_id} onClick={() => save({ cover_photo_id: p.id }, 'Cover updated')}>Cover</Button>
            <Button size="sm" variant="secondary" icon={p.hidden_web ? <Eye className="size-4" /> : <EyeOff className="size-4" />} onClick={() => setHidden([p], { hidden_web: !p.hidden_web })}>{p.hidden_web ? 'Show on website' : 'Hide on website'}</Button>
            <Button size="sm" variant="secondary" icon={p.hidden_screen ? <Monitor className="size-4" /> : <MonitorOff className="size-4" />} onClick={() => setHidden([p], { hidden_screen: !p.hidden_screen })}>{p.hidden_screen ? 'Show on screens' : 'Hide on screens'}</Button>
            <IconButton label="Download" variant="secondary" className="size-9" onClick={() => download(p)}><Download className="size-4" /></IconButton>
            <IconButton label="Delete" variant="danger" className="size-9" onClick={() => remove([p])}><Trash2 className="size-4" /></IconButton>
          </>
        )}
      />
      {dialog}
    </>
  );
}

function AlbumSettings({ album, onScreens, screen, onSave, onDelete }: {
  album: Album; onScreens: boolean; screen?: { max_days: number; max_albums: number }; onSave: (p: Partial<Album>, msg?: string) => void; onDelete: () => void;
}) {
  const [title, setTitle] = useState(album.title);
  const [date, setDate] = useState(album.event_date);
  const [description, setDescription] = useState(album.description ?? '');
  const [code, setCode] = useState(album.fourvenues_code ?? '');
  useEffect(() => { setTitle(album.title); setDate(album.event_date); setDescription(album.description ?? ''); setCode(album.fourvenues_code ?? ''); }, [album.id]);

  const dirty = title !== album.title || date !== album.event_date || description !== (album.description ?? '') || code !== (album.fourvenues_code ?? '');
  const until = screen && new Date(new Date(`${album.event_date}T12:00:00`).getTime() + screen.max_days * 86_400_000).toISOString().slice(0, 10);

  const screenNote: ReactNode =
    album.status !== 'published' ? 'Publish the album to show it.'
      : album.screen_mode === 'hidden' ? 'Never shown on the screens.'
      : album.screen_mode === 'pinned' ? 'Always on the screens, whatever its age.'
      : onScreens ? <>On the screens until {formatDate(until!, { month: 'short', day: 'numeric' })}.</>
      : screen && daysAgo(album.event_date) > screen.max_days ? `Older than ${screen.max_days} days, so it’s off the screens.`
      : `Not in the ${screen?.max_albums ?? 12} newest albums, so it’s off the screens.`;

  return (
    <div className="grid gap-4">
      <section className="panel grid gap-4 p-5">
        <h2 className="label">Details</h2>
        <Field label="Name">{(id) => <Input id={id} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Date">{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="Description" hint="Optional. Shown above the photos on the website.">
          {(id) => <Textarea id={id} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <Field label="Fourvenues event code" hint="Optional. Links the album and the event page to each other.">
          {(id) => <Input id={id} value={code} placeholder="e.g. 4BZQ-…" onChange={(e) => setCode(e.target.value.trim())} />}
        </Field>
        {dirty && (
          <Button
            variant="primary"
            onClick={() => onSave({ title: title.trim(), event_date: date, description: description.trim() || null, fourvenues_code: code || null }, 'Saved')}
            disabled={!title.trim() || !date}
          >
            Save changes
          </Button>
        )}
      </section>

      <section className="panel grid gap-3 p-5">
        <h2 className="label">Where it shows</h2>
        <Switch
          label="Website gallery"
          description={album.status === 'published' ? (album.show_on_web ? 'Visible on gustoaruba.com/gallery.' : 'Hidden from the website.') : 'Shows once published.'}
          checked={album.show_on_web}
          onChange={(v) => onSave({ show_on_web: v })}
        />
        <div className="h-px bg-line" />
        <div className="grid gap-2">
          <span className="font-medium">TV screens</span>
          <Segmented<ScreenMode>
            value={album.screen_mode}
            onChange={(v) => onSave({ screen_mode: v })}
            size="sm"
            className="w-full"
            options={[{ value: 'auto', label: 'Auto' }, { value: 'pinned', label: 'Always' }, { value: 'hidden', label: 'Never' }]}
          />
          <p className="text-[12.5px] text-mute">{screenNote}</p>
        </div>
      </section>

      <section className="panel grid gap-2 p-5">
        <h2 className="label">Web address</h2>
        <p className="break-all text-[13px] text-white/70">{WEBSITE.replace(/^https?:\/\//, '')}/gallery/{album.slug}/</p>
      </section>

      <Button variant="ghost" className="justify-start text-bad hover:bg-bad/10 hover:text-bad" icon={<Trash2 className="size-4" />} onClick={onDelete}>Delete album</Button>
    </div>
  );
}

function PhotoViewer({ photo, photos, coverId, onClose, onMove, actions }: {
  photo: Photo | null; photos: Photo[]; coverId: string | null; onClose: () => void; onMove: (p: Photo) => void; actions: (p: Photo) => ReactNode;
}) {
  const index = photo ? photos.findIndex((p) => p.id === photo.id) : -1;
  const current = index >= 0 ? photos[index] : null;
  const go = useCallback((d: number) => { const p = photos[index + d]; if (p) onMove(p); }, [photos, index, onMove]);
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, go]);
  const meta = useMemo(() => current && [
    `${index + 1} of ${photos.length}`,
    current.original_name,
    current.taken_at && new Date(current.taken_at).toLocaleTimeString('en-US', { timeZone: 'America/Aruba', hour: 'numeric', minute: '2-digit' }),
    current.id === coverId && 'Cover',
  ].filter(Boolean).join(' · '), [current, index, photos.length, coverId]);

  return (
    <Dialog open={!!current} onClose={onClose} title="Photo" wide>
      {current && (
        <div className="grid gap-4">
          <div className="relative -mx-5 bg-black sm:mx-0 sm:rounded-xl">
            <img
              key={current.id}
              src={photoUrl(current.album_id, current.id, 1080, current.format)}
              alt=""
              style={current.lqip ? { backgroundImage: `url(${current.lqip})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' } : undefined}
              className="mx-auto max-h-[60dvh] w-auto object-contain sm:rounded-xl"
              width={current.width}
              height={current.height}
            />
            {index > 0 && <IconButton label="Previous" variant="secondary" onClick={() => go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-ink-950/70 backdrop-blur"><ChevronLeft className="size-5" /></IconButton>}
            {index < photos.length - 1 && <IconButton label="Next" variant="secondary" onClick={() => go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-ink-950/70 backdrop-blur"><ChevronRight className="size-5" /></IconButton>}
          </div>
          <p className="text-[12.5px] text-mute">{meta}</p>
          <div className="flex flex-wrap gap-2">{actions(current)}</div>
        </div>
      )}
    </Dialog>
  );
}
