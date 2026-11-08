// All reads and writes of the Gusto media tables. Row access is enforced by RLS
// (staff only for writes), so these stay thin.
import { supabase } from './supabase';
import { GALLERY_BUCKET, CACHE_SECONDS, ORIGINALS_BUCKET, photoUrl } from './media';
import { removePhotoFiles } from './upload';
import type { Album, EventSetting, Photo, Promo, RemovalRequest, Screen, SlideDesign, UpcomingEvent, Visitor } from '@/types';

const ok = <T>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

// --- special events -------------------------------------------------------------
// The nights come from the website, which holds the Fourvenues key. Always the www address:
// the bare domain redirects, and a redirect has no CORS header.
const WEBSITE = (import.meta.env.VITE_WEBSITE_URL || 'https://www.gustoaruba.com').replace('//gustoaruba.com', '//www.gustoaruba.com');

export async function listUpcomingEvents() {
  const res = await fetch(`${WEBSITE}/api/events/upcoming/`);
  if (!res.ok) throw new Error('Could not get the nights from the website');
  return (await res.json()).events as UpcomingEvent[];
}

export const listEventSettings = async () =>
  ok(await supabase.from('event_settings').select('code,highlighted,no_happy_hour')) as EventSetting[];

export const saveEventSetting = async (event: UpcomingEvent, setting: EventSetting) => {
  ok(await supabase.from('event_settings').upsert({ ...setting, name: event.name, starts_at: event.start }, { onConflict: 'code' }));
};

// The website caches its pages for a few minutes: this makes it drop the ones showing nights.
async function refreshWebsite(path: string) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${WEBSITE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${data.session?.access_token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error('The website didn’t refresh');
}

export const refreshWebsiteNights = () => refreshWebsite('/api/events/settings-changed/');

// The photos are already gone by now, and the cached pages expire by themselves, so a
// failure here isn't worth stopping for.
const refreshWebsiteGallery = () =>
  refreshWebsite('/api/gallery/changed/').catch((err) => console.warn('[gallery] website refresh failed', err));

// --- albums ---------------------------------------------------------------------
export const listAlbums = async () =>
  ok(await supabase.from('event_albums').select('*').order('event_date', { ascending: false }).order('created_at', { ascending: false })) as Album[];

export const getAlbum = async (id: string) => ok(await supabase.from('event_albums').select('*').eq('id', id).single()) as Album;

export const createAlbum = async (input: Pick<Album, 'title' | 'event_date' | 'slug'>) =>
  ok(await supabase.from('event_albums').insert(input).select().single()) as Album;

export const updateAlbum = async (id: string, patch: Partial<Album>) =>
  ok(await supabase.from('event_albums').update(patch).eq('id', id).select().single()) as Album;

// One request returns a limited number of rows, so this keeps asking until none come back.
async function listAllPhotoFiles(albumId: string) {
  const photos: Pick<Photo, 'id' | 'album_id' | 'format'>[] = [];
  for (;;) {
    const page = ok(await supabase.from('event_photos').select('id,album_id,format').eq('album_id', albumId).order('id').range(photos.length, photos.length + 999)) as typeof photos;
    if (!page.length) return photos;
    photos.push(...page);
  }
}

export async function deleteAlbum(album: Album) {
  const photos = await listAllPhotoFiles(album.id);
  await removePhotoFiles(photos);
  ok(await supabase.from('event_albums').delete().eq('id', album.id));
  await refreshWebsiteGallery();
}

// --- photos ---------------------------------------------------------------------
export const listPhotos = async (albumId: string) =>
  ok(await supabase.from('event_photos').select('*').eq('album_id', albumId).order('position').order('created_at')) as Photo[];

export const updatePhotos = async (ids: string[], patch: Partial<Pick<Photo, 'hidden_web' | 'hidden_screen'>>) =>
  ok(await supabase.from('event_photos').update(patch).in('id', ids).select()) as Photo[];

export async function deletePhotos(photos: Photo[]) {
  await removePhotoFiles(photos);
  ok(await supabase.from('event_photos').delete().in('id', photos.map((p) => p.id)));
  await refreshWebsiteGallery();
}

export const reorderPhotos = async (albumId: string, ids: string[]) =>
  ok(await supabase.rpc('reorder_photos', { p_album_id: albumId, p_photo_ids: ids }));

export async function downloadUrl(photo: Photo) {
  const { data, error } = await supabase.storage
    .from(ORIGINALS_BUCKET)
    .createSignedUrl(`albums/${photo.album_id}/${photo.id}.jpg`, 300, { download: photo.original_name ?? true });
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// --- promo slides ---------------------------------------------------------------
export const listPromos = async () =>
  ok(await supabase.from('promo_slides').select('*').order('position').order('created_at', { ascending: false })) as Promo[];

type PromoFields = Omit<Promo, 'id' | 'path' | 'kind' | 'width' | 'height' | 'created_at' | 'position' | 'design' | 'live_until' | 'skip_until'>;

export async function createPromo(file: File, input: PromoFields) {
  const id = crypto.randomUUID();
  const kind = file.type.startsWith('video/') ? 'video' : 'image';
  const ext = (file.name.split('.').pop() || (kind === 'video' ? 'mp4' : 'jpg')).toLowerCase();
  const path = `promos/${id}/${Date.now()}.${ext}`;
  const size = await mediaSize(file, kind);
  const { error } = await supabase.storage.from(GALLERY_BUCKET).upload(path, file, { cacheControl: CACHE_SECONDS, contentType: file.type });
  if (error) throw new Error(error.message);
  return ok(await supabase.from('promo_slides').insert({ id, kind, path, ...size, ...input }).select().single()) as Promo;
}

/** A slide designed in Command. `id` comes from the editor, which may have uploaded pictures under it already. */
export const createDesignedSlide = async (id: string, design: SlideDesign, input: PromoFields) =>
  ok(await supabase.from('promo_slides').insert({ id, kind: 'message', path: null, width: 1920, height: 1080, design, ...input }).select().single()) as Promo;

/**
 * Stores a picture for a designed slide (background or product shot) and returns its path.
 * Phone photos are shrunk to what a TV shows; WebP keeps a product shot's see-through parts.
 */
export async function uploadSlidePicture(promoId: string, file: File, role: 'bg' | 'item') {
  const blob = await shrink(file, role === 'bg' ? 2400 : 1400);
  const path = `promos/${promoId}/${role}-${Date.now()}.${blob.type === 'image/webp' ? 'webp' : (file.name.split('.').pop() || 'jpg').toLowerCase()}`;
  const { error } = await supabase.storage.from(GALLERY_BUCKET).upload(path, blob, { cacheControl: CACHE_SECONDS, contentType: blob.type });
  if (error) throw new Error(error.message);
  return path;
}

async function shrink(file: File, edge: number): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.88));
    return blob && blob.type === 'image/webp' ? blob : file;
  } catch {
    return file;
  }
}

/** Every file a slide owns: an upload's file, a design's pictures. */
export const slideFiles = (p: Pick<Promo, 'path' | 'design'>) =>
  [p.path, p.design?.background.type === 'image' ? p.design.background.path : null, p.design?.image].filter((x): x is string => !!x);
export const removeSlideFiles = async (paths: string[]) => {
  if (paths.length) await supabase.storage.from(GALLERY_BUCKET).remove(paths);
};

export const updatePromo = async (id: string, patch: Partial<Promo>) =>
  ok(await supabase.from('promo_slides').update(patch).eq('id', id).select().single()) as Promo;

export async function deletePromo(promo: Promo) {
  await removeSlideFiles(slideFiles(promo));
  ok(await supabase.from('promo_slides').delete().eq('id', promo.id));
}

/** Small photos of the newest published album: the "Latest photos" background in the editor. */
export async function latestWallPhotos() {
  const { data: album } = await supabase.from('event_albums').select('id').eq('status', 'published').order('event_date', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!album) return [];
  const { data } = await supabase.from('event_photos').select('id,format').eq('album_id', album.id).eq('hidden_screen', false).order('position').limit(42);
  return (data ?? []).map((p) => photoUrl(album.id, p.id, 400, p.format));
}

function mediaSize(file: File, kind: 'image' | 'video'): Promise<{ width: number | null; height: number | null }> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve) => {
    const done = (width: number | null, height: number | null) => {
      URL.revokeObjectURL(url);
      resolve({ width, height });
    };
    if (kind === 'image') {
      const img = new Image();
      img.onload = () => done(img.naturalWidth, img.naturalHeight);
      img.onerror = () => done(null, null);
      img.src = url;
    } else {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => done(video.videoWidth, video.videoHeight);
      video.onerror = () => done(null, null);
      video.src = url;
    }
  });
}

// --- screens --------------------------------------------------------------------
export const listScreens = async () => ok(await supabase.from('screens').select('*').order('created_at')) as Screen[];
export const getScreen = async (id: string) => ok(await supabase.from('screens').select('*').eq('id', id).single()) as Screen;
export const createScreen = async (name: string) => ok(await supabase.from('screens').insert({ name }).select().single()) as Screen;
export const updateScreen = async (id: string, patch: Partial<Screen>) =>
  ok(await supabase.from('screens').update(patch).eq('id', id).select().single()) as Screen;
export const deleteScreen = async (id: string) => ok(await supabase.from('screens').delete().eq('id', id));

/** Stores a new background image and returns its path. Paths are immutable, like every other file. */
export async function uploadScreenBackground(screenId: string, file: File) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `backgrounds/${screenId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(GALLERY_BUCKET).upload(path, file, { cacheControl: CACHE_SECONDS, contentType: file.type });
  if (error) throw new Error(error.message);
  return path;
}
export const removeScreenBackground = async (path: string) => { await supabase.storage.from(GALLERY_BUCKET).remove([path]); };

// --- visitors & removal requests ------------------------------------------------
export const listVisitors = async () =>
  ok(await supabase.from('gallery_visitors').select('*').order('created_at', { ascending: false }).limit(5000)) as Visitor[];
export const deleteVisitor = async (id: string) => ok(await supabase.from('gallery_visitors').delete().eq('id', id));

export const listRemovalRequests = async () =>
  ok(await supabase.from('photo_removal_requests').select('*').order('created_at', { ascending: false })) as RemovalRequest[];
/** Photos waiting for a decision (several requests for one photo count once). */
export const countOpenRemovals = async () => {
  const { data, error } = await supabase.from('photo_removal_requests').select('id,photo_id').eq('status', 'open').limit(1000);
  return error || !data ? 0 : new Set(data.map((r) => r.photo_id ?? r.id)).size;
};
/** Close requests without deleting anything (declined, or the photo was already gone). */
export const closeRemovalRequests = async (ids: string[], status: 'done' | 'rejected', note?: string) =>
  ok(await supabase.from('photo_removal_requests').update({ status, decision_note: note?.trim() || null }).in('id', ids).eq('status', 'open'));
export const getPhotos = async (ids: string[]) =>
  ids.length ? (ok(await supabase.from('event_photos').select('*').in('id', ids)) as Photo[]) : [];
export const listAdminNames = async () =>
  ok(await supabase.from('admin_users').select('user_id,name,email')) as { user_id: string; name: string | null; email: string }[];
export const getPhoto = async (id: string) => ok(await supabase.from('event_photos').select('*').eq('id', id).maybeSingle()) as Photo | null;
