// Upload pipeline for album photos: resize in a small worker pool, push the files to
// Storage (retrying flaky venue Wi-Fi), then add the database row. Three photos move
// through at a time; each reports its own state so the UI can show live progress.
import { supabase } from './supabase';
import { CACHE_SECONDS, GALLERY_BUCKET, ORIGINALS_BUCKET, RENDITIONS, originalPath, renditionPath } from './media';
import { takenAt } from './exif';
import type { Processed, ProcessRequest, ProcessResponse } from '../workers/process.worker';
import type { Photo } from '@/types';

export type TaskState = 'queued' | 'processing' | 'uploading' | 'done' | 'error';
export interface UploadTask {
  key: string;
  file: File;
  state: TaskState;
  preview?: string;
  error?: string;
  photo?: Photo;
}

const CONCURRENCY = 3;
export const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

// --- worker pool ---------------------------------------------------------------
const workers: Worker[] = [];
const idle: Worker[] = [];
const waiting: ((w: Worker) => void)[] = [];
let seq = 0;

function getWorker(): Promise<Worker> {
  const free = idle.pop();
  if (free) return Promise.resolve(free);
  if (workers.length < Math.min(CONCURRENCY, Math.max(1, navigator.hardwareConcurrency - 1))) {
    const w = new Worker(new URL('../workers/process.worker.ts', import.meta.url), { type: 'module' });
    workers.push(w);
    return Promise.resolve(w);
  }
  return new Promise((resolve) => waiting.push(resolve));
}
function release(w: Worker) {
  const next = waiting.shift();
  if (next) next(w);
  else idle.push(w);
}

async function processFile(file: File): Promise<Processed> {
  const worker = await getWorker();
  const id = ++seq;
  try {
    return await new Promise<Processed>((resolve, reject) => {
      const onMessage = (e: MessageEvent<ProcessResponse>) => {
        if (e.data.id !== id) return;
        worker.removeEventListener('message', onMessage);
        if (e.data.ok) resolve(e.data.result);
        else reject(new Error(e.data.error));
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage({ id, file } satisfies ProcessRequest);
    });
  } finally {
    release(worker);
  }
}

// --- storage --------------------------------------------------------------------
async function put(bucket: string, path: string, blob: Blob) {
  for (let attempt = 1; ; attempt++) {
    const { error } = await supabase.storage.from(bucket).upload(path, blob, {
      cacheControl: CACHE_SECONDS,
      contentType: blob.type,
      upsert: true,
    });
    if (!error) return;
    if (attempt === 3) throw new Error(error.message);
    await new Promise((r) => setTimeout(r, attempt * 1500));
  }
}

export async function removePhotoFiles(photos: Pick<Photo, 'id' | 'album_id' | 'format'>[]) {
  if (!photos.length) return;
  const previews = photos.flatMap((p) => RENDITIONS.map((s) => renditionPath(p.album_id, p.id, s, p.format)));
  const originals = photos.map((p) => originalPath(p.album_id, p.id));
  await Promise.all([
    supabase.storage.from(GALLERY_BUCKET).remove(previews),
    supabase.storage.from(ORIGINALS_BUCKET).remove(originals),
  ]);
}

async function uploadOne(albumId: string, file: File, position: number, onPreview: (url: string) => void, onUploading: () => void): Promise<Photo> {
  const [processed, taken] = await Promise.all([processFile(file), takenAt(file)]);
  onPreview(URL.createObjectURL(processed.renditions[400]));
  onUploading();

  const id = crypto.randomUUID();
  const meta = { id, album_id: albumId, format: processed.format };
  await Promise.all([
    ...RENDITIONS.map((s) => put(GALLERY_BUCKET, renditionPath(albumId, id, s, processed.format), processed.renditions[s])),
    put(ORIGINALS_BUCKET, originalPath(albumId, id), processed.download),
  ]);

  const { data, error } = await supabase
    .from('event_photos')
    .insert({
      ...meta,
      position,
      width: processed.width,
      height: processed.height,
      lqip: processed.lqip,
      original_name: file.name,
      taken_at: taken,
    })
    .select()
    .single();
  if (error) {
    await removePhotoFiles([meta]).catch(() => {});
    throw new Error(error.message);
  }
  return data as Photo;
}

/**
 * Uploads files into an album. Files are queued in name order (photographers number
 * them in shooting order); positions continue after `startPosition`.
 */
export async function uploadPhotos(
  albumId: string,
  files: File[],
  startPosition: number,
  onChange: (tasks: UploadTask[]) => void,
): Promise<Photo[]> {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const tasks: UploadTask[] = sorted.map((file) => ({ key: crypto.randomUUID(), file, state: 'queued' }));
  const emit = () => onChange(tasks.map((t) => ({ ...t })));
  emit();

  let next = 0;
  const runLane = async () => {
    while (next < tasks.length) {
      const index = next++;
      const task = tasks[index];
      task.state = 'processing';
      emit();
      try {
        task.photo = await uploadOne(
          albumId,
          task.file,
          startPosition + index + 1,
          (url) => { task.preview = url; emit(); },
          () => { task.state = 'uploading'; emit(); },
        );
        task.state = 'done';
      } catch (err) {
        task.state = 'error';
        task.error = err instanceof Error ? err.message : 'Upload failed';
      }
      emit();
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, runLane));
  return tasks.flatMap((t) => (t.photo ? [t.photo] : []));
}
