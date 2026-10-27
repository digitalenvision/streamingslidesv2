import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Download, Flag, Mail, Search, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Badge, Button, Empty, IconButton, Input, Segmented, useConfirm, useToast } from '@/components/ui';
import { deletePhotos, deleteVisitor, getPhoto, listAlbums, listRemovalRequests, listVisitors, updateRemovalRequest } from '@/lib/data';
import { plural, relativeTime } from '@/lib/format';
import { photoUrl } from '@/lib/media';
import { useLoad } from '@/lib/useLoad';
import type { Photo, RemovalRequest } from '@/types';

export function Visitors() {
  const [tab, setTab] = useState<'emails' | 'removals'>('emails');
  const { data, set } = useLoad(async () => {
    const [visitors, requests, albums] = await Promise.all([listVisitors(), listRemovalRequests(), listAlbums()]);
    return { visitors, requests, albums: new Map(albums.map((a) => [a.id, a])) };
  });
  const open = data?.requests.filter((r) => r.status === 'open').length ?? 0;

  return (
    <>
      <PageHeader title="Gallery emails" subtitle="People who unlocked the website photos, and requests to take a photo down." />
      <Segmented
        value={tab}
        onChange={setTab}
        className="mb-6"
        options={[
          { value: 'emails', label: <>Emails {data && <span className="ml-1 opacity-60">{data.visitors.length.toLocaleString('en-US')}</span>}</> },
          { value: 'removals', label: <>Removal requests {open > 0 && <span className="ml-1 rounded-full bg-bad px-1.5 text-[11px] text-white">{open}</span>}</> },
        ]}
      />
      {!data ? <div className="skeleton h-64 rounded-2xl" />
        : tab === 'emails' ? <Emails data={data} onDelete={(id) => set((d) => d && { ...d, visitors: d.visitors.filter((v) => v.id !== id) })} />
        : <Removals requests={data.requests} albums={data.albums} onChange={(r) => set((d) => d && { ...d, requests: d.requests.map((x) => (x.id === r.id ? r : x)) })} />}
    </>
  );
}

function Emails({ data, onDelete }: { data: { visitors: Awaited<ReturnType<typeof listVisitors>>; albums: Map<string, { title: string }> }; onDelete: (id: string) => void }) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [query, setQuery] = useState('');
  const shown = useMemo(() => data.visitors.filter((v) => v.email.includes(query.trim().toLowerCase())), [data.visitors, query]);
  const optIns = data.visitors.filter((v) => v.marketing_opt_in).length;

  const exportCsv = (marketingOnly: boolean) => {
    const rows = data.visitors.filter((v) => !marketingOnly || v.marketing_opt_in);
    const csv = [
      'email,marketing_opt_in,first_album,downloads,joined',
      ...rows.map((v) => [v.email, v.marketing_opt_in, `"${(data.albums.get(v.first_album_id ?? '')?.title ?? '').replace(/"/g, '""')}"`, v.downloads, v.created_at].join(',')),
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `gusto-gallery-emails${marketingOnly ? '-marketing' : ''}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast(`${plural(rows.length, 'email')} exported`);
  };

  if (!data.visitors.length) return <Empty icon={<Mail />} title="No emails yet" body="When someone unlocks the photos on the website, their email shows up here." />;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Emails" value={data.visitors.length} />
        <Stat label="Marketing opt-ins" value={optIns} />
        <Stat label="Last 7 days" value={data.visitors.filter((v) => Date.now() - new Date(v.created_at).getTime() < 7 * 86_400_000).length} className="hidden sm:grid" />
      </div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/40" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search emails" className="pl-10" aria-label="Search emails" />
        </label>
        <div className="flex gap-2">
          <Button icon={<Download className="size-4" />} onClick={() => exportCsv(false)}>Export all</Button>
          <Button variant="ghost" onClick={() => exportCsv(true)}>Opt-ins only</Button>
        </div>
      </div>
      <div className="panel divide-y divide-line overflow-hidden">
        {shown.slice(0, 500).map((v) => (
          <div key={v.id} className="flex items-center gap-3 px-4 py-3">
            <div className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate font-medium">{v.email}</span>
              <span className="truncate text-[12.5px] text-mute">
                {relativeTime(v.created_at)}{v.first_album_id && data.albums.get(v.first_album_id) ? ` · ${data.albums.get(v.first_album_id)!.title}` : ''}{v.downloads ? ` · ${plural(v.downloads, 'download')}` : ''}
              </span>
            </div>
            {v.marketing_opt_in && <Badge tone="gold">Opted in</Badge>}
            <IconButton
              label="Delete email"
              className="size-9 hover:text-bad"
              onClick={async () => {
                if (!(await confirm('Delete this email?', `${v.email} will be removed from the list (e.g. after a privacy request).`))) return;
                await deleteVisitor(v.id).then(() => onDelete(v.id), (e) => toast(e.message, 'bad'));
              }}
            >
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        ))}
      </div>
      {shown.length > 500 && <p className="mt-3 text-center text-[12.5px] text-mute">Showing the 500 newest. Export for the full list.</p>}
      {dialog}
    </>
  );
}

function Removals({ requests, albums, onChange }: { requests: RemovalRequest[]; albums: Map<string, { id: string; title: string }>; onChange: (r: RemovalRequest) => void }) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data: photos } = useLoad(async () => {
    const list = await Promise.all(requests.filter((r) => r.status === 'open' && r.photo_id).map((r) => getPhoto(r.photo_id!)));
    return new Map(list.flatMap((p) => (p ? [[p.id, p] as [string, Photo]] : [])));
  }, [requests.length]);

  if (!requests.length) return <Empty icon={<Flag />} title="No removal requests" body="Every photo on the website has a “Request removal” link. Requests show up here." />;

  const resolve = async (r: RemovalRequest, status: RemovalRequest['status']) => {
    await updateRemovalRequest(r.id, status);
    onChange({ ...r, status });
  };

  return (
    <div className="grid gap-3">
      {requests.map((r) => {
        const photo = r.photo_id ? photos?.get(r.photo_id) : undefined;
        const album = r.album_id ? albums.get(r.album_id) : undefined;
        return (
          <article key={r.id} className="panel flex gap-4 p-4">
            <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-ink-800">
              {photo && <img src={photoUrl(photo.album_id, photo.id, 400, photo.format)} alt="" className="size-full object-cover" />}
            </div>
            <div className="grid min-w-0 flex-1 content-start gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.email}</span>
                {r.status === 'open' ? <Badge tone="bad" dot>Open</Badge> : r.status === 'done' ? <Badge tone="ok">Removed</Badge> : <Badge>Declined</Badge>}
              </div>
              <p className="text-[12.5px] text-mute">{relativeTime(r.created_at)}{album && <> · <Link to={`/albums/${album.id}`} className="hover:text-gold">{album.title}</Link></>}{!photo && r.status === 'open' && ' · photo already deleted'}</p>
              {r.reason && <p className="mt-1 text-[13px] text-white/80">“{r.reason}”</p>}
              {r.status === 'open' && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<Trash2 className="size-4" />}
                    onClick={async () => {
                      if (photo && !(await confirm('Delete this photo?', 'It’s removed from the website, the screens and storage.'))) return;
                      try {
                        if (photo) await deletePhotos([photo]);
                        await resolve(r, 'done');
                        toast('Photo removed');
                      } catch (e) {
                        toast(e instanceof Error ? e.message : 'Failed', 'bad');
                      }
                    }}
                  >
                    {photo ? 'Delete photo' : 'Mark as done'}
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Check className="size-4" />} onClick={() => resolve(r, 'rejected')}>Decline</Button>
                </div>
              )}
            </div>
          </article>
        );
      })}
      {dialog}
    </div>
  );
}

const Stat = ({ label, value, className }: { label: string; value: number; className?: string }) => (
  <div className={`panel grid gap-1 p-4 ${className ?? ''}`}>
    <span className="label">{label}</span>
    <span className="text-[28px] font-bold tabular-nums">{value.toLocaleString('en-US')}</span>
  </div>
);
