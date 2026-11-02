// Photo removal requests from the website. Someone who unlocked the gallery with their email
// asks for a photo to come down and says why. Requests for the same photo are handled
// together: approving deletes the photo (album, website and screens), declining keeps it.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ExternalLink, Flag, Globe, Monitor, Trash2, X } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Badge, Button, Dialog, Empty, Field, Segmented, Textarea, useConfirm, useToast } from '@/components/ui';
import { closeRemovalRequests, deletePhotos, getPhotos, listAdminNames, listAlbums, listRemovalRequests } from '@/lib/data';
import { albumName, cn, formatDate, relativeTime } from '@/lib/format';
import { photoUrl } from '@/lib/media';
import { useLoad } from '@/lib/useLoad';
import type { Album, Photo, RemovalReason, RemovalRequest } from '@/types';

export const REASONS: Record<RemovalReason, string> = {
  me: 'In the photo',
  friend: 'For someone in it',
  inappropriate: 'Inappropriate',
  other: 'Other',
};

interface Group { key: string; photo: Photo | null; album: Album | undefined; requests: RemovalRequest[] }

export function Removals() {
  const [tab, setTab] = useState<'open' | 'handled'>('open');
  const { data, reload } = useLoad(async () => {
    const [requests, albums, admins] = await Promise.all([listRemovalRequests(), listAlbums(), listAdminNames().catch(() => [])]);
    const photos = await getPhotos([...new Set(requests.flatMap((r) => (r.photo_id ? [r.photo_id] : [])))]);
    return {
      requests,
      albums: new Map(albums.map((a) => [a.id, a])),
      photos: new Map(photos.map((p) => [p.id, p])),
      admins: new Map(admins.map((a) => [a.user_id, a.name || a.email])),
    };
  });

  const groups = useMemo(() => {
    if (!data) return { open: [] as Group[], handled: [] as RemovalRequest[] };
    const open = new Map<string, Group>();
    for (const r of data.requests.filter((x) => x.status === 'open')) {
      const key = r.photo_id ?? r.id;
      if (!open.has(key)) open.set(key, { key, photo: (r.photo_id && data.photos.get(r.photo_id)) || null, album: r.album_id ? data.albums.get(r.album_id) : undefined, requests: [] });
      open.get(key)!.requests.push(r);
    }
    // Oldest first: whoever has been waiting longest.
    const list = [...open.values()].sort((a, b) => a.requests.at(-1)!.created_at.localeCompare(b.requests.at(-1)!.created_at));
    return { open: list, handled: data.requests.filter((x) => x.status !== 'open') };
  }, [data]);

  return (
    <>
      <PageHeader title="Removal requests" subtitle="People on the website asking for a photo to come down. Approving removes it from the album, the website and the screens." />
      <Segmented
        value={tab}
        onChange={setTab}
        className="mb-6"
        options={[
          { value: 'open', label: <>To review {groups.open.length > 0 && <span className="ml-1 rounded-full bg-bad px-1.5 text-[11px] text-white">{groups.open.length}</span>}</> },
          { value: 'handled', label: 'Handled' },
        ]}
      />
      {!data ? <div className="skeleton h-64 rounded-2xl" />
        : tab === 'open'
          ? groups.open.length === 0
            ? <Empty icon={<Check />} title="Nothing to review" body="Every photo on the website has a “Request removal” button. New requests show up here." />
            : <div className="grid gap-4 xl:grid-cols-2">{groups.open.map((g) => <OpenCard key={g.key} group={g} onDone={reload} />)}</div>
          : groups.handled.length === 0
            ? <Empty icon={<Flag />} title="Nothing handled yet" />
            : <Handled requests={groups.handled} data={data} />}
    </>
  );
}

function OpenCard({ group, onDone }: { group: Group; onDone: () => void }) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [declining, setDeclining] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [busy, setBusy] = useState(false);
  const { photo, album, requests } = group;
  const ids = requests.map((r) => r.id);
  const onWeb = !!photo && !!album && album.status === 'published' && album.show_on_web && !photo.hidden_web;
  const onScreens = !!photo && !!album && album.status === 'published' && album.screen_mode !== 'hidden' && !photo.hidden_screen;

  const approve = async () => {
    if (!photo) {
      await closeRemovalRequests(ids, 'done').then(onDone, (e) => toast(e.message, 'bad'));
      return;
    }
    const ok = await confirm(
      'Remove this photo?',
      `It’s deleted from ${album ? `“${albumName(album)}”` : 'its album'}, taken off the website and off the screens within a minute. ${requests.length > 1 ? `All ${requests.length} requests are` : 'The request is'} marked as done. This can’t be undone.`,
      'Remove photo',
    );
    if (!ok) return;
    setBusy(true);
    try {
      // Deleting the photo closes every open request for it (database trigger).
      await deletePhotos([photo]);
      toast('Photo removed everywhere');
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="panel grid gap-4 p-4 sm:grid-cols-[200px_minmax(0,1fr)]">
      <button
        onClick={() => photo && setZoom(true)}
        className="relative aspect-square overflow-hidden rounded-xl bg-ink-800 sm:aspect-[4/5]"
        aria-label="View photo larger"
        disabled={!photo}
      >
        {photo ? <img src={photoUrl(photo.album_id, photo.id, 400, photo.format)} alt="" className="size-full object-cover" />
          : <span className="grid size-full place-items-center p-4 text-center text-[12.5px] text-mute">Photo already deleted</span>}
      </button>

      <div className="grid min-w-0 content-start gap-3">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {album ? <Link to={`/albums/${album.id}`} className="font-semibold hover:text-gold">{albumName(album)}</Link> : <span className="font-semibold text-mute">Album deleted</span>}
            {album && <span className="text-[12.5px] text-mute">{formatDate(album.event_date, { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
          </div>
          {photo && (
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={onWeb ? 'gold' : undefined}><Globe className="size-3" /> {onWeb ? 'On the website' : 'Not on the website'}</Badge>
              <Badge tone={onScreens ? 'gold' : undefined}><Monitor className="size-3" /> {onScreens ? 'On the screens' : 'Not on the screens'}</Badge>
            </div>
          )}
        </div>

        <ul className="grid gap-2">
          {requests.map((r) => (
            <li key={r.id} className="rounded-xl border border-line bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate font-medium">{r.email}</span>
                {r.reason_type && <Badge tone="bad">{REASONS[r.reason_type]}</Badge>}
                <span className="ml-auto text-[12px] text-mute" title={new Date(r.created_at).toLocaleString('en-US')}>{relativeTime(r.created_at)}</span>
              </div>
              {r.reason && <p className="mt-1.5 text-[13.5px] leading-snug text-white/85">“{r.reason}”</p>}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2">
          <Button variant="danger" size="sm" icon={<Trash2 className="size-4" />} loading={busy} onClick={approve}>
            {photo ? 'Approve & remove' : 'Close request'}
          </Button>
          {photo && <Button variant="ghost" size="sm" icon={<X className="size-4" />} onClick={() => setDeclining(true)}>Decline</Button>}
          {album && photo && (
            <Link to={`/albums/${album.id}`} className="ml-auto"><Button variant="ghost" size="sm" icon={<ExternalLink className="size-4" />}>Album</Button></Link>
          )}
        </div>
      </div>

      {photo && (
        <Dialog open={zoom} onClose={() => setZoom(false)} title={album ? albumName(album) : 'Photo'} wide>
          <img src={photoUrl(photo.album_id, photo.id, 1080, photo.format)} alt="" className="mx-auto max-h-[70vh] rounded-lg object-contain" />
        </Dialog>
      )}
      <DeclineDialog
        open={declining}
        count={requests.length}
        onClose={() => setDeclining(false)}
        onDecline={async (note) => {
          await closeRemovalRequests(ids, 'rejected', note);
          setDeclining(false);
          toast('Declined. The photo stays up.');
          onDone();
        }}
      />
      {dialog}
    </article>
  );
}

function DeclineDialog({ open, count, onClose, onDecline }: { open: boolean; count: number; onClose: () => void; onDecline: (note: string) => Promise<void> }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={count > 1 ? `Decline ${count} requests?` : 'Decline this request?'}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={async () => { setBusy(true); try { await onDecline(note); setNote(''); } catch (e) { toast((e as Error).message, 'bad'); } finally { setBusy(false); } }}>Decline</Button>
      </>}
    >
      <p className="mb-4 text-white/80">The photo stays on the website and the screens.</p>
      <Field label="Note for the team (optional)" hint="Why it stays up, for whoever looks at this later.">
        {(id) => <Textarea id={id} rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
    </Dialog>
  );
}

function Handled({ requests, data }: { requests: RemovalRequest[]; data: { albums: Map<string, Album>; photos: Map<string, Photo>; admins: Map<string, string> } }) {
  return (
    <div className="panel divide-y divide-line overflow-hidden">
      {requests.map((r) => {
        const photo = r.photo_id ? data.photos.get(r.photo_id) : undefined;
        const album = r.album_id ? data.albums.get(r.album_id) : undefined;
        const by = r.handled_by ? data.admins.get(r.handled_by) : undefined;
        return (
          <div key={r.id} className="flex gap-3 px-4 py-3">
            <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-ink-800">
              {photo && <img src={photoUrl(photo.album_id, photo.id, 400, photo.format)} alt="" className="size-full object-cover" />}
            </div>
            <div className="grid min-w-0 flex-1 gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{r.email}</span>
                {r.status === 'done' ? <Badge tone="ok">Removed</Badge> : <Badge>Declined</Badge>}
                {r.reason_type && <span className="text-[12px] text-mute">{REASONS[r.reason_type]}</span>}
              </div>
              <span className={cn('truncate text-[12.5px] text-mute')}>
                {album ? albumName(album) : 'Album deleted'} · asked {relativeTime(r.created_at)}
                {r.handled_at && ` · ${r.status === 'done' ? 'removed' : 'declined'} ${relativeTime(r.handled_at)}`}{by && ` by ${by}`}
              </span>
              {r.reason && <span className="truncate text-[12.5px] text-white/70">“{r.reason}”</span>}
              {r.decision_note && <span className="text-[12.5px] text-white/70">Note: {r.decision_note}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
