// Turns a screen's playlist into the order the TV plays: the albums night by night
// (or all photos shuffled), with each promo slide dropped in after every N photos.
import { albumName, longDate } from '@/lib/format';
import { photoUrl, publicUrl } from '@/lib/media';
import type { Playlist, PlaylistSlide, SlideDesign } from '@/types';

export type Slide =
  | { key: string; kind: 'photo'; src: string; thumb: string; backdrop: string; w: number; h: number; album: string; date: string | null; seconds: number }
  | { key: string; kind: 'promo'; src: string; promoKind: 'image' | 'video'; title: string; seconds: number; w: number | null; h: number | null }
  | { key: string; kind: 'message'; design: SlideDesign; title: string; seconds: number };

/** A promo, uploaded or designed, as the player shows it. */
export function promoSlide(p: PlaylistSlide, key = `promo:${p.id}`): Slide {
  return p.kind === 'message'
    ? { key, kind: 'message', design: p.design!, title: p.title, seconds: p.duration_seconds }
    : { key, kind: 'promo', src: publicUrl(p.path!), promoKind: p.kind, title: p.title, seconds: p.duration_seconds, w: p.w, h: p.h };
}

/** The newest album's small photos, for designed slides with the photo-wall background. */
export const wallPhotos = (playlist: Playlist) =>
  (playlist.albums[0]?.photos ?? []).slice(0, 42).map((p) => photoUrl(playlist.albums[0].id, p.id, 400, p.f));

const shuffle = <T,>(list: T[]) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// The shuffled order stays put when the playlist changes, so a change doesn't bring photos
// back early. Photos from a just-published album play right after the last photo shown;
// any other new photo lands somewhere in what's still to come.
function keepOrder<T extends { key: string }>(photos: T[], previous: string[], lastPhoto: string | null, fresh: Set<string>) {
  const byKey = new Map(photos.map((p) => [p.key, p]));
  const seen = new Set(previous);
  const added = photos.filter((p) => !seen.has(p.key));
  const order = previous.flatMap((key) => byKey.get(key) ?? []);
  const at = previous.slice(0, lastPhoto ? previous.indexOf(lastPhoto) + 1 : 0).filter((key) => byKey.has(key)).length;
  for (const photo of shuffle(added.filter((p) => !fresh.has(p.key)))) {
    order.splice(at + Math.floor(Math.random() * (order.length - at + 1)), 0, photo);
  }
  order.splice(at, 0, ...added.filter((p) => fresh.has(p.key)));
  return order;
}

const freshKeys = (playlist: Playlist) =>
  playlist.albums.filter((a) => a.fresh).flatMap((a) => a.photos.map((p) => `photo:${p.id}`));

// The photo to play next after a playlist change: the first one just arrived in a
// just-published album. Nothing on the first load, which simply starts with them.
export function firstArrival(playlist: Playlist, previous: Slide[]) {
  if (!previous.length) return null;
  const seen = new Set(previous.map((s) => s.key));
  return freshKeys(playlist).find((key) => !seen.has(key)) ?? null;
}

// Where the slide on screen sits in a new list, or -1 if it's gone. A promo comes round
// many times, so it's the one after the last photo shown.
export function locate(slides: Slide[], shown: string | null, lastPhoto: string | null) {
  if (!shown?.startsWith('promo:')) return slides.findIndex((s) => s.key === shown);
  if (!slides.some((s) => s.key === shown)) return -1;
  const anchor = slides.findIndex((s) => s.key === lastPhoto);
  const at = slides.findIndex((s, i) => i > anchor && s.key === shown);
  return at >= 0 ? at : anchor;
}

export function buildSequence(playlist: Playlist, previous: Slide[] = [], lastPhoto: string | null = null): Slide[] {
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
  const ordered = screen.shuffle
    ? keepOrder(photos, previous.flatMap((s) => (s.kind === 'photo' ? s.key : [])), lastPhoto, new Set(freshKeys(playlist)))
    : photos;

  // A designed slide saved without its design (shouldn't happen) is left out rather than drawn blank.
  const promos = playlist.promos.filter((p) => p.kind !== 'message' || p.design).map((p) => ({
    slide: promoSlide(p),
    // "Every 5 minutes" becomes a number of photos at this screen's pace.
    every: p.every_minutes ? Math.max(1, Math.round((p.every_minutes * 60) / Math.max(1, Number(screen.photo_seconds)))) : p.every_n,
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
