// Turns a screen's playlist into the order the TV plays: the albums night by night
// (or all photos shuffled), with each promo slide dropped in after every N photos.
import { albumName, longDate } from '@/lib/format';
import { photoUrl, publicUrl } from '@/lib/media';
import type { Playlist } from '@/types';

export type Slide =
  | { key: string; kind: 'photo'; src: string; thumb: string; backdrop: string; w: number; h: number; album: string; date: string | null; seconds: number }
  | { key: string; kind: 'promo'; src: string; promoKind: 'image' | 'video'; title: string; seconds: number; w: number | null; h: number | null };

const shuffle = <T,>(list: T[]) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export function buildSequence(playlist: Playlist): Slide[] {
  const { screen } = playlist;
  const photos = playlist.albums.flatMap((album) =>
    album.photos.map((p) => ({
      key: `photo:${p.id}`,
      kind: 'photo' as const,
      src: photoUrl(album.id, p.id, 1920, p.f),
      thumb: photoUrl(album.id, p.id, 400, p.f),
      backdrop: photoUrl(album.id, p.id, 400, p.f),
      w: p.w,
      h: p.h,
      album: albumName(album),
      // An album without a title already goes by its date.
      date: album.title ? longDate(album.event_date) : null,
      seconds: Number(screen.photo_seconds),
    })),
  );
  const ordered = screen.shuffle ? shuffle(photos) : photos;

  const promos = playlist.promos.map((p) => ({
    slide: { key: `promo:${p.id}`, kind: 'promo' as const, src: publicUrl(p.path), promoKind: p.kind, title: p.title, seconds: p.duration_seconds, w: p.w, h: p.h },
    every: p.every_n,
    count: 0,
  }));

  // No photos yet: loop the promos on their own.
  if (!ordered.length) return promos.map((p) => p.slide);

  const out: Slide[] = [];
  for (const photo of ordered) {
    out.push(photo);
    promos.forEach((p) => p.count++);
    // At most one promo between two photos; the one waiting longest goes first.
    const due = promos.filter((p) => p.count >= p.every).sort((a, b) => b.count - b.every - (a.count - a.every))[0];
    if (due) {
      out.push(due.slide);
      due.count = 0;
    }
  }
  return out;
}
