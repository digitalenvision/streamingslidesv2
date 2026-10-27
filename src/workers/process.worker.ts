// Turns one photo into everything we store, off the main thread:
// 400/1080/1920px previews (WebP, or JPEG where the browser can't encode WebP, e.g.
// Safari), a 3000px JPEG download copy and a tiny blurred placeholder. Re-encoding
// through a canvas also drops EXIF, so no GPS or camera data ends up public.
import { DOWNLOAD_EDGE, RENDITIONS, type Rendition } from '../lib/media';
import type { ImageFormat } from '../types';

// Worker-only globals (the project compiles against the DOM lib).
declare const FileReaderSync: { new (): { readAsDataURL(blob: Blob): string } };
const post = (message: ProcessResponse) => (self as unknown as { postMessage(m: unknown): void }).postMessage(message);

export interface ProcessRequest { id: number; file: File }
export interface Processed {
  width: number;
  height: number;
  format: ImageFormat;
  renditions: Record<Rendition, Blob>;
  download: Blob;
  lqip: string;
}
export type ProcessResponse = { id: number; ok: true; result: Processed } | { id: number; ok: false; error: string };

let webp: Promise<boolean> | undefined;
const canEncodeWebp = () =>
  (webp ??= (() => {
    // A canvas needs a context before it can be encoded.
    const probe = new OffscreenCanvas(1, 1);
    probe.getContext('2d')!.fillRect(0, 0, 1, 1);
    return probe.convertToBlob({ type: 'image/webp' }).then((blob) => blob.type === 'image/webp', () => false);
  })());

// Each size is drawn from the next larger one, which keeps big downscales sharp.
function scaled(src: CanvasImageSource, w: number, h: number, longEdge: number) {
  const k = Math.min(1, longEdge / Math.max(w, h));
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function process(file: File): Promise<Processed> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width, height } = bitmap;
  const format: ImageFormat = (await canEncodeWebp()) ? 'webp' : 'jpg';
  const type = format === 'webp' ? 'image/webp' : 'image/jpeg';

  const big = scaled(bitmap, width, height, DOWNLOAD_EDGE);
  bitmap.close();
  const download = await big.convertToBlob({ type: 'image/jpeg', quality: 0.9 });

  const renditions = {} as Record<Rendition, Blob>;
  let prev: OffscreenCanvas = big;
  for (const size of [...RENDITIONS].sort((a, b) => b - a)) {
    prev = scaled(prev, prev.width, prev.height, size);
    renditions[size] = await prev.convertToBlob({ type, quality: size === 400 ? 0.72 : 0.8 });
  }

  const tiny = scaled(prev, prev.width, prev.height, 24);
  const lqip = new FileReaderSync().readAsDataURL(await tiny.convertToBlob({ type: 'image/jpeg', quality: 0.5 }));

  return { width: big.width, height: big.height, format, renditions, download, lqip };
}

self.onmessage = async (e: MessageEvent<ProcessRequest>) => {
  const { id, file } = e.data;
  try {
    const result = await process(file);
    post({ id, ok: true, result });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    post({ id, ok: false, error });
  }
};
