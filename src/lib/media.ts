// Where every file lives in Supabase Storage. Paths are immutable (ids, never names),
// so files are uploaded with a one-year cache and served straight from the CDN.
import type { ImageFormat } from '@/types';

export const GALLERY_BUCKET = 'gallery';
export const ORIGINALS_BUCKET = 'gallery-originals';
export const RENDITIONS = [400, 1080, 1920] as const;
export type Rendition = (typeof RENDITIONS)[number];
export const DOWNLOAD_EDGE = 3000;
export const CACHE_SECONDS = '31536000';

const base = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${GALLERY_BUCKET}`;

export const photoDir = (albumId: string, photoId: string) => `albums/${albumId}/${photoId}`;
export const renditionPath = (albumId: string, photoId: string, size: Rendition, format: ImageFormat) =>
  `${photoDir(albumId, photoId)}/${size}.${format}`;
export const originalPath = (albumId: string, photoId: string) => `albums/${albumId}/${photoId}.jpg`;

export const photoUrl = (albumId: string, photoId: string, size: Rendition, format: ImageFormat) =>
  `${base}/${renditionPath(albumId, photoId, size, format)}`;
export const publicUrl = (path: string) => `${base}/${path}`;
