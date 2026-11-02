import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Images, Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { AlbumCard } from '@/components/AlbumCard';
import { Button, Dialog, Empty, Field, Input, Segmented, useToast } from '@/components/ui';
import { createAlbum, listAlbums, listScreens } from '@/lib/data';
import { albumName, albumSlug, arubaToday, longDate } from '@/lib/format';
import { albumsOnScreen } from '@/lib/screenRules';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import type { Photo } from '@/types';

type Filter = 'all' | 'screens' | 'drafts' | 'web';

export async function loadAlbumsWithCovers() {
  const [albums, screens] = await Promise.all([listAlbums(), listScreens()]);
  const coverIds = albums.flatMap((a) => (a.cover_photo_id ? [a.cover_photo_id] : []));
  const { data } = coverIds.length
    ? await supabase.from('event_photos').select('id, format, lqip').in('id', coverIds)
    : { data: [] };
  const covers = new Map((data as Pick<Photo, 'id' | 'format' | 'lqip'>[]).map((p) => [p.id, p]));
  return { albums, screens, covers, onScreens: albumsOnScreen(albums, screens[0]) };
}

export function Albums() {
  const { data, loading } = useLoad(loadAlbumsWithCovers);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [params, setParams] = useSearchParams();
  const [creating, setCreatingState] = useState(params.has('new'));
  const setCreating = (v: boolean) => { setCreatingState(v); if (!v && params.has('new')) setParams({}, { replace: true }); };

  const shown = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.albums.filter((a) => {
      if (filter === 'screens' && !data.onScreens.has(a.id)) return false;
      if (filter === 'drafts' && a.status !== 'draft') return false;
      if (filter === 'web' && !(a.status === 'published' && a.show_on_web)) return false;
      return !q || albumName(a).toLowerCase().includes(q) || a.event_date.includes(q);
    });
  }, [data, filter, query]);

  return (
    <>
      <PageHeader
        title="Albums"
        subtitle="One album per night. Published albums go to the website and, while recent, to the screens."
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New album</Button>}
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          className="w-full overflow-x-auto sm:w-auto"
          options={[
            { value: 'all', label: 'All' },
            { value: 'screens', label: 'On screens' },
            { value: 'web', label: 'On website' },
            { value: 'drafts', label: 'Drafts' },
          ]}
        />
        <label className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/40" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search albums" className="pl-10" aria-label="Search albums" />
        </label>
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton aspect-[4/3] rounded-2xl" />)}
        </div>
      ) : shown.length === 0 ? (
        <Empty
          icon={<Images />}
          title={data?.albums.length ? 'No albums match' : 'No albums yet'}
          body={data?.albums.length ? 'Try another filter or search.' : 'Create an album for a night and drop the photos in.'}
          action={!data?.albums.length && <Button variant="primary" onClick={() => setCreating(true)}>New album</Button>}
        />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 xl:grid-cols-4">
          {shown.map((a) => (
            <AlbumCard key={a.id} album={a} cover={a.cover_photo_id ? data!.covers.get(a.cover_photo_id) : undefined} onScreen={data!.onScreens.has(a.id)} />
          ))}
        </div>
      )}

      <NewAlbumDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

export function NewAlbumDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => arubaToday(true));
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const base = albumSlug(title, date);
      let album;
      for (let n = 1; !album; n++) {
        try {
          album = await createAlbum({ title: title.trim() || null, event_date: date, slug: n === 1 ? base : `${base}-${n}` });
        } catch (err) {
          if (n > 5 || !(err instanceof Error) || !err.message.includes('duplicate')) throw err;
        }
      }
      navigate(`/albums/${album.id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create the album', 'bad');
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="New album">
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Date of the night">{(id) => <Input id={id} type="date" required value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="Title (optional)" hint={date ? `Leave empty and the album is called ${longDate(date)}. With a title, the date shows underneath it.` : undefined}>
          {(id) => <Input id={id} maxLength={120} placeholder="e.g. Halloween with Tribal Kush" value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!date}>Create and add photos</Button>
      </form>
    </Dialog>
  );
}
