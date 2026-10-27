# Gusto Media

Admin and TV player for Gusto's photos, at stream.gustoaruba.com.

- **Albums**: one per night. Photos are resized in the browser on upload (400/1080/1920px WebP plus a private 3000px JPEG for downloads) and stored in Supabase Storage.
- **Website**: published albums appear on gustoaruba.com/gallery (the website reads the same Supabase project). Visitors give an email once to see photos full size and download them.
- **Screens**: each TV plays the newest albums (default: 12 albums from the last 45 days) plus promo slides, with live remote control.
- **Promo slides**: flyers and videos with start/end dates, shown after every N photos.
- **Gallery emails**: sign-ups from the website (CSV export) and photo removal requests.

## How it fits together

```
Admin (this app) ──writes──▶ Supabase: tables + Storage ◀──reads── gustoaruba.com/gallery
                                        ▲
TV player /preview/:id ──screen_playlist()┘   (Realtime: refreshes when content changes)
```

Schema, access rules and storage buckets: `supabase/migrations/20261027120000_gusto_media.sql`. The old tables (`slideshows`, `streams`, `stream_items`, `albums`, `photos`) are left untouched.

## TV address

The TVs open `stream.gustoaruba.com/preview/<id>`. That address keeps working:

- `<id>` is a screen's id, or the old slideshow id a screen has taken over (Screens → TV address → Existing TV link). Either way it plays the new player.
- Any other id plays the old slideshow (`src/legacy/`), unchanged.

## Development

```bash
npm install
supabase start          # local Supabase (Docker); applies the migration
npm run dev             # http://127.0.0.1:5173
```

`.env.local`:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon key from `supabase status`>
VITE_WEBSITE_URL=http://localhost:4321
```

The Supabase CLI can't mount folders whose path contains spaces. If `supabase start` reports a missing `99-roles.sql`, copy the `supabase/` folder to a path without spaces and run it from there.

Staff accounts: an owner adds people to the `staff` table (every account that existed when the migration ran is an owner).

## Going live

1. **Supabase plan**: photos need more than the free 1 GB of storage (about 2 MB per photo across all sizes). Use Pro.
2. **Database**: `supabase link --project-ref zsldacxapzyliwtcmosv`, then `supabase db push`.
3. **Deploy** this app (Vercel) with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_WEBSITE_URL=https://gustoaruba.com`. The `VITE_IMAGEKIT_*` variables are no longer used.
4. **Move existing photos** off ImageKit (see below).
5. **Switch the TV**: Screens → Main screens → Existing TV link → pick the old slideshow. The TV changes over by itself, with nothing to touch on the computer.
6. **Website**: set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `GALLERY_COOKIE_SECRET` on the gustoaruba.com project.
7. Once everything is checked, ImageKit and the old `imagekit-auth` / `imagekit-delete` edge functions can be retired.

## Moving photos off ImageKit

```bash
export SOURCE_URL=https://zsldacxapzyliwtcmosv.supabase.co SOURCE_SERVICE_KEY=…
export TARGET_URL=https://zsldacxapzyliwtcmosv.supabase.co TARGET_SERVICE_KEY=…
node scripts/migrate-imagekit.mjs                                  # dry run: what it would do
node scripts/migrate-imagekit.mjs --apply --promos                 # import nights + promo flyers
node scripts/migrate-imagekit.mjs --apply --take-over-tv           # optional: switch the TV address
```

It's safe to re-run (it resumes and never duplicates). Nights are the ImageKit folders under `/Gusto-Aruba/` (`oct17`, `Nov8`…). The old app deleted files from ImageKit when slides were removed, so nights whose files are gone are reported and skipped. As of October 2026 that leaves July 3 to October 17, 2026 (21 nights, about 1,900 photos) available. Older nights can be re-uploaded from the photographers' originals as new albums.
