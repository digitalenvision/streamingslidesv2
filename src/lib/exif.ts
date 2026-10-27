// Reads only DateTimeOriginal from a JPEG's EXIF block, so uploads can be ordered by
// the moment each photo was taken (photographers' file names aren't always in order).

export async function takenAt(file: File): Promise<string | null> {
  if (!/jpe?g$/i.test(file.type) && !/\.jpe?g$/i.test(file.name)) return null;
  try {
    const view = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (view.getUint16(0) !== 0xffd8) return null;
    let at = 2;
    while (at + 4 < view.byteLength) {
      const marker = view.getUint16(at);
      const size = view.getUint16(at + 2);
      if (marker === 0xffe1 && view.getUint32(at + 4) === 0x45786966) return readTiff(view, at + 10);
      if ((marker & 0xff00) !== 0xff00) return null;
      at += 2 + size;
    }
  } catch {
    // Unreadable EXIF just means no date.
  }
  return null;
}

function readTiff(view: DataView, tiff: number): string | null {
  const le = view.getUint16(tiff) === 0x4949;
  const u16 = (o: number) => view.getUint16(o, le);
  const u32 = (o: number) => view.getUint32(o, le);
  const entries = (ifd: number) => Array.from({ length: u16(ifd) }, (_, i) => ifd + 2 + i * 12);

  const ifd0 = tiff + u32(tiff + 4);
  const exifPtr = entries(ifd0).find((e) => u16(e) === 0x8769);
  if (exifPtr === undefined) return null;
  const dateTag = entries(tiff + u32(exifPtr + 8)).find((e) => u16(e) === 0x9003);
  if (dateTag === undefined) return null;

  const offset = tiff + u32(dateTag + 8);
  const text = String.fromCharCode(...Array.from({ length: 19 }, (_, i) => view.getUint8(offset + i)));
  const m = text.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  // Camera clocks have no time zone; Gusto's cameras are on Aruba time (UTC-4).
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}-04:00` : null;
}
