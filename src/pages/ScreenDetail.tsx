import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, ExternalLink, Monitor, MonitorOff, Pause, Play, RotateCw, SkipBack, SkipForward, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { playerAddress } from './Screens';
import { Badge, Button, Field, IconButton, Input, Segmented, Spinner, Switch, useConfirm, useToast } from '@/components/ui';
import { deleteScreen, getScreen, listScreens, removeScreenBackground, updateScreen, uploadScreenBackground } from '@/lib/data';
import { albumName, formatDate, plural } from '@/lib/format';
import { publicUrl } from '@/lib/media';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { useRemote } from '@/lib/useRemote';
import type { Playlist, Screen, Transition } from '@/types';

export function ScreenDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data: screen, set, loading } = useLoad(() => getScreen(id!), [id]);
  const { data: playlist, reload: reloadPlaylist } = useLoad(async () => (await supabase.rpc('screen_playlist', { p_screen_id: id })).data as Playlist | null, [id, screen?.content_version]);
  const { data: legacy } = useLoad(async () => {
    const [{ data }, screens] = await Promise.all([supabase.from('slideshows').select('id, title').order('created_at'), listScreens()]);
    return { slideshows: (data ?? []) as { id: string; title: string }[], screens };
  });
  const { players, send } = useRemote(id);
  const [draft, setDraft] = useState<Partial<Screen>>({});
  useEffect(() => setDraft({}), [id]);
  const backgroundInput = useRef<HTMLInputElement>(null);

  if (loading && !screen) return <div className="grid place-items-center py-24"><Spinner /></div>;
  if (!screen) return null;

  const value = { ...screen, ...draft };
  const dirty = Object.keys(draft).length > 0;
  const lead = players[0];
  const address = playerAddress(value);
  const photoCount = playlist?.albums.reduce((n, a) => n + a.photos.length, 0) ?? 0;

  const save = async (patch: Partial<Screen> = draft, message = 'Screen saved') => {
    try {
      const saved = await updateScreen(screen.id, patch);
      set(saved);
      setDraft({});
      reloadPlaylist();
      toast(message);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'bad');
    }
  };

  const setBackground = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return toast('Use a JPG, PNG or WebP image', 'bad');
    try {
      const path = await uploadScreenBackground(screen.id, file);
      await save({ background_path: path }, 'Background saved');
      if (screen.background_path) await removeScreenBackground(screen.background_path);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not upload', 'bad');
    }
  };
  const clearBackground = async () => {
    const old = screen.background_path;
    await save({ background_path: null }, 'Background removed');
    if (old) await removeScreenBackground(old);
  };

  return (
    <>
      <PageHeader
        back={<Link to="/screens" className="inline-flex items-center gap-1.5 text-[13px] text-mute hover:text-white"><ArrowLeft className="size-4" />Screens</Link>}
        title={screen.name}
        subtitle={players.length ? <Badge tone="ok" dot>{players.length > 1 ? `${players.length} TVs online` : 'Online'}</Badge> : <Badge dot>Offline</Badge>}
        actions={<a href={address} target="_blank" rel="noreferrer"><Button icon={<ExternalLink className="size-4" />}>Open player</Button></a>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          <section className="panel overflow-hidden">
            <div className="relative grid aspect-video place-items-center bg-black">
              {lead?.black ? <span className="text-mute">Screen is blacked out</span>
                : lead?.now?.src ? <img src={lead.now.src} alt="" className="size-full object-contain" />
                : <span className="grid place-items-center gap-2 text-mute"><Monitor className="size-7" />{players.length ? 'Playing' : 'No TV connected'}</span>}
              {lead?.now && !lead.black && (
                <span className="absolute bottom-3 left-3 rounded-lg bg-ink-950/80 px-2.5 py-1 text-[12px] backdrop-blur">
                  {lead.now.kind === 'promo' ? `Promo · ${lead.now.title}` : lead.now.album} · {lead.index + 1}/{lead.total}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 p-4">
              <IconButton label="Previous" variant="secondary" disabled={!lead} onClick={() => send('previous')}><SkipBack className="size-5" /></IconButton>
              <Button variant="primary" className="w-28" disabled={!lead} icon={lead?.playing === false ? <Play className="size-4" /> : <Pause className="size-4" />} onClick={() => send(lead?.playing === false ? 'play' : 'pause')}>
                {lead?.playing === false ? 'Play' : 'Pause'}
              </Button>
              <IconButton label="Next" variant="secondary" disabled={!lead} onClick={() => send('next')}><SkipForward className="size-5" /></IconButton>
              <span className="mx-1 h-6 w-px bg-line" />
              <Button variant={lead?.black ? 'primary' : 'secondary'} disabled={!lead} icon={<MonitorOff className="size-4" />} onClick={() => send(lead?.black ? 'unblack' : 'black')}>
                {lead?.black ? 'Turn back on' : 'Black screen'}
              </Button>
              <IconButton label="Reload player" variant="secondary" disabled={!lead} onClick={() => { send('reload'); toast('Reloading the player'); }}><RotateCw className="size-4" /></IconButton>
            </div>
          </section>

          <section className="panel grid gap-3 p-5">
            <h2 className="label">Playing now</h2>
            {playlist ? (
              <>
                <p className="text-white/80">{plural(playlist.albums.length, 'album')} · {plural(photoCount, 'photo')} · {plural(playlist.promos.length, 'promo slide')}</p>
                <ul className="grid gap-1.5 text-[13px]">
                  {playlist.albums.map((a) => (
                    <li key={a.id} className="flex justify-between gap-3 border-t border-line pt-1.5">
                      <Link to={`/albums/${a.id}`} className="truncate hover:text-gold">{albumName(a)}</Link>
                      <span className="shrink-0 text-mute">{formatDate(a.event_date, { month: 'short', day: 'numeric' })} · {a.photos.length}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : <Spinner />}
          </section>
        </div>

        <div className="grid content-start gap-6">
          <section className="panel grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 p-5">
            <h2 className="label">TV address</h2>
            <div className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-ink-850 py-1 pl-3.5 pr-1">
              <code className="min-w-0 flex-1 truncate text-[13px] text-white/80">{address.replace(/^https?:\/\//, '')}</code>
              <IconButton label="Copy address" className="size-9" onClick={() => navigator.clipboard.writeText(address).then(() => toast('Address copied'))}><Copy className="size-4" /></IconButton>
            </div>
            {legacy && legacy.slideshows.length > 0 && (
              <Field label="Existing TV link" hint="Pick the old slideshow a TV already opens: that same address then plays this screen. Nothing to change on the TV.">
                {(fid) => (
                  <select
                    id={fid}
                    className="field"
                    value={value.legacy_slideshow_id ?? ''}
                    onChange={(e) => save({ legacy_slideshow_id: e.target.value || null }, e.target.value ? 'TV link switched to this screen' : 'TV link released')}
                  >
                    <option value="">None (use this screen’s own address)</option>
                    {legacy.slideshows.map((s) => {
                      const taken = legacy.screens.find((x) => x.legacy_slideshow_id === s.id && x.id !== screen.id);
                      return <option key={s.id} value={s.id} disabled={!!taken}>{s.title}{taken ? ` (used by ${taken.name})` : ''}</option>;
                    })}
                  </select>
                )}
              </Field>
            )}
          </section>

          <section className="panel grid gap-4 p-5">
            <h2 className="label">What it plays</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Newest albums">{(fid) => <Input id={fid} type="number" min={1} max={50} value={value.max_albums} onChange={(e) => setDraft({ ...draft, max_albums: Number(e.target.value) })} />}</Field>
              <Field label="From the last">
                {(fid) => (
                  <div className="relative">
                    <Input id={fid} type="number" min={1} max={365} value={value.max_days} onChange={(e) => setDraft({ ...draft, max_days: Number(e.target.value) })} className="pr-12" />
                    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-mute">days</span>
                  </div>
                )}
              </Field>
            </div>
            <Field label="Seconds per photo">{(fid) => <Input id={fid} type="number" min={2} max={60} step={0.5} value={value.photo_seconds} onChange={(e) => setDraft({ ...draft, photo_seconds: Number(e.target.value) })} />}</Field>
            <div className="grid gap-1.5">
              <span className="text-[13px] font-medium text-white/85">Transition</span>
              <Segmented<Transition>
                value={value.transition}
                onChange={(v) => setDraft({ ...draft, transition: v })}
                className="w-full"
                options={[{ value: 'fade', label: 'Fade' }, { value: 'slide', label: 'Slide' }, { value: 'zoom', label: 'Zoom' }, { value: 'none', label: 'Cut' }]}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fade length">
                {(fid) => (
                  <div className="relative">
                    <Input id={fid} type="number" min={0.2} max={3} step={0.1} disabled={value.transition !== 'fade'} value={value.transition_seconds} onChange={(e) => setDraft({ ...draft, transition_seconds: Number(e.target.value) })} className="pr-12" />
                    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-mute">sec</span>
                  </div>
                )}
              </Field>
              <Field label="Space around photos">
                {(fid) => (
                  <div className="relative">
                    <Input id={fid} type="number" min={0} max={20} step={0.5} value={value.margin_percent} onChange={(e) => setDraft({ ...draft, margin_percent: Number(e.target.value) })} className="pr-12" />
                    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-mute">%</span>
                  </div>
                )}
              </Field>
            </div>
            <div className="grid gap-1.5">
              <span className="text-[13px] font-medium text-white/85">Background image</span>
              {value.background_path && <img src={publicUrl(value.background_path)} alt="" className="aspect-video w-full rounded-xl object-cover" />}
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => backgroundInput.current?.click()}>{value.background_path ? 'Replace' : 'Add image'}</Button>
                {value.background_path && <Button variant="ghost" onClick={clearBackground}>Remove</Button>}
              </div>
              <input ref={backgroundInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { setBackground(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
            <Switch label="Shuffle photos" description="Mix photos from all albums instead of playing night by night." checked={value.shuffle} onChange={(v) => setDraft({ ...draft, shuffle: v })} />
            <Switch label="Show album names" description="Name and date of the night in the corner." checked={value.show_album_titles} onChange={(v) => setDraft({ ...draft, show_album_titles: v })} />
            <Field label="Name">{(fid) => <Input id={fid} value={value.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}</Field>
            {dirty && <div className="flex gap-2"><Button variant="primary" onClick={() => save()}>Save</Button><Button variant="ghost" onClick={() => setDraft({})}>Cancel</Button></div>}
          </section>

          <Button
            variant="ghost"
            className="justify-start text-bad hover:bg-bad/10 hover:text-bad"
            icon={<Trash2 className="size-4" />}
            onClick={async () => {
              if (!(await confirm('Delete this screen?', 'TVs using its address will stop playing.'))) return;
              await deleteScreen(screen.id).then(() => navigate('/screens'), (e) => toast(e.message, 'bad'));
            }}
          >
            Delete screen
          </Button>
        </div>
      </div>
      {dialog}
    </>
  );
}
