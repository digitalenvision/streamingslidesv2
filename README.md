# Gusto Command

One private admin panel for Gusto, at **command.gustoaruba.com**: media (photos, promo slides, TV screens, gallery emails) and staff (schedules, people, time off), on the same Supabase project as the website.

## Who gets in

- **Owners** and **managers** have accounts. Both run media and schedules; owners also manage accounts (Admin → Accounts) and read the activity log. Roles and what they see: `src/lib/access.ts`.
- Bar staff, DJs and security **don't log in**: they're records under People, and get the printed schedule.
- Every account signs in with a password **and an authenticator app code**. The database enforces it: staff, schedule and admin data is only readable from a session that passed the code (`is_admin()` checks `aal2`).
- Accounts only come from an owner's invitation (`admin-users` edge function); public sign-ups are off. Lost phone: an owner resets that person's 2FA.
- Idle sessions sign out after 12 hours. Every change to people, shifts, time off, rules, albums, promos and accounts lands in an append-only audit log.

## Staff schedules

- **Schedule**: one week per team. The **Board** has a column per night split into Early, Late and Day off, with the whole team on the right: drag names onto a night, between nights, or back to the list. Each night has a Fill button and Auto-fill plans the whole week from the rules. The **Table** view (people as rows) is still there for quick keyboard entry. Every change is checked live: days off, the early/late mix per person, people per night. On phones the board shows one night at a time; tap a name to place it.
- **DJs** are planned by month (Schedule rules → "How this team is planned"): one line per night with who plays and their start time. "+ Add" books a resident or types in a guest DJ, who is saved as a guest for next time. Print month gives a one-page list.
- **Rules** (Admin → Schedule rules): days off per week, each shift's start time, nights per person per week and people needed per night. Bar is seeded from the manager: 2 days off, 3 early (5:30 PM) and 2 late (7:45 PM) per person; at least 3 on early every night, 4 on Fridays and Saturdays. Changing a start time there also moves the shifts already planned from tonight on; a single night can get its own time from the cell menu (Other time).
- **Time off**: vacation (counted against each person's yearly days), sick days (with a doctor's-note flag), other leave, and asked-off days (Fill week gives them the day off). Adding time off clears that person's shifts on those days.
- **Print**: Schedule → Print gives an A4 landscape sheet per department (or all at once), with the week note and who's away.

## Media

### How it fits together

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

Local test owner (from `supabase/seed.sql`): `admin@gusto.test`. 2FA is set up at the first sign-in. Invitation emails land in Mailpit (http://127.0.0.1:54324).

## Going live

### Command domain and security

1. **Domain**: add `command.gustoaruba.com` to this Vercel project. Keep `stream.gustoaruba.com` attached only if the TVs still open it: on that host everything except the TV player (`/preview/…`, `/play/…`) redirects to command (`vercel.json`). Or point the TVs at `command.gustoaruba.com/preview/<id>` and remove `stream`.
2. **Database**: `supabase db push` applies `20261027130000_gusto_command.sql` (admin roles, 2FA rule, staff tables, audit log). The `editor` role becomes `manager`. Everyone needs the authenticator step from then on.
   `20261028100000_access_tasks_activity.sql` adds per-account access (media, rules, which teams), tasks and the full activity log. Existing managers keep everything (media on, rules on, every team).
   `20261028110000_payments.sql` adds payment requests, vendors and the private `accounting` file bucket. Give the accounting person the **Accounting** switch under Accounts.
3. **Functions**: `supabase functions deploy admin-users read-invoice`. Reading invoices runs through OpenRouter: `supabase secrets set OPENROUTER_API_KEY=…` (locally: put it in `supabase/functions/.env`). It uses `~anthropic/claude-haiku-latest` (always the newest Claude Haiku, about $0.10 per million tokens read); set `OPENROUTER_MODEL` to use another model. Without a key, payment requests work and the details are typed in by hand. Optional `ADMIN_ORIGINS` secret (defaults to `https://command.gustoaruba.com`).
4. **Supabase Auth settings** (dashboard): turn off "Allow new users to sign up" (keep the Email provider on), turn on TOTP MFA, Site URL `https://command.gustoaruba.com`, redirect URL `https://command.gustoaruba.com/**`, minimum password length 10, leaked-password protection on, and a real SMTP sender so invitations and resets arrive.
5. Headers (`vercel.json`): no indexing, HSTS, strict CSP, no framing, no referrer.

### Media

1. **Supabase plan**: photos need more than the free 1 GB of storage (about 2 MB per photo across all sizes). Use Pro.
2. **Database**: `supabase link --project-ref zsldacxapzyliwtcmosv`, then `supabase db push`.
3. **Deploy** this app (Vercel) with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_WEBSITE_URL=https://gustoaruba.com`. The `VITE_IMAGEKIT_*` variables are no longer used.
4. **Move existing photos** off ImageKit (see below).
5. **Switch the TV**: Screens → Main screens → Existing TV link → pick the old slideshow. The TV changes over by itself, with nothing to touch on the computer.
6. **Website**: set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `GALLERY_COOKIE_SECRET` on the gustoaruba.com project.
7. **Removal requests**: `20261028090000_removal_requests.sql` (in the same `db push`) and the updated website (`gusto-web`: `src/lib/gallery.ts`, `src/pages/api/gallery/*`, `src/pages/gallery/[slug].astro`) go live together. Only visitors who unlocked the gallery can ask, always with a reason; requests land under Media → Removal requests, and approving deletes the photo from the album, the website and the screens. The album page is CDN-cached for up to 5 minutes, so a removed photo can linger there that long (its tile drops out once the image is gone).
8. Once everything is checked, ImageKit and the old `imagekit-auth` / `imagekit-delete` edge functions can be retired.

## Moving photos off ImageKit

```bash
export SOURCE_URL=https://zsldacxapzyliwtcmosv.supabase.co SOURCE_SERVICE_KEY=…
export TARGET_URL=https://zsldacxapzyliwtcmosv.supabase.co TARGET_SERVICE_KEY=…
node scripts/migrate-imagekit.mjs                                  # dry run: what it would do
node scripts/migrate-imagekit.mjs --apply --promos                 # import nights + promo flyers
node scripts/migrate-imagekit.mjs --apply --take-over-tv           # optional: switch the TV address
```

It's safe to re-run (it resumes and never duplicates). Nights are the ImageKit folders under `/Gusto-Aruba/` (`oct17`, `Nov8`…). The old app deleted files from ImageKit when slides were removed, so nights whose files are gone are reported and skipped. As of October 2026 that leaves July 3 to October 17, 2026 (21 nights, about 1,900 photos) available. Older nights can be re-uploaded from the photographers' originals as new albums.
