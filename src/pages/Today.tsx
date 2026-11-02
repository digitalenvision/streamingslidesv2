// Home: tonight at a glance. Who's working (and when), who's out, whether this week's and
// next week's schedules are done, and what's on the screens.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Banknote, Cake, Check, KeyRound, ListTodo, Flag, Images, Megaphone, Monitor, Plus, Users } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { AlbumCard } from '@/components/AlbumCard';
import { Badge, Button } from '@/components/ui';
import { NameOrLogo } from '@/components/staff';
import { NewAlbumDialog, loadAlbumsWithCovers } from './Albums';
import { listPromos, listRemovalRequests } from '@/lib/data';
import { albumName, arubaToday, cn, formatDate, plural } from '@/lib/format';
import { TIME_OFF, addDays, cellAt, formatRange, fmtTime, isoWeek, nextBirthday, weekStart, weekday } from '@/lib/schedule';
import { supabase } from '@/lib/supabase';
import { displayName, useAuth } from '@/lib/auth';
import { can } from '@/lib/access';
import { useLoad } from '@/lib/useLoad';
import { useRemote } from '@/lib/useRemote';
import { useWeek } from '@/lib/useWeek';
import { Chip } from './staff/Schedule';
import type { Department, Employee, Screen, Task } from '@/types';
import { listTasks } from '@/lib/tasks';
import { listRequests, totals, when } from '@/lib/payments';

export function Today() {
  const auth = useAuth();
  const night = arubaToday(true);
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Aruba', hour: 'numeric', hour12: false }).format(new Date()));
  const greeting = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = displayName(auth).split(' ')[0];

  return (
    <>
      <PageHeader
        kicker={`${formatDate(night, { weekday: 'long', month: 'long', day: 'numeric' })}${hour < 6 ? ' · still tonight' : ''}`}
        title={<>{greeting}{name ? <span className="capitalize">, {name}</span> : ''}</>}
      />
      {can(auth.access, 'accounting') && <PaymentsToday />}
      <TasksToday />
      {can(auth.access, 'staff') && <TeamToday night={night} />}
      {can(auth.access, 'media') && <MediaToday />}
    </>
  );
}

function TeamToday({ night }: { night: string }) {
  const thisWeek = weekStart(night);
  const now = useWeek(thisWeek);
  const next = useWeek(addDays(thisWeek, 7));
  const col = weekday(night);

  if (!now.data) return <div className="mb-10 grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-56 rounded-2xl" />)}</div>;
  const depts = now.data.departments.filter((d) => d.schedule_by !== 'none' && (now.byDept.get(d.id)?.week.employees.length ?? 0) > 0);

  return (
    <>
      <section className="mb-10 grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="kicker">Tonight’s lineup</h2>
          <Link to="/schedule" className="text-[13px] text-mute hover:text-white">Open schedule</Link>
        </div>
        {(() => {
          const opener = now.data.employees.find((e) => e.id === now.data!.openers.get(night));
          const anyKeys = now.data.employees.some((e) => e.active && e.can_open);
          if (!anyKeys) return null;
          return (
            <Link to="/schedule?dept=bar" className={cn('flex items-center gap-2 text-[14px]', opener ? 'text-white/80' : 'text-warn')}>
              <KeyRound className="size-4 text-gold" />
              {opener ? <>Opens tonight: <b className="text-white">{opener.name}</b></> : 'Nobody is set to open tonight'}
            </Link>
          );
        })()}
        {depts.length === 0 ? (
          <Link to="/people?new=1" className="panel flex items-center gap-3 p-5 hover:border-gold/40"><Users className="size-5 text-gold" /> Add your team to start scheduling <ArrowRight className="ml-auto size-4" /></Link>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {depts.map((d) => {
              const { week, check } = now.byDept.get(d.id)!;
              const working = week.employees
                .map((e) => ({ e, c: cellAt(week, e.id, night) }))
                .filter((x) => x.c.type === 'work')
                .sort((a, b) => (a.c.type === 'work' && b.c.type === 'work' ? (a.c.shift.start_time ?? '').localeCompare(b.c.shift.start_time ?? '') : 0));
              const out = week.employees.map((e) => ({ e, c: cellAt(week, e.id, night) })).filter((x) => x.c.type === 'away');
              // Month and time-block teams (DJs, security) only list who's on; nobody is "not planned".
              const unplanned = d.schedule_by !== 'week' ? 0 : week.employees.filter((e) => cellAt(week, e.id, night).type === 'empty').length;
              const short = check.days[col].short;
              return (
                <Link key={d.id} to={`/schedule?dept=${d.id}`} className="panel group grid content-start gap-3 p-4 transition-colors hover:border-white/15">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-[17px] font-bold">{d.plural}</span>
                    <span className="num text-[12px] text-white/50">{working.length} on</span>
                  </div>
                  {short.map((s) => (
                    <div key={s.type.id} className="flex items-center gap-2 rounded-lg bg-bad/10 px-2.5 py-1.5 text-[12.5px] text-bad">
                      <AlertTriangle className="size-3.5" /> {s.have} of {s.need} on {s.type.name.toLowerCase()}
                    </div>
                  ))}
                  <ul className="grid gap-1">
                    {working.length === 0 && <li className="py-2 text-mute">{unplanned ? 'Not planned yet' : d.schedule_by === 'month' ? 'Nobody booked' : 'Nobody scheduled'}</li>}
                    {working.map(({ e, c }) => c.type === 'work' && (
                      <li key={e.id} className="flex items-center gap-2.5 py-0.5">
                        <span className="num w-[68px] shrink-0 whitespace-nowrap text-[13px] font-semibold text-white/90">{fmtTime(c.shift.start_time)}</span>
                        {c.shiftType ? <Chip type={c.shiftType} /> : <span className="size-5" />}
                        {e.logo_path ? <NameOrLogo e={e} className="h-5" /> : <span className="truncate">{e.name}</span>}
                      </li>
                    ))}
                  </ul>
                  {(out.length > 0 || unplanned > 0) && (
                    <div className="mt-1 grid gap-1 border-t border-line pt-2.5 text-[12px] text-mute">
                      {out.map(({ e, c }) => c.type === 'away' && <span key={e.id}>{e.name} · <span className={c.timeOff.kind === 'sick' ? 'text-bad' : 'text-teal'}>{TIME_OFF[c.timeOff.kind].label.toLowerCase()}</span></span>)}
                      {unplanned > 0 && <span className="text-warn">{plural(unplanned, 'person', 'people')} not planned tonight</span>}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <Birthdays night={night} people={now.data.employees.filter((e) => e.active && !e.guest)} departments={now.data.departments} />

      {depts.some((d) => d.schedule_by === 'week') && (
        <section className="mb-10 grid gap-3">
          <h2 className="kicker">Schedules</h2>
          <div className="panel divide-y divide-line">
            {[{ w: now, label: 'This week', start: thisWeek }, { w: next, label: 'Next week', start: addDays(thisWeek, 7) }].map(({ w, label, start }) => (
              <div key={start} className="grid gap-2 px-4 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
                <div className="grid leading-tight">
                  <span className="font-semibold">{label}</span>
                  <span className="num text-[11.5px] text-white/45">W{isoWeek(start)} · {formatRange(start, addDays(start, 6))}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {depts.filter((d) => d.schedule_by === 'week').map((d) => {
                    const c = w.byDept.get(d.id)?.check;
                    if (!c) return <span key={d.id} className="skeleton h-8 w-28 rounded-lg" />;
                    const done = !c.empty && !c.problems;
                    return (
                      <Link key={d.id} to={`/schedule?dept=${d.id}&week=${start}`} className={cn('flex h-8 items-center gap-2 rounded-lg border px-3 text-[12.5px] font-medium', done ? 'border-ok/25 text-ok' : c.problems ? 'border-bad/30 text-bad' : 'border-warn/30 text-warn')}>
                        {done ? <Check className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                        {d.plural}
                        <span className="text-white/50">{done ? 'done' : c.empty ? `${c.empty} empty` : plural(c.problems, 'issue')}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** Accounting: what has to be paid today (urgent, due or overdue). */
function PaymentsToday() {
  const { data } = useLoad(listRequests);
  const due = (data ?? []).filter((r) => r.status === 'open' && when(r) === 'today');
  if (!due.length) return null;
  return (
    <section className="mb-10">
      <Link to="/payments" className="panel flex flex-wrap items-center gap-3 border-bad/30 bg-bad/[0.06] px-4 py-3.5 hover:border-bad/50">
        <Banknote className="size-5 text-bad" />
        <span className="font-semibold">To pay today: {due.length} {due.length === 1 ? 'payment' : 'payments'}</span>
        <span className="font-semibold tabular-nums text-white/80">{totals(due)}</span>
        <span className="ml-auto text-[13px] text-white/55">{due.slice(0, 3).map((r) => r.payee).join(', ')}{due.length > 3 ? '…' : ''}</span>
      </Link>
    </section>
  );
}

/** Tasks still to do (urgent and overdue first), for whoever they're meant for. */
function TasksToday() {
  const { data } = useLoad(listTasks);
  const today = arubaToday();
  const todo = (data ?? []).filter((t) => t.status !== 'done');
  if (!todo.length) return null;
  const rank = (t: Task) => (t.priority === 'urgent' ? 0 : 2) - (t.due_on && t.due_on <= today ? 1 : 0);
  const top = [...todo].sort((a, b) => rank(a) - rank(b)).slice(0, 4);
  return (
    <section className="mb-10 grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="kicker">Tasks · {todo.length} to do</h2>
        <Link to="/tasks" className="text-[13px] text-mute hover:text-white">All tasks</Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {top.map((t) => (
          <Link key={t.id} to={`/tasks?id=${t.id}`} className="panel flex items-center gap-3 px-4 py-3 hover:border-white/15">
            <ListTodo className={cn('size-4 shrink-0', t.priority === 'urgent' ? 'text-bad' : 'text-white/45')} />
            <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
            {t.priority === 'urgent' && <Badge tone="bad">Urgent</Badge>}
            {t.due_on && t.due_on < today && <Badge tone="bad">Overdue</Badge>}
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Birthdays in the next two weeks. */
function Birthdays({ night, people, departments }: { night: string; people: Employee[]; departments: Department[] }) {
  const soon = people
    .filter((e) => e.birthday)
    .map((e) => ({ e, ...nextBirthday(e.birthday!, night) }))
    .filter((b) => b.days <= 14)
    .sort((a, b) => a.days - b.days);
  if (!soon.length) return null;
  return (
    <section className="mb-10 grid gap-3">
      <h2 className="kicker">Birthdays</h2>
      <div className="flex flex-wrap gap-2">
        {soon.map(({ e, date, age, days }) => (
          <Link key={e.id} to={`/people?id=${e.id}`} className={cn('panel flex items-center gap-3 px-4 py-3 hover:border-white/15', days === 0 && 'border-gold/50 bg-gold/[0.07]')}>
            <Cake className={cn('size-5', days === 0 ? 'text-gold' : 'text-white/45')} />
            <span className="grid leading-tight">
              <span className="font-semibold">{e.name} <span className="font-normal text-white/50">turns {age}</span></span>
              <span className={cn('text-[12.5px]', days === 0 ? 'font-semibold text-gold' : 'text-white/55')}>
                {days === 0 ? 'Today!' : days === 1 ? 'Tomorrow' : formatDate(date, { weekday: 'long', month: 'short', day: 'numeric' })}
                {' · '}{departments.find((d) => d.id === e.department_id)?.plural}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function MediaToday() {
  const [creating, setCreating] = useState(false);
  const { data } = useLoad(async () => {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [albums, promos, requests, emails] = await Promise.all([
      loadAlbumsWithCovers(),
      listPromos(),
      listRemovalRequests(),
      supabase.from('gallery_visitors').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
    ]);
    const today = arubaToday();
    return {
      ...albums,
      livePromos: promos.filter((p) => p.active && (!p.starts_on || p.starts_on <= today) && (!p.ends_on || p.ends_on >= today)).length,
      // Photos waiting for a decision (several requests for one photo count once), like the sidebar.
      openRequests: new Set(requests.filter((r) => r.status === 'open').map((r) => r.photo_id ?? r.id)).size,
      newEmails: emails.count ?? 0,
    };
  });
  const drafts = data?.albums.filter((a) => a.status === 'draft') ?? [];

  return (
    <>
      <section className="mb-8 grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="kicker">Media</h2>
          <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New album</Button>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile to="/albums" icon={<Monitor />} label="Albums on screens" value={data?.onScreens.size} />
          <Tile to="/promos" icon={<Megaphone />} label="Promos running" value={data?.livePromos} />
          <Tile to="/visitors" icon={<Users />} label="New emails this week" value={data?.newEmails} />
          <Tile to="/removals" icon={<Flag />} label="Removal requests" value={data?.openRequests} alert={!!data?.openRequests} />
        </div>
        {drafts.length > 0 && (
          <Link to={`/albums/${drafts[0].id}`} className="panel flex items-center gap-3 border-warn/30 bg-warn/[0.06] p-4 hover:border-warn/50">
            <Badge tone="warn" dot>Draft</Badge>
            <span className="min-w-0 flex-1 truncate">{drafts.length === 1 ? `“${albumName(drafts[0])}” isn’t published yet.` : `${drafts.length} albums aren’t published yet.`}</span>
            <ArrowRight className="size-4 shrink-0 text-warn" />
          </Link>
        )}
      </section>

      {data?.screens.length ? (
        <section className="mb-10 grid gap-3">
          <div className="flex items-center justify-between"><h2 className="kicker">Screens</h2><Link to="/screens" className="text-[13px] text-mute hover:text-white">Manage</Link></div>
          <div className="grid gap-3 sm:grid-cols-2">{data.screens.map((s) => <ScreenPulse key={s.id} screen={s} />)}</div>
        </section>
      ) : null}

      <section className="grid gap-4">
        <div className="flex items-center justify-between"><h2 className="kicker">Latest albums</h2><Link to="/albums" className="text-[13px] text-mute hover:text-white">All albums</Link></div>
        {!data ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton aspect-[4/3] rounded-2xl" />)}</div>
        ) : data.albums.length ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4">
            {data.albums.slice(0, 4).map((a) => <AlbumCard key={a.id} album={a} cover={a.cover_photo_id ? data.covers.get(a.cover_photo_id) : undefined} onScreen={data.onScreens.has(a.id)} />)}
          </div>
        ) : (
          <button onClick={() => setCreating(true)} className="panel grid place-items-center gap-2 py-14 text-center hover:border-gold/40">
            <Images className="size-7 text-gold" />
            <span className="font-semibold">Create your first album</span>
          </button>
        )}
      </section>
      <NewAlbumDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function Tile({ to, icon, label, value, alert }: { to: string; icon: ReactNode; label: string; value?: number; alert?: boolean }) {
  return (
    <Link to={to} className="panel grid gap-3 p-4 transition-colors hover:border-white/15">
      <span className={cn('grid size-9 place-items-center rounded-xl [&>svg]:size-[18px]', alert ? 'bg-bad/15 text-bad' : 'bg-white/[0.06] text-gold')}>{icon}</span>
      <span className="grid gap-1">
        <span className="num text-[26px] font-semibold leading-none">{value ?? '–'}</span>
        <span className="text-[12.5px] text-mute">{label}</span>
      </span>
    </Link>
  );
}

function ScreenPulse({ screen }: { screen: Screen }) {
  const { players } = useRemote(screen.id);
  const now = players[0]?.now;
  return (
    <Link to={`/screens/${screen.id}`} className="panel flex items-center gap-3 p-3 hover:border-white/15">
      <div className="grid aspect-video w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-black">
        {now?.src ? <img src={now.src} alt="" className="size-full object-cover" /> : <Monitor className="size-5 text-white/25" />}
      </div>
      <div className="grid min-w-0 gap-1">
        <span className="flex items-center gap-2 font-semibold">{screen.name}{players.length ? <Badge tone="ok" dot>Online</Badge> : <Badge dot>Offline</Badge>}</span>
        <span className="truncate text-[12.5px] text-mute">{now ? (now.kind === 'promo' ? `Promo · ${now.title}` : now.album) : 'Not playing'}</span>
      </div>
    </Link>
  );
}

