// Supabase Storage refuses some photos (429) when many it hasn't cached load at once, though
// the files are fine. Ask again, spaced out, instead of leaving a broken tile. Each try needs
// its own address: Safari answers the same address with the same failure, without asking again.
const MAX_TRIES = 6;

export function retryGalleryImages() {
  const tries = new WeakMap<HTMLImageElement, { url: string; n: number }>();
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const url = img.src.split('?')[0];
    if (!url.includes('/storage/v1/object/public/gallery/')) return;
    const last = tries.get(img);
    const n = last?.url === url ? last.n : 0;
    if (n === MAX_TRIES) return;
    tries.set(img, { url, n: n + 1 });
    setTimeout(() => {
      // The element may be showing another photo by now.
      if (img.src.split('?')[0] === url) img.src = `${url}?r=${n + 1}`;
    }, 500 * 2 ** n + Math.random() * 500);
  }, true);
}
