// Owners only: everything that happened in Command, who did it and when, in plain words.
// Rows come from audit_log (written by database triggers, the accounts function and
// sign-ins). Bursts (a week planned at once, an album uploaded) fold into one line;
// open a line to see exactly what changed.
import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Button, Empty, Input, Spinner } from '@/components/ui';
import { cn } from '@/lib/format';
import { listAlbums } from '@/lib/data';
import { TIME_OFF, fmtTime, formatRange } from '@/lib/schedule';
import { listAccounts, listActivity, listDepartments, listEmployees } from '@/lib/staff';
import { listTasks } from '@/lib/tasks';
import { useLoad } from '@/lib/useLoad';
import type { AdminAccount, AuditEntry, Currency } from '@/types';
import { money } from '@/lib/payments';

const AREAS: Record<string, { label: string; tables: string[] }> = {
  all: { label: 'Everything', tables: [] },
  schedule: { label: 'Schedules', tables: ['shifts', 'posts', 'night_openers', 'schedule_weeks', 'schedule_days', 'time_off'] },
  people: { label: 'People', tables: ['employees'] },
  rules: { label: 'Rules', tables: ['departments', 'shift_types'] },
  media: { label: 'Media', tables: ['event_albums', 'event_photos', 'promo_slides', 'screens', 'photo_removal_requests', 'gallery_visitors'] },
  tasks: { label: 'Tasks', tables: ['tasks', 'task_comments'] },
  money: { label: 'Payments & vendors', tables: ['payment_requests', 'payment_files', 'payment_comments', 'vendors'] },
  accounts: { label: 'Accounts & sign-ins', tables: ['admin_accounts', 'session'] },
};

const PAGE = 300;
const TZ = 'America/Aruba';

export function Activity() {
  const [actor, setActor] = useState('');
  const [area, setArea] = useState('all');
  const [day, setDay] = useState('');
  const [more, setMore] = useState<AuditEntry[]>([]);
  const [older, setOlder] = useState(true); // the last page was full, so there may be more
  const [loadingMore, setLoadingMore] = useState(false);
  const range = day ? { from: new Date(`${day}T00:00:00-04:00`).toISOString(), to: new Date(new Date(`${day}T00:00:00-04:00`).getTime() + 86_400_000).toISOString() } : {};
  const filters = { actor: actor || undefined, tables: AREAS[area].tables, ...range };

  const lookups = useLoad(async (): Promise<Lookups> => {
    const [accounts, employees, departments, albums, tasks] = await Promise.all([
      listAccounts().catch(() => []), listEmployees(), listDepartments(), listAlbums().catch(() => []), listTasks().catch(() => []),
    ]);
    return {
      accounts,
      people: new Map(accounts.map((a) => [a.user_id, a.name ?? a.email?.split('@')[0] ?? 'Someone'])),
      employees: new Map(employees.map((e) => [e.id, e.name])),
      departments: new Map(departments.map((d) => [d.id, d.plural])),
      albums: new Map(albums.map((a) => [a.id, a.title])),
      tasks: new Map(tasks.map((t) => [t.id, t.title])),
    };
  });
  const first = useLoad(() => listActivity({ limit: PAGE, ...filters }), [actor, area, day]);
  const rows = useMemo(() => [...(first.data ?? []), ...more], [first.data, more]);
  const L = lookups.data;

  const loadMore = async () => {
    setLoadingMore(true);
    try { const next = await listActivity({ limit: PAGE, before: rows.at(-1)?.at, ...filters }); setMore((m) => [...m, ...next]); setOlder(next.length === PAGE); }
    finally { setLoadingMore(false); }
  };
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { setMore([]); setOlder(true); fn(v); };

  return (
    <>
      <PageHeader kicker="Admin · owners only" title="Activity" subtitle="Who did what in Command, and when. Open a line to see exactly what changed." />
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <select className="field h-10 sm:w-56" value={actor} onChange={(e) => reset(setActor)(e.target.value)} aria-label="Person">
          <option value="">Everyone</option>
          {L?.accounts.map((a) => <option key={a.user_id} value={a.user_id}>{a.name ?? a.email}</option>)}
        </select>
        <select className="field h-10 sm:w-56" value={area} onChange={(e) => reset(setArea)(e.target.value)} aria-label="Area">
          {Object.entries(AREAS).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
        </select>
        <Input type="date" value={day} onChange={(e) => reset(setDay)(e.target.value)} className="h-10 sm:w-48" aria-label="Day" />
        {(actor || area !== 'all' || day) && <Button variant="ghost" size="sm" onClick={() => { setMore([]); setActor(''); setArea('all'); setDay(''); }}>Clear filters</Button>}
      </div>

      {!first.data || !L ? <div className="grid h-48 place-items-center"><Spinner /></div>
        : rows.length === 0 ? <Empty icon={<History />} title="Nothing here" body="No activity matches these filters." />
        : (
          <>
            <div className="panel divide-y divide-line overflow-hidden">
              {groupByDay(group(rows)).map(([dayLabel, groups]) => (
                <Fragment key={dayLabel}>
                  <div className="sticky top-0 z-[1] bg-ink-850/95 px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-white/50 backdrop-blur">{dayLabel}</div>
                  {groups.map((g) => <Line key={g.rows[0].id} g={g} L={L} />)}
                </Fragment>
              ))}
            </div>
            {first.data.length === PAGE && older && (
              <div className="mt-4 grid place-items-center"><Button loading={loadingMore} onClick={loadMore}>Show older</Button></div>
            )}
          </>
        )}
    </>
  );
}

interface Lookups {
  accounts: AdminAccount[];
  people: Map<string, string>;
  employees: Map<string, string>;
  departments: Map<string, string>;
  albums: Map<string, string>;
  tasks: Map<string, string>;
}
interface Group { rows: AuditEntry[] }

/** Same person, same kind of change, within two minutes: one line. */
function group(rows: AuditEntry[]): Group[] {
  const out: Group[] = [];
  for (const r of rows) {
    const g = out.at(-1);
    const head = g?.rows[0];
    if (g && head && head.actor === r.actor && head.table_name === r.table_name && head.action === r.action && r.action !== 'sign_in'
      && new Date(g.rows.at(-1)!.at).getTime() - new Date(r.at).getTime() < 120_000) g.rows.push(r);
    else out.push({ rows: [r] });
  }
  return out;
}

function groupByDay(groups: Group[]): [string, Group[]][] {
  const out = new Map<string, Group[]>();
  for (const g of groups) {
    const label = new Date(g.rows[0].at).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    out.set(label, [...(out.get(label) ?? []), g]);
  }
  return [...out];
}

function Line({ g, L }: { g: Group; L: Lookups }) {
  const [open, setOpen] = useState(false);
  const r = g.rows[0];
  const who = r.actor ? L.people.get(r.actor) ?? r.actor_email?.split('@')[0] ?? 'Someone' : r.table_name === 'photo_removal_requests' && r.action === 'insert' ? 'A website visitor' : 'System';
  const text = g.rows.length > 1 ? many(g.rows, L) : describe(r, L);
  const time = new Date(r.at).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  const detail = g.rows.some((x) => x.changes || x.action !== 'sign_in');
  return (
    <div>
      <button onClick={() => detail && setOpen((o) => !o)} className={cn('flex w-full items-start gap-3 px-4 py-2.5 text-left text-[13.5px]', detail && 'hover:bg-white/[0.03]')}>
        <span className="num w-[68px] shrink-0 pt-px text-[12px] text-white/45">{time}</span>
        <span className="min-w-0 flex-1"><b className="font-semibold text-white">{who}</b> <span className="text-white/75">{text}</span></span>
        {detail && <ChevronDown className={cn('mt-0.5 size-4 shrink-0 text-white/30 transition-transform', open && 'rotate-180')} />}
      </button>
      {open && (
        <div className="grid gap-2 px-4 pb-3 pl-[100px] text-[12.5px]">
          {g.rows.slice(0, 60).map((x) => (
            <div key={x.id} className="rounded-lg bg-white/[0.03] px-3 py-2">
              {g.rows.length > 1 && <div className="mb-1 text-white/70">{describe(x, L)}</div>}
              {x.changes ? (
                <dl className="grid grid-cols-[minmax(90px,auto)_1fr] gap-x-3 gap-y-0.5">
                  {Object.entries(x.changes).map(([k, [a, b]]) => (
                    <Fragment key={k}>
                      <dt className="text-white/45">{label(k)}</dt>
                      <dd className="min-w-0 break-words"><span className="text-white/45 line-through">{show(k, a, L)}</span> → <span className="text-white">{show(k, b, L)}</span></dd>
                    </Fragment>
                  ))}
                </dl>
              ) : <div className="text-white/45">{new Date(x.at).toLocaleString('en-US', { timeZone: TZ })} · {x.actor_email ?? 'no email'}</div>}
            </div>
          ))}
          {g.rows.length > 60 && <p className="text-white/45">…and {g.rows.length - 60} more</p>}
        </div>
      )}
    </div>
  );
}

// --- wording -------------------------------------------------------------------
const day = (d: unknown) => (typeof d === 'string' ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '');
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const label = (k: string) => ({ start_time: 'start', end_time: 'end', employee_id: 'person', employee_ids: 'people', shift_type_id: 'shift', department_id: 'team', starts_on: 'from', ends_on: 'until', hidden_web: 'hidden on website', hidden_screen: 'hidden on screens', show_on_web: 'on website', screen_mode: 'on screens', days_off_per_week: 'days off a week', weekly_target: 'per week', daily_minimum: 'needed per night', can_open: 'can open', usual_start: 'usual start', usual_end: 'usual end', logo_path: 'logo', due_on: 'due' } as Record<string, string>)[k] ?? k.replace(/_/g, ' ');

function show(key: string, v: unknown, L: Lookups): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return v.length ? v.map((x) => show(key, x, L)).join(', ') : '—';
  if (typeof v === 'string') {
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(v)) return fmtTime(v);
    if (/^[0-9a-f-]{36}$/.test(v)) return L.employees.get(v) ?? L.people.get(v) ?? L.albums.get(v) ?? 'someone';
    if (key === 'department_id' || key === 'teams') return L.departments.get(v) ?? v;
    return v.length > 120 ? `${v.slice(0, 120)}…` : v;
  }
  return JSON.stringify(v);
}

function describe(r: AuditEntry, L: Lookups): string {
  const x = r.record ?? {};
  const ch = r.changes ?? {};
  const emp = L.employees.get(str(x.employee_id)) ?? 'someone';
  const verb = r.action === 'insert' ? 'added' : r.action === 'update' ? 'changed' : 'deleted';
  const fields = Object.keys(ch).map(label).join(', ');
  const title = str(x.title) || str(x.name);
  switch (r.table_name) {
    case 'session': return 'signed in';
    case 'shifts': {
      const what = x.kind === 'off' ? 'a day off' : `${fmtTime(str(x.start_time))}${x.end_time ? ` – ${fmtTime(str(x.end_time))}` : ''}${x.note ? ` (${x.note})` : ''}`;
      if (r.action === 'delete') return `cleared ${emp} on ${day(x.date)}`;
      return `${r.action === 'insert' ? 'scheduled' : 'changed'} ${emp} on ${day(x.date)} to ${what}`;
    }
    case 'time_off': {
      const kind = TIME_OFF[x.kind as keyof typeof TIME_OFF]?.label.toLowerCase() ?? 'time off';
      const when = formatRange(str(x.starts_on), str(x.ends_on));
      return r.action === 'insert' ? `added ${kind} for ${emp}, ${when}` : r.action === 'update' ? `changed ${kind} for ${emp} (${when})${fields ? `: ${fields}` : ''}` : `removed ${kind} for ${emp}, ${when}`;
    }
    case 'employees': return r.action === 'insert' ? `added ${title} to People` : r.action === 'update' ? `changed ${title}${fields ? `: ${fields}` : ''}` : `removed ${title} from People`;
    case 'night_openers': return r.action === 'delete' ? `removed the opener on ${day(x.date)}` : `set ${emp} to open on ${day(x.date)}`;
    case 'schedule_days': return r.action === 'delete' ? `removed the note on ${day(x.date)}` : `noted “${str(x.note)}” on ${day(x.date)}`;
    case 'schedule_weeks': return `${verb} the ${L.departments.get(str(x.department_id)) ?? ''} note for the week of ${day(x.week_start)}`;
    case 'posts': return `${verb} post ${str(x.location)} on ${day(x.date)}${r.action === 'update' ? `${fields ? `: ${fields}` : ''}` : ''}`;
    case 'departments': return r.action === 'update' ? `changed the rules for ${title}${fields ? `: ${fields}` : ''}` : `${verb} team ${title}`;
    case 'shift_types': return `${verb} shift ${title} for ${L.departments.get(str(x.department_id)) ?? 'a team'}${r.action === 'update' ? `${fields ? `: ${fields}` : ''}` : ''}`;
    case 'event_albums':
      if (r.action === 'update' && ch.status && x.status === 'published') return `published album “${title}”`;
      return r.action === 'update' ? `changed album “${title}”${fields ? `: ${fields}` : ''}` : `${r.action === 'insert' ? 'created' : 'deleted'} album “${title}”`;
    case 'event_photos': {
      const album = L.albums.get(str(x.album_id)) ?? 'an album';
      return r.action === 'insert' ? `added a photo to “${album}”` : r.action === 'delete' ? `deleted a photo from “${album}”` : `changed a photo in “${album}”${fields ? `: ${fields}` : ''}`;
    }
    case 'promo_slides': return `${verb} promo slide “${title}”${r.action === 'update' ? `${fields ? `: ${fields}` : ''}` : ''}`;
    case 'screens': return `${verb} screen “${title}”${r.action === 'update' ? `${fields ? `: ${fields}` : ''}` : ''}`;
    case 'photo_removal_requests':
      if (r.action === 'insert') return `asked to remove a photo (${str(x.email)})`;
      if (x.status === 'done') return `approved a photo removal request from ${str(x.email)}`;
      if (x.status === 'rejected') return `declined a photo removal request from ${str(x.email)}`;
      return `changed a removal request${fields ? `: ${fields}` : ''}`;
    case 'vendors': return `${verb} vendor “${title}”${r.action === 'update' ? (ch.account_number || ch.iban ? ' (bank details changed)' : fields ? `: ${fields}` : '') : ''}`;
    case 'payment_requests': {
      const what = `${str(x.payee)} ${money(Number(x.amount), (x.currency as Currency) ?? 'AWG')}`;
      if (r.action === 'insert') return `asked to pay ${what}${x.urgent ? ' (urgent)' : ''}`;
      if (r.action === 'delete') return `deleted the payment request ${what}`;
      if (ch.status) return x.status === 'paid' ? `marked ${what} as paid${x.paid_reference ? ` (ref ${str(x.paid_reference)})` : ''}` : x.status === 'on_hold' ? `put ${what} on hold: “${str(x.status_note)}”` : x.status === 'rejected' ? `rejected ${what}: “${str(x.status_note)}”` : `put ${what} back on the list to pay`;
      return `changed the payment request ${what}${fields ? `: ${fields}` : ''}`;
    }
    case 'payment_files': return `${r.action === 'insert' ? (x.kind === 'proof' ? 'added proof of payment' : 'added a file') : 'removed a file'} (${str(x.name)})`;
    case 'payment_comments': return `${r.action === 'insert' ? 'wrote on a payment request' : 'deleted a message on a payment request'}${r.action === 'insert' ? `: “${str(x.body).slice(0, 80)}”` : ''}`;
    case 'gallery_visitors': return `deleted gallery email ${str(x.email)}`;
    case 'tasks':
      if (r.action === 'update' && ch.status) return x.status === 'done' ? `completed task “${title}”` : `moved task “${title}” to ${x.status === 'doing' ? 'in progress' : 'to do'}`;
      return r.action === 'update' ? `changed task “${title}”${fields ? `: ${fields}` : ''}` : `${verb} task “${title}”`;
    case 'task_comments': return `${r.action === 'insert' ? 'commented on' : 'deleted a comment on'} “${L.tasks.get(str(x.task_id)) ?? 'a task'}”${r.action === 'insert' ? `: “${str(x.body).slice(0, 80)}”` : ''}`;
    case 'admin_accounts': {
      if (x.mfa_reset) return `reset the authenticator for ${L.people.get(str(r.record_id)) ?? 'an account'}`;
      if (r.action === 'insert') {
        const as = x.role === 'owner' ? 'owner' : Array.isArray(x.teams) ? `team manager (${x.teams.map((t) => L.departments.get(String(t)) ?? t).join(', ')})` : 'manager';
        return `invited ${str(x.email)} as ${as}`;
      }
      if (r.action === 'delete') return `removed the account of ${L.people.get(str(r.record_id)) ?? 'someone'}`;
      const acc = L.people.get(str(r.record_id)) ?? 'an account';
      return `changed ${acc}: ${Object.entries(x).map(([k, v]) => `${label(k)} ${show(k, v, L)}`).join(', ')}`;
    }
    default: return `${verb} ${r.table_name.replace(/_/g, ' ')}`;
  }
}

function many(rows: AuditEntry[], L: Lookups): string {
  const r = rows[0];
  const n = rows.length;
  const people = [...new Set(rows.map((x) => L.employees.get(str(x.record?.employee_id))).filter(Boolean))];
  switch (r.table_name) {
    case 'shifts': return `${r.action === 'delete' ? 'cleared' : r.action === 'insert' ? 'scheduled' : 'changed'} ${n} shifts${people.length <= 3 ? ` (${people.join(', ')})` : ` for ${people.length} people`}`;
    case 'event_photos': return `${r.action === 'insert' ? 'added' : r.action === 'delete' ? 'deleted' : 'changed'} ${n} photos ${r.action === 'insert' ? 'to' : 'in'} “${L.albums.get(str(r.record?.album_id)) ?? 'an album'}”`;
    case 'night_openers': return `set the openers for ${n} nights`;
    case 'posts': return `${r.action === 'insert' ? 'added' : r.action === 'delete' ? 'deleted' : 'changed'} ${n} posts`;
    default: return `${describe(r, L)} (and ${n - 1} more)`;
  }
}
