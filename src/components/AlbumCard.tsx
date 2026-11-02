import { Link } from 'react-router-dom';
import { ImageOff, Monitor } from 'lucide-react';
import type { Album, Photo } from '@/types';
import { albumName, formatDate, plural } from '@/lib/format';
import { photoUrl } from '@/lib/media';
import { Badge } from './ui';

export function AlbumCard({ album, cover, onScreen }: { album: Album; cover?: Pick<Photo, 'id' | 'format' | 'lqip'>; onScreen: boolean }) {
  return (
    <Link to={`/albums/${album.id}`} className="group grid gap-3 rounded-2xl outline-none">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-line bg-ink-800">
        {cover ? (
          <img
            src={photoUrl(album.id, cover.id, 400, cover.format)}
            alt=""
            loading="lazy"
            decoding="async"
            style={cover.lqip ? { backgroundImage: `url(${cover.lqip})`, backgroundSize: 'cover' } : undefined}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="grid size-full place-items-center text-white/30"><ImageOff className="size-7" /></div>
        )}
        <div className="absolute left-2.5 top-2.5 flex gap-1.5">
          {album.status === 'draft' ? <Badge tone="warn" className="bg-ink-950/80 backdrop-blur">Draft</Badge> : null}
          {onScreen && <Badge tone="gold" className="bg-ink-950/80 backdrop-blur"><Monitor className="size-3" />On screens</Badge>}
        </div>
      </div>
      <div className="grid gap-0.5 px-0.5">
        <h3 className="font-sans text-[15px] font-semibold tracking-normal group-hover:text-gold">{albumName(album)}</h3>
        <p className="text-[13px] text-mute">{album.title && `${formatDate(album.event_date)} · `}{plural(album.photo_count, 'photo')}</p>
      </div>
    </Link>
  );
}
