// All reads and writes of the Gusto media tables. Row access is enforced by RLS
// (staff only for writes), so these stay thin.
import { supabase } from './supabase';
import { GALLERY_BUCKET, CACHE_SECONDS, ORIGINALS_BUCKET } from './media';
import { removePhotoFiles } from './upload';
import type { Album, EventSetting, Photo, Promo, RemovalRequest, Screen, UpcomingEvent, Visitor } from '@/types';

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

// --- albums ---------------------------------------------------------------------
export const listAlbums = async () =>
  ok(await supabase.from('event_albums').select('*').order('event_date', { ascending: false }).order('created_at', { ascending: false })) as Album[];

export const getAlbum = async (id: string) => ok(await supabase.from('event_albums').select('*').eq('id', id).single()) as Album;

export const createAlbum = async (input: Pick<Album, 'title' | 'event_date' | 'slug'>) =>
  ok(await supabase.from('event_albums').insert(input).select().single()) as Album;

export const updateAlbum = async (id: string, patch: Partial<Album>) =>
  ok(await supabase.from('event_albums').update(patch).eq('id', id).select().single()) as Album;

export async function deleteAlbum(album: Album) {
  const photos = await listPhotos(album.id);
  await removePhotoFiles(photos);
  ok(await supabase.from('event_albums').delete().eq('id', album.id));
}

// --- photos ---------------------------------------------------------------------
export const listPhotos = async (albumId: string) =>
  ok(await supabase.from('event_photos').select('*').eq('album_id', albumId).order('position').order('created_at')) as Photo[];

export const updatePhotos = async (ids: string[], patch: Partial<Pick<Photo, 'hidden_web' | 'hidden_screen'>>) =>
  ok(await supabase.from('event_photos').update(patch).in('id', ids).select()) as Photo[];

export async function deletePhotos(photos: Photo[]) {
  await removePhotoFiles(photos);
  ok(await supabase.from('event_photos').delete().in('id', photos.map((p) => p.id)));
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

export async function createPromo(file: File, input: Omit<Promo, 'id' | 'path' | 'kind' | 'width' | 'height' | 'created_at' | 'position'>) {
  const id = crypto.randomUUID();
  const kind = file.type.startsWith('video/') ? 'video' : 'image';
  const ext = (file.name.split('.').pop() || (kind === 'video' ? 'mp4' : 'jpg')).toLowerCase();
  const path = `promos/${id}/${Date.now()}.${ext}`;
  const size = await mediaSize(file, kind);
  const { error } = await supabase.storage.from(GALLERY_BUCKET).upload(path, file, { cacheControl: CACHE_SECONDS, contentType: file.type });
  if (error) throw new Error(error.message);
  return ok(await supabase.from('promo_slides').insert({ id, kind, path, ...size, ...input }).select().single()) as Promo;
}

export const updatePromo = async (id: string, patch: Partial<Promo>) =>
  ok(await supabase.from('promo_slides').update(patch).eq('id', id).select().single()) as Promo;

export async function deletePromo(promo: Promo) {
  await supabase.storage.from(GALLERY_BUCKET).remove([promo.path]);
  ok(await supabase.from('promo_slides').delete().eq('id', promo.id));
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
