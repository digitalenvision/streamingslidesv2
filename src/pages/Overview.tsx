import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Flag, Images, Megaphone, Monitor, Plus, Users } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { AlbumCard } from '@/components/AlbumCard';
import { Badge, Button } from '@/components/ui';
import { NewAlbumDialog, loadAlbumsWithCovers } from './Albums';
import { listPromos, listRemovalRequests } from '@/lib/data';
import { arubaToday } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useLoad } from '@/lib/useLoad';
import { useRemote } from '@/lib/useRemote';
import type { Screen } from '@/types';

export function Overview() {
  const { session } = useAuth();
  const [creating, setCreating] = useState(false);
  const { data } = useLoad(async () => {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [albums, promos, requests, emails] = await Promise.all([
      loadAlbumsWithCovers(),
      listPromos(),
      listRemovalRequests(),
      supabase.from('gallery_visitors').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
    ]);
    const today = arubaToday();
    return {
      ...albums,
      livePromos: promos.filter((p) => p.active && (!p.starts_on || p.starts_on <= today) && (!p.ends_on || p.ends_on >= today)).length,
      openRequests: requests.filter((r) => r.status === 'open').length,
      newEmails: emails.count ?? 0,
    };
  });

  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Aruba', hour: 'numeric', hour12: false }).format(new Date()));
  const greeting = hour < 12 && hour >= 5 ? 'Good morning' : hour < 18 && hour >= 12 ? 'Good afternoon' : 'Good evening';
  const name = session?.user.email?.split('@')[0];
  const drafts = data?.albums.filter((a) => a.status === 'draft') ?? [];

  return (
    <>
      <PageHeader
        title={<>{greeting}{name ? <span className="capitalize">, {name}</span> : ''}</>}
        subtitle="Upload last night’s photos and they’re on the website and the screens in minutes."
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New album</Button>}
      />

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile to="/albums" icon={<Monitor />} label="Albums on screens" value={data?.onScreens.size} />
        <Tile to="/promos" icon={<Megaphone />} label="Promos running" value={data?.livePromos} />
        <Tile to="/visitors" icon={<Users />} label="New emails this week" value={data?.newEmails} />
        <Tile to="/visitors" icon={<Flag />} label="Removal requests" value={data?.openRequests} alert={!!data?.openRequests} />
      </div>

      {drafts.length > 0 && (
        <Link to={`/albums/${drafts[0].id}`} className="panel mb-8 flex items-center gap-3 border-warn/30 bg-warn/[0.06] p-4 hover:border-warn/50">
          <Badge tone="warn" dot>Draft</Badge>
          <span className="min-w-0 flex-1 truncate">{drafts.length === 1 ? `“${drafts[0].title}” isn’t published yet.` : `${drafts.length} albums aren’t published yet.`}</span>
          <ArrowRight className="size-4 shrink-0 text-warn" />
        </Link>
      )}

      {data?.screens.length ? (
        <section className="mb-10 grid gap-3">
          <div className="flex items-center justify-between"><h2 className="label">Screens</h2><Link to="/screens" className="text-[13px] text-mute hover:text-white">Manage</Link></div>
          <div className="grid gap-3 sm:grid-cols-2">{data.screens.map((s) => <ScreenPulse key={s.id} screen={s} />)}</div>
        </section>
      ) : null}

      <section className="grid gap-4">
        <div className="flex items-center justify-between"><h2 className="label">Latest albums</h2><Link to="/albums" className="text-[13px] text-mute hover:text-white">All albums</Link></div>
        {!data ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton aspect-[4/3] rounded-2xl" />)}</div>
        ) : data.albums.length ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4">
            {data.albums.slice(0, 8).map((a) => <AlbumCard key={a.id} album={a} cover={a.cover_photo_id ? data.covers.get(a.cover_photo_id) : undefined} onScreen={data.onScreens.has(a.id)} />)}
          </div>
        ) : (
          <button onClick={() => setCreating(true)} className="panel grid place-items-center gap-2 py-14 text-center hover:border-gold/40">
            <Images className="size-7 text-gold" />
            <span className="font-semibold">Create your first album</span>
          </button>
        )}
      </section>
      <NewAlbumDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function Tile({ to, icon, label, value, alert }: { to: string; icon: React.ReactNode; label: string; value?: number; alert?: boolean }) {
  return (
    <Link to={to} className="panel grid gap-3 p-4 transition-colors hover:border-white/15">
      <span className={`grid size-9 place-items-center rounded-xl [&>svg]:size-[18px] ${alert ? 'bg-bad/15 text-bad' : 'bg-white/[0.06] text-gold'}`}>{icon}</span>
      <span className="grid gap-0.5">
        <span className="text-[28px] font-bold leading-none tabular-nums">{value ?? '–'}</span>
        <span className="text-[12.5px] text-mute">{label}</span>
      </span>
    </Link>
  );
}

function ScreenPulse({ screen }: { screen: Screen }) {
  const { players } = useRemote(screen.id);
  const now = players[0]?.now;
  return (
    <Link to={`/screens/${screen.id}`} className="panel flex items-center gap-3 p-3 hover:border-white/15">
      <div className="grid aspect-video w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-black">
        {now?.src ? <img src={now.src} alt="" className="size-full object-cover" /> : <Monitor className="size-5 text-white/25" />}
      </div>
      <div className="grid min-w-0 gap-1">
        <span className="flex items-center gap-2 font-semibold">{screen.name}{players.length ? <Badge tone="ok" dot>Online</Badge> : <Badge dot>Offline</Badge>}</span>
        <span className="truncate text-[12.5px] text-mute">{now ? (now.kind === 'promo' ? `Promo · ${now.title}` : now.album) : 'Not playing'}</span>
      </div>
    </Link>
  );
}
