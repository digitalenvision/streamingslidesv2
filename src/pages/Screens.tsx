import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Monitor, Plus } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Badge, Button, Dialog, Empty, Field, Input, useToast } from '@/components/ui';
import { createScreen, listScreens } from '@/lib/data';
import { useRemote } from '@/lib/useRemote';
import { useLoad } from '@/lib/useLoad';
import type { Screen } from '@/types';

export const playerAddress = (s: Pick<Screen, 'id' | 'legacy_slideshow_id'>) =>
  `${import.meta.env.VITE_PLAYER_URL || window.location.origin}/preview/${s.legacy_slideshow_id ?? s.id}`;

export function Screens() {
  const { data, loading } = useLoad(listScreens);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeader
        title="Screens"
        subtitle="The TVs in the club. Each one plays the recent albums and promo slides by its own rules."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>Add screen</Button>}
      />
      {loading && !data ? (
        <div className="skeleton h-28 rounded-2xl" />
      ) : !data?.length ? (
        <Empty icon={<Monitor />} title="No screens yet" action={<Button variant="primary" onClick={() => setCreating(true)}>Add screen</Button>} />
      ) : (
        <div className="grid gap-3">{data.map((s) => <ScreenRow key={s.id} screen={s} />)}</div>
      )}
      <NewScreen open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function ScreenRow({ screen }: { screen: Screen }) {
  const { players } = useRemote(screen.id);
  const now = players[0]?.now;
  return (
    <Link to={`/screens/${screen.id}`} className="panel group flex items-center gap-4 p-4 transition-colors hover:border-white/15">
      <div className="relative grid aspect-video w-28 shrink-0 place-items-center overflow-hidden rounded-lg bg-black sm:w-40">
        {now?.src ? <img src={now.src} alt="" className="size-full object-cover" /> : <Monitor className="size-6 text-white/25" />}
      </div>
      <div className="grid min-w-0 flex-1 gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-sans text-[16px] font-semibold tracking-normal">{screen.name}</h3>
          {players.length ? <Badge tone="ok" dot>{players.length > 1 ? `${players.length} TVs online` : 'Online'}</Badge> : <Badge dot>Offline</Badge>}
          {players.some((p) => p.black) && <Badge tone="warn">Black screen</Badge>}
        </div>
        <p className="text-[13px] text-mute">
          {screen.max_albums} newest albums from the last {screen.max_days} days · {screen.photo_seconds} s per photo
        </p>
        {now && <p className="truncate text-[13px] text-white/70">Now: {now.kind === 'promo' ? `Promo · ${now.title}` : now.album}</p>}
      </div>
      <ChevronRight className="size-5 shrink-0 text-white/30 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function NewScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await createScreen(name.trim());
      navigate(`/screens/${s.id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not add the screen', 'bad');
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Add screen">
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Name" hint="e.g. Main bar, VIP area, Entrance">{(id) => <Input id={id} required value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!name.trim()}>Add screen</Button>
      </form>
    </Dialog>
  );
}
