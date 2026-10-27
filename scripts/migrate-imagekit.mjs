#!/usr/bin/env node
// One-time move of the old photo library (ImageKit, listed in the old `photos` and
// `streams` tables) into the new Gusto media albums in Supabase Storage.
//
//   node scripts/migrate-imagekit.mjs            dry run: prints what it would do
//   node scripts/migrate-imagekit.mjs --apply    does it (safe to re-run; it resumes)
//
// Options
//   --only <folder,...>   just these night folders (e.g. --only oct16,oct17)
//   --limit <n>           at most n albums (try a couple first)
//   --drafts              create albums as drafts instead of published
//   --promos              also turn the old single-photo slides into promo slides
//   --take-over-tv        point the old TV address (/preview/<slideshow id>) at the
//                         first screen, so the TV plays the new player
//
// Environment (service keys: keep them out of git)
//   SOURCE_URL, SOURCE_SERVICE_KEY   project with the old tables (live project)
//   TARGET_URL, TARGET_SERVICE_KEY   project with the new tables (same project in prod)
//
// Nights are the ImageKit folders under /Gusto-Aruba/ (oct17, Nov8, NewYears…). A folder
// reused a year later is split into separate nights. Folders with fewer than
// MIN_PHOTOS photos are flyers, not nights, and are skipped (see --promos). Older uploads
// without a night folder are listed in the report but not imported.
//
// The old app deleted files from ImageKit when slides were removed but kept them in the
// `photos` table, so many listed nights no longer exist. Each night is checked first;
// nights whose files are gone are reported and skipped.
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = flag('apply');
const ONLY = option('only')?.split(',').map((s) => s.trim().toLowerCase());
const LIMIT = Number(option('limit') ?? Infinity);
const MIN_PHOTOS = 10;
const CONCURRENCY = 6;

const need = (k) => process.env[k] || (console.error(`Missing ${k}`), process.exit(1));
const source = createClient(need('SOURCE_URL'), need('SOURCE_SERVICE_KEY'), { auth: { persistSession: false } });
const target = createClient(need('TARGET_URL'), need('TARGET_SERVICE_KEY'), { auth: { persistSession: false } });
// Progress is kept per target, so a local test run never counts for the real one.
const STATE_FILE = new URL(`./.migrate-state.${new URL(process.env.TARGET_URL).host.replace(/[^a-z0-9]+/gi, '-')}.json`, import.meta.url);

const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : { done: {} };
const save = () => writeFileSync(STATE_FILE, JSON.stringify(state));

// --- reading the old library -----------------------------------------------------
async function all(table, select, order = 'created_at') {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await source.from(table).select(select).order(order).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const arubaDay = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Aruba' }).format(new Date(iso));
const shiftDay = (ymd, days) => new Date(Date.parse(`${ymd}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Night date from a folder name like "oct17", "Sept4", "Jan-30"; year from the upload. */
function nightDate(folder, uploadedAt) {
  const m = folder.toLowerCase().match(/^([a-z]{3})[a-z]*-?(\d{1,2})$/);
  const uploaded = arubaDay(uploadedAt);
  if (!m || !(m[1] in MONTHS)) return { date: shiftDay(uploaded, -1), parsed: false };
  let year = Number(uploaded.slice(0, 4));
  const pad = (n) => String(n).padStart(2, '0');
  let date = `${year}-${pad(MONTHS[m[1]] + 1)}-${pad(Number(m[2]))}`;
  if (date > shiftDay(uploaded, 2)) date = `${--year}${date.slice(4)}`; // December night uploaded in January
  return { date, parsed: true };
}

const humanize = (folder) => folder.replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (c) => c.toUpperCase());
const weekday = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
const slugify = (s) => s.normalize('NFKD').replace(/[̀-ͯ'’]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function planNights(photos) {
  const byFolder = new Map();
  const loose = [];
  for (const p of photos) {
    const m = p.url.match(/\/Gusto-Aruba\/([^/]+)\//);
    if (!m) { loose.push(p); continue; }
    const list = byFolder.get(m[1]) ?? [];
    list.push(p);
    byFolder.set(m[1], list);
  }
  const nights = [];
  const flyers = [];
  for (const [folder, list] of byFolder) {
    // Split a folder name reused later (e.g. oct17 in 2025 and 2026) at gaps of 3+ days.
    const clusters = [];
    for (const p of list.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      const last = clusters.at(-1);
      if (last && Date.parse(p.created_at) - Date.parse(last.at(-1).created_at) < 3 * 86_400_000) last.push(p);
      else clusters.push([p]);
    }
    for (const cluster of clusters) {
      if (cluster.length < MIN_PHOTOS) { flyers.push({ folder, count: cluster.length, photos: cluster }); continue; }
      const { date, parsed } = nightDate(folder, cluster[0].created_at);
      const title = parsed ? `${weekday(date)} Night` : humanize(folder);
      nights.push({ key: `${folder}@${date}`, folder, date, title, slug: `${date}-${slugify(title)}`, photos: cluster });
    }
  }
  nights.sort((a, b) => b.date.localeCompare(a.date));
  return { nights, flyers, loose };
}

// --- processing -------------------------------------------------------------------
// Ask ImageKit for at most 3000px (saves bandwidth); Cloudinary/others as-is.
const fetchUrl = (url) => (url.includes('ik.imagekit.io') ? `${url}${url.includes('?') ? '&' : '?'}tr=w-3000,h-3000,c-at_max,q-92` : url);

async function fetchImage(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(fetchUrl(url), { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
}

async function renditions(input) {
  const base = sharp(input, { failOn: 'none' }).rotate(); // apply EXIF orientation, then drop EXIF
  const download = await base.clone().resize(3000, 3000, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const out = { width: download.info.width, height: download.info.height, download: download.data };
  for (const [size, quality] of [[1920, 80], [1080, 80], [400, 72]]) {
    out[size] = await sharp(download.data).resize(size, size, { fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer();
  }
  const tiny = await sharp(download.data).resize(24, 24, { fit: 'inside' }).jpeg({ quality: 50 }).toBuffer();
  out.lqip = `data:image/jpeg;base64,${tiny.toString('base64')}`;
  return out;
}

async function put(bucket, path, body, contentType) {
  for (let attempt = 1; ; attempt++) {
    const { error } = await target.storage.from(bucket).upload(path, body, { contentType, cacheControl: '31536000', upsert: true });
    if (!error) return;
    if (attempt === 3) throw new Error(`${bucket}/${path}: ${error.message}`);
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
}

async function available(night) {
  const probe = async (url) => {
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(20_000) });
      return res.ok;
    } catch {
      return false;
    }
  };
  const sample = [night.photos[0], night.photos[Math.floor(night.photos.length / 2)], night.photos.at(-1)];
  return (await Promise.all(sample.map((p) => probe(p.url)))).some(Boolean);
}

async function pool(items, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => { while (i < items.length) await fn(items[i++], i); }));
}

async function importNight(night) {
  const done = (state.done[night.key] ??= { albumId: null, urls: [] });
  if (!done.albumId) {
    const { data: existing } = await target.from('event_albums').select('id').eq('slug', night.slug).maybeSingle();
    const album = existing ?? (await target.from('event_albums').insert({
      slug: night.slug, title: night.title, event_date: night.date,
      status: flag('drafts') ? 'draft' : 'published', show_on_web: true, screen_mode: 'auto',
    }).select('id').single()).data;
    if (!album) throw new Error(`could not create album ${night.slug}`);
    done.albumId = album.id;
    save();
  }
  const finished = new Set(done.urls);
  const natural = (u) => decodeURIComponent(u.split('/').pop());
  const ordered = [...night.photos].sort((a, b) => natural(a.url).localeCompare(natural(b.url), undefined, { numeric: true }));
  let ok = 0, failed = 0;
  await pool(ordered.map((p, index) => ({ p, position: index + 1 })).filter(({ p }) => !finished.has(p.url)), async ({ p, position }) => {
    try {
      const img = await renditions(await fetchImage(p.url));
      const id = crypto.randomUUID();
      const dir = `albums/${done.albumId}/${id}`;
      await Promise.all([
        put('gallery', `${dir}/1920.webp`, img[1920], 'image/webp'),
        put('gallery', `${dir}/1080.webp`, img[1080], 'image/webp'),
        put('gallery', `${dir}/400.webp`, img[400], 'image/webp'),
        put('gallery-originals', `${dir}.jpg`, img.download, 'image/jpeg'),
      ]);
      const { error } = await target.from('event_photos').insert({
        id, album_id: done.albumId, position, width: img.width, height: img.height, format: 'webp', lqip: img.lqip, original_name: natural(p.url).replace(/_[A-Za-z0-9-]{6,}(?=\.\w+$)/, ''),
      });
      if (error) throw new Error(error.message);
      done.urls.push(p.url);
      ok++;
      if (ok % 10 === 0) save();
    } catch (err) {
      failed++;
      console.warn(`    ✗ ${natural(p.url)}: ${err.message}`);
    }
  });
  save();
  return { ok, failed };
}

async function importPromos(streams) {
  const singles = streams.filter((s) => s.type === 'single-photo' && s.stream_items?.length);
  for (const s of singles) {
    const item = s.stream_items[0];
    const url = item.content?.url;
    if (!url || state.done[`promo:${s.id}`]) continue;
    const input = await fetchImage(url);
    const meta = await sharp(input).metadata();
    const id = crypto.randomUUID();
    const path = `promos/${id}/${Date.now()}.jpg`;
    await put('gallery', path, await sharp(input).rotate().resize(3840, 3840, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer(), 'image/jpeg');
    const { error } = await target.from('promo_slides').insert({
      id, title: s.title, kind: 'image', path, width: meta.width, height: meta.height,
      duration_seconds: Math.min(120, Math.max(3, Number(s.settings?.duration ?? 10))),
      every_n: Math.min(100, Math.max(1, Number(s.settings?.frequency ?? 8))),
      active: true,
    });
    if (error) throw new Error(error.message);
    state.done[`promo:${s.id}`] = id;
    save();
    console.log(`  promo “${s.title}” added (every ${s.settings?.frequency ?? 8} photos)`);
  }
}

// --- run --------------------------------------------------------------------------
const photos = await all('photos', 'url, created_at');
const { nights, flyers, loose } = planNights(photos);
const wanted = nights.filter((n) => !ONLY || ONLY.includes(n.folder.toLowerCase()));
const checks = [];
await pool(wanted, async (n) => { n.alive = await available(n); checks.push(n); });
const gone = wanted.filter((n) => !n.alive);
const chosen = wanted.filter((n) => n.alive).slice(0, LIMIT);

console.log(`\nOld library: ${photos.length} photos`);
console.log(`Nights found: ${nights.length} (${nights.reduce((n, x) => n + x.photos.length, 0)} photos)`);
console.log(`Flyers / small folders skipped: ${flyers.map((f) => `${f.folder} (${f.count})`).join(', ') || 'none'}`);
console.log(`Older uploads without a night folder (not imported): ${loose.length}\n`);
console.log(`Still on ImageKit, will be imported: ${chosen.length} nights (${chosen.reduce((n, x) => n + x.photos.length, 0)} photos)`);
for (const n of chosen) {
  const done = state.done[n.key]?.urls.length ?? 0;
  console.log(`  ${n.date}  ${n.title.padEnd(22)} ${String(n.photos.length).padStart(4)} photos  ← ${n.folder}${done ? `  (${done} already done)` : ''}`);
}
if (gone.length) {
  console.log(`\nAlready deleted from ImageKit, can't be imported: ${gone.length} nights (${gone.reduce((n, x) => n + x.photos.length, 0)} photos)`);
  console.log(`  ${gone.map((n) => `${n.date} (${n.folder})`).join(', ')}`);
}

if (!APPLY) {
  console.log('\nDry run. Nothing was changed. Run again with --apply to import.');
  process.exit(0);
}

console.log(`\nImporting ${chosen.length} nights…`);
let total = 0, totalFailed = 0;
for (const night of chosen) {
  const t = Date.now();
  const { ok, failed } = await importNight(night);
  total += ok; totalFailed += failed;
  console.log(`  ✓ ${night.date} ${night.title}: ${ok} new, ${failed} failed (${((Date.now() - t) / 1000).toFixed(0)}s)`);
}

if (flag('promos')) {
  const streams = await all('streams', 'id, type, title, settings, stream_items(content)', 'order');
  await importPromos(streams);
}

if (flag('take-over-tv')) {
  const { data: slideshows } = await source.from('slideshows').select('id, title').order('created_at').limit(1);
  const { data: screens } = await target.from('screens').select('id, name').order('created_at').limit(1);
  if (slideshows?.[0] && screens?.[0]) {
    const { error } = await target.from('screens').update({ legacy_slideshow_id: slideshows[0].id }).eq('id', screens[0].id);
    if (error) throw new Error(error.message);
    console.log(`  TV address /preview/${slideshows[0].id} now plays “${screens[0].name}”`);
  }
}

console.log(`\nDone: ${total} photos imported${totalFailed ? `, ${totalFailed} failed (re-run to retry)` : ''}.`);
