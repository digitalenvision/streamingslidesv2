// Time off across the team: who's out now, what's coming, and each person's balance for the year.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarOff, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { PageHeader, Avatar } from '@/components/AppShell';
import { Button, IconButton, Segmented, Spinner } from '@/components/ui';
import { KindBadge, TimeOffDialog, balance, fmtDays } from '@/components/staff';
import { arubaToday, cn, formatDate, plural } from '@/lib/format';
import { TIME_OFF, addDays, daysBetween, formatRange } from '@/lib/schedule';
import { listDepartments, listEmployees, listTimeOff } from '@/lib/staff';
import { useLoad } from '@/lib/useLoad';
import type { TimeOff as Entry, TimeOffKind } from '@/types';

type Filter = 'all' | TimeOffKind;

export function TimeOff() {
  const today = arubaToday();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const { data, reload } = useLoad(async () => {
    const [departments, employees, entries] = await Promise.all([
      listDepartments(), listEmployees(), listTimeOff(`${year}-01-01`, addDays(`${year}-12-31`, 120)),
    ]);
    return { departments, employees, entries };
  }, [year]);
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Partial<Entry> | null>(params.has('new') ? {} : null);

  const person = (id: string) => data?.employees.find((e) => e.id === id);
  const outNow = data?.entries.filter((t) => t.kind !== 'request' && t.starts_on <= today && t.ends_on >= today) ?? [];
  const upcoming = useMemo(() => {
    if (!data) return [];
    const list = data.entries
      .filter((t) => t.ends_on >= today && (filter === 'all' || t.kind === filter))
      .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
    const months = new Map<string, Entry[]>();
    for (const t of list) {
      const m = (t.starts_on < today ? today : t.starts_on).slice(0, 7);
      months.set(m, [...(months.get(m) ?? []), t]);
    }
    return [...months];
  }, [data, filter, today]);

  const closeDialog = () => { setEditing(null); if (params.has('new')) setParams({}, { replace: true }); };

  return (
    <>
      <PageHeader
        kicker="Team"
        title="Vacation & sick days"
        subtitle="Holidays, sick days, other leave and days people asked off, for every team. Everything here shows up on the schedule."
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing({})}>Add time off</Button>}
      />

      {!data ? <div className="grid h-48 place-items-center"><Spinner /></div> : (
        <>
          <section className="mb-8">
            <h2 className="kicker mb-3">Out today · {formatDate(today, { weekday: 'long', month: 'short', day: 'numeric' })}</h2>
            {outNow.length === 0 ? (
              <p className="panel px-4 py-3.5 text-mute">Everyone’s available.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {outNow.map((t) => {
                  const p = person(t.employee_id);
                  const left = daysBetween(today, t.ends_on);
                  return (
                    <button key={t.id} onClick={() => setEditing(t)} className="panel flex items-center gap-3 py-2.5 pl-2.5 pr-4 text-left hover:border-white/15">
                      <Avatar name={p?.name ?? '?'} />
                      <span className="grid leading-tight">
                        <span className="font-semibold">{p?.name}</span>
                        <span className="text-[12px] text-mute">{TIME_OFF[t.kind].label} · {left === 0 ? 'back tomorrow' : `back ${formatDate(addDays(t.ends_on, 1), { weekday: 'short', month: 'short', day: 'numeric' })}`}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
            <section className="grid content-start gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="kicker">Coming up</h2>
                <Segmented<Filter>
                  size="sm"
                  value={filter}
                  onChange={setFilter}
                  options={[{ value: 'all', label: 'All' }, ...(['vacation', 'sick', 'leave', 'request'] as const).map((k) => ({ value: k, label: TIME_OFF[k].label }))]}
                />
              </div>
              {upcoming.length === 0 && <div className="panel grid place-items-center gap-2 px-6 py-12 text-center text-mute"><CalendarOff className="size-6 text-white/30" />Nothing planned.</div>}
              {upcoming.map(([month, entries]) => (
                <div key={month} className="grid gap-2">
                  <div className="text-[13px] font-semibold text-white/70">{formatDate(`${month}-15`, { month: 'long', year: 'numeric' })}</div>
                  <div className="panel divide-y divide-line">
                    {entries.map((t) => {
                      const p = person(t.employee_id);
                      const d = data.departments.find((x) => x.id === p?.department_id);
                      const n = daysBetween(t.starts_on, t.ends_on) + 1;
                      return (
                        <button key={t.id} onClick={() => setEditing(t)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02]">
                          <div className="grid w-12 shrink-0 justify-items-center rounded-lg bg-white/[0.04] py-1.5 leading-none">
                            <span className="kicker !text-[9px]">{formatDate(t.starts_on, { month: 'short' })}</span>
                            <span className="num mt-1 text-[17px] font-semibold">{Number(t.starts_on.slice(8))}</span>
                          </div>
                          <span className="grid min-w-0 flex-1 gap-0.5">
                            <span className="truncate font-semibold">{p?.name ?? 'Former staff'}</span>
                            <span className="truncate text-[12.5px] text-mute">{d?.name} · {formatRange(t.starts_on, t.ends_on)} · {plural(n, 'night')}{t.note ? ` · ${t.note}` : ''}</span>
                          </span>
                          <KindBadge kind={t.kind} />
                          {t.kind === 'sick' && !t.certificate && <span className="hidden text-[11.5px] text-warn sm:inline">no note</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>

            <section className="grid content-start gap-3">
              <div className="flex items-center justify-between">
                <h2 className="kicker">Balances</h2>
                <div className="flex items-center">
                  <IconButton label="Previous year" className="size-8" onClick={() => setYear((y) => y - 1)}><ChevronLeft className="size-4" /></IconButton>
                  <span className="num w-12 text-center text-[13px]">{year}</span>
                  <IconButton label="Next year" className="size-8" onClick={() => setYear((y) => y + 1)}><ChevronRight className="size-4" /></IconButton>
                </div>
              </div>
              <div className="panel overflow-hidden">
                <div className="grid grid-cols-[minmax(0,1fr)_70px_70px_60px] gap-2 border-b border-line px-4 py-2.5 kicker !text-[9.5px]">
                  <span>Person</span><span className="text-right">Vacation</span><span className="text-right">Left</span><span className="text-right">Sick</span>
                </div>
                {data.departments.map((d) => {
                  const people = data.employees.filter((e) => e.department_id === d.id && e.active);
                  if (!people.length) return null;
                  return (
                    <div key={d.id}>
                      <div className="bg-white/[0.02] px-4 py-1.5 text-[11.5px] font-semibold text-white/50">{d.plural}</div>
                      {people.map((e) => {
                        const b = balance(e, data.entries, year, d);
                        return (
                          <div key={e.id} className="grid grid-cols-[minmax(0,1fr)_70px_70px_60px] items-center gap-2 border-t border-line px-4 py-2 text-[13px]">
                            <span className="truncate">{e.name}</span>
                            <span className="num text-right text-white/60">{fmtDays(b.taken + b.planned)}<span className="text-white/30">/{fmtDays(b.allowance)}</span></span>
                            <span className={cn('num text-right font-semibold', b.left < 0 ? 'text-bad' : b.left <= 2 ? 'text-warn' : 'text-teal')}>{fmtDays(b.left)}</span>
                            <span className={cn('num text-right', b.noCertificate ? 'text-warn' : 'text-white/60')} title={b.noCertificate ? `${b.noCertificate} without doctor’s note` : undefined}>{b.sickDays}{b.noCertificate ? '*' : ''}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <p className="text-[11.5px] text-white/40">Vacation counts taken and planned days. * = sick without a doctor’s note yet.</p>
            </section>
          </div>
        </>
      )}

      {data && (
        <TimeOffDialog
          open={!!editing}
          initial={editing ?? undefined}
          employees={data.employees}
          departments={data.departments}
          onClose={closeDialog}
          onSaved={reload}
        />
      )}
    </>
  );
}
