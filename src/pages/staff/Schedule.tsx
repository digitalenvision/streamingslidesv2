// The week schedule: one row per person, one column per night, checked against the
// department's rules as you go.
//
// Layout, top to bottom: department + week switcher and actions, a plain-language
// "what still needs doing" card, a legend, the grid, then the note for the print-out.
// Click a cell to change it (or use the keyboard: arrows, the shift letter, O off,
// V vacation, S sick, A asked off, Backspace clear).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, CalendarDays, Check, Columns3, Table2, ChevronLeft, ChevronRight, Copy, MoreHorizontal, Printer,
  Settings2, Sparkles, StickyNote, Trash2, Users,
} from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Button, Dialog, Empty, IconButton, Spinner, Textarea, useConfirm, useToast } from '@/components/ui';
import { arubaToday, cn, plural } from '@/lib/format';
import {
  DAY_LONG, DAY_SHORT, addDays, askedOff, cellAt, cellKey, checkWeek, fillWeek, formatRange, hasRules, fmtTime,
  shiftColor, weekStart, type Assignment, type CellAction,
} from '@/lib/schedule';
import { clearShifts, deletePosts, listPosts, listShifts, saveNightNote, savePosts, saveWeekNote, setBlockShifts, setOpener, setShifts, setTimeOffDay } from '@/lib/staff';
import { useWeek } from '@/lib/useWeek';
import { WeekBoard } from './WeekBoard';
import { Sheet } from './Sheet';
import { MonthSchedule } from './MonthSchedule';
import { BlockWeek } from './BlockWeek';
import type { Department, Employee, ShiftType } from '@/types';

const tonight = () => arubaToday(true);

export function Schedule() {
  const [params, setParams] = useSearchParams();
  const start = weekStart(params.get('week') ?? tonight());
  const { data, loading, reload, set, dates, byDept } = useWeek(start);
  const deptId = params.get('dept') ?? data?.departments.find((d) => d.schedule_by !== 'none')?.id ?? 'bar';
  const dept = data?.departments.find((d) => d.id === deptId);
  const current = byDept.get(deptId);
  const toast = useToast();
  const { confirm, dialog } = useConfirm();

  const go = (patch: Record<string, string>) => setParams((p) => { Object.entries(patch).forEach(([k, v]) => p.set(k, v)); return p; }, { replace: true });

  // The sheet (people as rows, like the Excel schedule) or the board (drag names onto nights).
  const small = useMediaQuery('(max-width: 1023px)');
  const view = (params.get('view') === 'board' ? 'board' : 'sheet') as 'sheet' | 'board';
  const dayParam = params.get('day');

  const [filling, setFilling] = useState(false);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const employees = current?.week.employees ?? [];
  const types = current?.week.shiftTypes ?? [];

  // --- changing cells ------------------------------------------------------------
  const apply = useCallback(async (employee: Employee, date: string, action: CellAction) => {
    if (!data) return;
    const cell = cellAt({ shifts: data.shifts, timeOff: data.timeOff, shiftTypes: data.shiftTypes }, employee.id, date);
    const key = cellKey(employee.id, date);
    try {
      if (action.kind === 'away') {
        await setTimeOffDay(data.timeOff, employee.id, date, action.away);
        await reload();
        return;
      }
      if (action.kind === 'clear') {
        if (cell.type === 'away') await setTimeOffDay(data.timeOff, employee.id, date, null);
        else if (cell.type !== 'empty') {
          set((d) => d && { ...d, shifts: without(d.shifts, key) });
          await clearShifts([{ employee_id: employee.id, date }]);
          return;
        } else if (askedOff(data.timeOff, employee.id, date)) await setTimeOffDay(data.timeOff, employee.id, date, null);
        else return;
        await reload();
        return;
      }
      const row: Assignment = action.kind === 'off'
        ? { employee_id: employee.id, date, kind: 'off', shift_type_id: null, start_time: null }
        : action.kind === 'type'
          ? { employee_id: employee.id, date, kind: 'work', shift_type_id: action.type.id, start_time: action.type.start_time }
          : { employee_id: employee.id, date, kind: 'work', shift_type_id: null, start_time: action.time };
      if (cell.type === 'away') await setTimeOffDay(data.timeOff, employee.id, date, null);
      // Optimistic: show it now, save behind.
      set((d) => d && { ...d, shifts: new Map(d.shifts).set(key, { id: d.shifts.get(key)?.id ?? key, note: null, end_time: d.shifts.get(key)?.end_time ?? null, ...row }) });
      const [saved] = await setShifts([row]);
      set((d) => d && { ...d, shifts: new Map(d.shifts).set(key, saved) });
      if (cell.type === 'away') await reload();
    } catch (e) {
      toast((e as Error).message, 'bad');
      reload();
    }
  }, [data, reload, set, toast]);

  const applyMany = useCallback(async (rows: Assignment[], done?: string) => {
    try {
      await setShifts(rows);
      await reload();
      toast(done ?? `Placed ${plural(rows.length, 'person', 'people')}`);
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  }, [reload, toast]);

  // One start time for everyone working a night (null = back to each shift's own time).
  const setNightTime = async (date: string, time: string | null) => {
    if (!current) return;
    const rows = employees.flatMap((e) => {
      const s = current.week.shifts.get(cellKey(e.id, date));
      if (!s || s.kind !== 'work') return [];
      const type = types.find((t) => t.id === s.shift_type_id);
      const start = time ?? type?.start_time ?? s.start_time;
      return [{ employee_id: e.id, date, kind: 'work' as const, shift_type_id: s.shift_type_id, start_time: start }];
    });
    await applyMany(rows, time ? `Everyone starts at ${fmtTime(time)}` : 'Back to the normal start times');
  };

  // Who opens the club: everyone with keys, from any team (the general manager as backup).
  const openerCandidates = (data?.employees ?? []).filter((e) => e.active && e.can_open)
    .sort((a, b) => Number(a.department_id !== dept?.id) - Number(b.department_id !== dept?.id) || a.position - b.position);
  const pickOpener = async (date: string, id: string | null) => {
    set((d) => { if (!d) return d; const m = new Map(d.openers); if (id) m.set(date, id); else m.delete(date); return { ...d, openers: m }; });
    try { await setOpener(date, id); } catch (e) { toast((e as Error).message, 'bad'); reload(); }
  };
  /** After filling: each night without a good opener gets one of the openers on early (taking turns), else the backup. */
  const assignOpeners = async (rows: Assignment[]) => {
    if (!data || !current) return;
    const early = types.find((t) => t.daily_minimum) ?? types[0];
    const team = openerCandidates.filter((e) => e.department_id === dept?.id);
    const backup = openerCandidates.find((e) => e.department_id !== dept?.id);
    if (!team.length || !early) return;
    const planned = new Map(rows.map((r) => [cellKey(r.employee_id, r.date), r]));
    const isEarly = (id: string, date: string) => {
      const r = planned.get(cellKey(id, date));
      if (r) return r.kind === 'work' && r.shift_type_id === early.id;
      const s = current.week.shifts.get(cellKey(id, date));
      return s?.kind === 'work' && s.shift_type_id === early.id;
    };
    const turns = new Map<string, number>();
    for (const date of dates) {
      const now = data.openers.get(date);
      if (now && (isEarly(now, date) || !team.some((t) => t.id === now))) { turns.set(now, (turns.get(now) ?? 0) + 1); continue; }
      const pick = team.filter((t) => isEarly(t.id, date)).sort((a, b) => (turns.get(a.id) ?? 0) - (turns.get(b.id) ?? 0))[0] ?? backup;
      if (!pick) continue;
      turns.set(pick.id, (turns.get(pick.id) ?? 0) + 1);
      await setOpener(date, pick.id);
    }
  };

  const saveNote = async (date: string, note: string) => {
    try { await saveNightNote(date, note); await reload(); } catch (e) { toast((e as Error).message, 'bad'); }
  };

  // --- whole-week actions --------------------------------------------------------
  const fill = async (keep: boolean) => {
    if (!dept || !current) return;
    setBusy(true);
    try {
      const rows = fillWeek(dept, current.week, keep);
      if (!keep) {
        const kept = new Set(rows.map((r) => cellKey(r.employee_id, r.date)));
        const stale = employees.filter((e) => e.counted).flatMap((e) => dates.filter((d) => current.week.shifts.has(cellKey(e.id, d)) && !kept.has(cellKey(e.id, d))).map((d) => ({ employee_id: e.id, date: d })));
        await clearShifts(stale);
      }
      await setShifts(rows);
      await assignOpeners(rows);
      await reload();
      setFilling(false);
      toast(rows.length ? `Planned ${plural(rows.length, 'night')}` : 'Nothing left to plan');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const copyLastWeek = async () => {
    if (!current) return;
    setMore(false);
    setBusy(true);
    try {
      const prev = await listShifts(addDays(start, -7), addDays(start, -1));
      if (dept?.schedule_by === 'blocks') {
        // Time blocks with their own ends and tags, plus the posts.
        const mine = prev.filter((s) => s.kind === 'work' && employees.some((e) => e.id === s.employee_id) && cellAt(current.week, s.employee_id, addDays(s.date, 7)).type === 'empty');
        await setBlockShifts(mine.map((s) => ({ employee_id: s.employee_id, date: addDays(s.date, 7), start_time: s.start_time!, end_time: s.end_time, note: s.note })));
        const taken = new Set(data!.posts.filter((p) => p.department_id === dept.id).map((p) => p.date));
        const posts = (await listPosts(addDays(start, -7), addDays(start, -1))).filter((p) => p.department_id === dept.id && !taken.has(addDays(p.date, 7)));
        await savePosts(posts.map(({ id: _id, ...p }) => ({ ...p, date: addDays(p.date, 7), employee_ids: p.employee_ids.filter((id) => cellAt(current.week, id, addDays(p.date, 7)).type !== 'away') })));
        await reload();
        toast(mine.length || posts.length ? `Copied ${plural(mine.length, 'shift')} and ${plural(posts.length, 'post')} from last week` : 'Nothing to copy: last week was empty or this week is already planned');
        return;
      }
      const rows: Assignment[] = [];
      for (const s of prev) {
        if (!employees.some((e) => e.id === s.employee_id)) continue;
        const date = addDays(s.date, 7);
        if (cellAt(current.week, s.employee_id, date).type !== 'empty') continue;
        rows.push({ employee_id: s.employee_id, date, kind: s.kind, shift_type_id: s.shift_type_id, start_time: s.start_time });
      }
      await setShifts(rows);
      await reload();
      toast(rows.length ? `Copied ${plural(rows.length, 'night')} from last week` : 'Nothing to copy: last week was empty or this week is already planned');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const clearWeek = async () => {
    if (!current || !dept) return;
    setMore(false);
    if (!(await confirm(`Clear this week for ${dept.plural.toLowerCase()}?`, 'Every planned shift and day off this week is removed. Vacations, sick days and asked-off days stay.', 'Clear week'))) return;
    try {
      await clearShifts(employees.flatMap((e) => dates.map((d) => ({ employee_id: e.id, date: d }))));
      await deletePosts(data!.posts.filter((p) => p.department_id === dept.id).map((p) => p.id));
      await reload();
      toast('Week cleared');
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  };

  // --- render --------------------------------------------------------------------
  if (!data && loading) return <div className="grid h-64 place-items-center"><Spinner /></div>;
  if (!data || !dept || !current) return <Empty icon={<CalendarDays />} title="No departments yet" body="Add one in Schedule rules." action={<Link to="/settings/rules"><Button>Schedule rules</Button></Link>} />;

  const { check } = current;
  const rules = hasRules(dept, types);
  const today = tonight();
  const isThisWeek = start === weekStart(today);
  const dayCol = dayParam != null ? clamp(Number(dayParam) || 0, 0, 6) : Math.max(0, dates.indexOf(today));
  const byMonth = dept.schedule_by === 'month';
  const byBlocks = dept.schedule_by === 'blocks';
  const planned = employees.some((e) => dates.some((d) => current.week.shifts.has(cellKey(e.id, d))));

  return (
    <>
      <PageHeader
        title="Schedule"
        actions={byMonth ? undefined : (
          <>
            <Link to={`/schedule/print?week=${start}&dept=${dept.id}`} target="_blank"><Button icon={<Printer className="size-4" />}>Print</Button></Link>
            {!byBlocks && <Button variant="primary" icon={<Sparkles className="size-4" />} onClick={() => setFilling(true)} disabled={!rules || busy || employees.length === 0} title={rules ? undefined : 'Set rules for this department first'}>
              Auto-fill
            </Button>}
            <div className="relative">
              <IconButton label="More" variant="secondary" className="size-11" onClick={() => setMore((m) => !m)}><MoreHorizontal className="size-5" /></IconButton>
              {more && (
                <Popover onClose={() => setMore(false)} className="right-0 top-full mt-1">
                  <MenuItem icon={<Copy className="size-4" />} onClick={copyLastWeek}>Copy last week</MenuItem>
                  <MenuItem icon={<Trash2 className="size-4" />} onClick={clearWeek}>Clear this week</MenuItem>
                  <Link to={`/settings/rules?dept=${dept.id}`}><MenuItem icon={<Settings2 className="size-4" />}>Rules for {dept.plural.toLowerCase()}</MenuItem></Link>
                </Popover>
              )}
            </div>
          </>
        )}
      />

      {/* Which team, which week */}
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-ink-900 p-1">
            {data.departments.filter((d) => d.schedule_by !== 'none').map((d) => {
              const c = byDept.get(d.id)?.check;
              const people = byDept.get(d.id)?.week.employees.length ?? 0;
              const done = d.schedule_by === 'week' && c && people > 0 && !c.empty && !c.problems;
              return (
                <button
                  key={d.id}
                  role="tab"
                  aria-selected={d.id === dept.id}
                  onClick={() => go({ dept: d.id })}
                  className={cn('flex h-10 items-center gap-2 whitespace-nowrap rounded-lg px-4 text-[14px] font-semibold transition-colors', d.id === dept.id ? 'bg-white text-ink-950' : 'text-white/60 hover:text-white')}
                >
                  {d.plural}
                  {done && <Check className={cn('size-3.5', d.id === dept.id ? 'text-[#12803a]' : 'text-ok')} />}
                </button>
              );
            })}
          </div>
        {!byMonth && !byBlocks && <div className="flex items-center gap-1 rounded-xl border border-line bg-ink-900 p-1" role="tablist" aria-label="View">
          {([['sheet', 'Sheet', Table2], ['board', 'Drag & drop', Columns3]] as const).map(([v, label, Icon]) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => go({ view: v })}
              className={cn('flex h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-[13.5px] font-medium transition-colors', view === v ? 'bg-white/[0.1] text-white' : 'text-white/55 hover:text-white')}
            >
              <Icon className="size-4" />{label}
            </button>
          ))}
        </div>}
        </div>
        {!byMonth && <div className="flex items-center gap-1 rounded-xl border border-line bg-ink-900 p-1">
          <IconButton label="Previous week" className="size-9" onClick={() => go({ week: addDays(start, -7) })}><ChevronLeft className="size-5" /></IconButton>
          <span className="min-w-[120px] flex-1 text-center font-semibold sm:min-w-[150px]">{formatRange(dates[0], dates[6])}</span>
          <IconButton label="Next week" className="size-9" onClick={() => go({ week: addDays(start, 7) })}><ChevronRight className="size-5" /></IconButton>
          <button
            onClick={() => go({ week: weekStart(today) })}
            disabled={isThisWeek}
            className="ml-auto h-9 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium text-white/70 hover:bg-white/[0.06] disabled:text-gold disabled:hover:bg-transparent"
          >
            {isThisWeek ? 'This week' : <>Back to <span className="hidden sm:inline">this week</span><span className="sm:hidden">today</span></>}
          </button>
        </div>}
      </div>


      {byMonth ? (
        <MonthSchedule key={dept.id} dept={dept} />
      ) : employees.length === 0 ? (
        <Empty icon={<Users />} title={`No ${dept.plural.toLowerCase()} yet`} body="Add the people on this team, then plan their week here." action={<Link to="/people?new=1"><Button variant="primary">Add a person</Button></Link>} />
      ) : byBlocks ? (
        <>
          <BlockWeek key={dept.id} dept={dept} data={data} set={set} team={employees} dates={dates} today={today} onNightNote={saveNote} />
          <WeekNote dept={dept} start={start} initial={data.notes.find((n) => n.department_id === dept.id)?.note ?? ''} />
        </>
      ) : (
        <>
          {!planned ? (
            <NotPlanned
              range={formatRange(dates[0], dates[6])}
              dept={dept}
              types={types}
              rules={rules}
              busy={busy}
              onFill={() => fill(true)}
              onCopy={copyLastWeek}
            />
          ) : (
            <Status check={check} employees={employees} dates={dates} rules={rules} onFill={() => setFilling(true)} onGoTo={(_row, col) => go({ day: String(col) })} />
          )}

          {view === 'board' ? (
            <WeekBoard dept={dept} week={current.week} check={check} today={today} small={small} day={dayCol} setDay={(c) => go({ day: String(c) })} apply={apply} applyMany={applyMany} />
          ) : (
            <Sheet
              week={current.week}
              check={check}
              today={today}
              nightNotes={data.nightNotes}
              onNightNote={saveNote}
              onNightTime={setNightTime}
              apply={apply}
              openers={employees.some((e) => e.can_open) ? { byDate: data.openers, candidates: openerCandidates, onPick: pickOpener } : undefined}
            />
          )}

          <WeekNote dept={dept} start={start} initial={data.notes.find((n) => n.department_id === dept.id)?.note ?? ''} />
        </>
      )}

      <Dialog
        open={filling}
        onClose={() => setFilling(false)}
        title={`Auto-fill ${dept.plural.toLowerCase()}`}
        footer={<>
          <Button variant="ghost" onClick={() => setFilling(false)}>Cancel</Button>
          <Button variant="primary" icon={<Sparkles className="size-4" />} onClick={() => fill(true)} loading={busy}>Plan open nights</Button>
        </>}
      >
        <div className="grid gap-4 text-white/80">
          <p>Plans every open night of {formatRange(dates[0], dates[6])} so the week follows the rules:</p>
          <RulesSummary dept={dept} types={types} />
          <p className="text-[13px] text-mute">Nights you already planned stay as they are. Vacations, sick days and asked-off days are respected.</p>
          <button onClick={() => fill(false)} disabled={busy} className="justify-self-start text-[13px] text-white/60 underline underline-offset-2 hover:text-white">
            Or redo the whole week from scratch
          </button>
        </div>
      </Dialog>
      {dialog}
    </>
  );
}

/** A week nobody has planned yet: say so, and offer the ways to start. */
function NotPlanned({ range, dept, types, rules, busy, onFill, onCopy }: {
  range: string; dept: Department; types: ShiftType[]; rules: boolean; busy: boolean; onFill: () => void; onCopy: () => void;
}) {
  return (
    <section className="mb-5 grid gap-4 rounded-2xl border border-gold/25 bg-[linear-gradient(135deg,rgb(228_177_26/.08),transparent_60%)] p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-6">
      <div className="grid gap-2">
        <h2 className="text-[20px]">{range} isn’t planned yet</h2>
        <p className="text-mute">
          {rules ? <>Auto-fill plans the whole week for {dept.plural.toLowerCase()} from the rules in one click. You can then drag people around on the board.</> : <>Drag the team onto the nights below, or copy last week.</>}
        </p>
        {rules && <div className="text-[13px] text-white/70"><RulesSummary dept={dept} types={types} compact /></div>}
      </div>
      <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch">
        {rules && <Button variant="primary" size="lg" icon={<Sparkles className="size-4" />} loading={busy} onClick={onFill}>Auto-fill the week</Button>}
        <Button icon={<Copy className="size-4" />} onClick={onCopy} disabled={busy}>Copy last week</Button>
      </div>
    </section>
  );
}

/** The rules of a department, as sentences. */
export function RulesSummary({ dept, types, compact }: { dept: Department; types: ShiftType[]; compact?: boolean }) {
  const pattern = types.filter((t) => t.weekly_target);
  const minimums = types.filter((t) => t.daily_minimum);
  const lines: ReactNode[] = [];
  if (dept.days_off_per_week != null || pattern.length) {
    const parts = [
      ...pattern.map((t) => `${t.weekly_target} × ${t.name} (${fmtTime(t.start_time)})`),
      dept.days_off_per_week != null && `${dept.days_off_per_week} ${dept.days_off_per_week === 1 ? 'day' : 'days'} off`,
    ].filter(Boolean);
    lines.push(<>Each person gets <b className="text-white">{joinAnd(parts as string[])}</b> a week.</>);
  }
  for (const t of minimums) lines.push(<>At least <b className="text-white">{minimumText(t.daily_minimum!)}</b> on {t.name} ({fmtTime(t.start_time)}) every night.</>);
  if (!lines.length) return <p className="text-mute">No rules yet: plan this team by hand, or add rules in Schedule rules.</p>;
  return (
    <ul className={cn('grid', compact ? 'gap-1' : 'gap-2')}>
      {lines.map((l, i) => <li key={i} className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-gold" /><span>{l}</span></li>)}
    </ul>
  );
}

const joinAnd = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

export function minimumText(min: number[]) {
  const base = Math.min(...min);
  const extra = new Map<number, string[]>();
  min.forEach((n, i) => { if (n > base) extra.set(n, [...(extra.get(n) ?? []), DAY_SHORT[i]]); });
  return [String(base), ...[...extra].map(([n, days]) => `${n} on ${joinAnd(days)}`)].join(', ');
}

/** What still needs doing this week, in plain words. */
function Status({ check, employees, dates, rules, onFill, onGoTo }: {
  check: ReturnType<typeof checkWeek>; employees: Employee[]; dates: string[]; rules: boolean; onFill: () => void; onGoTo: (row: number, col: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const items: { text: ReactNode; row?: number; col?: number }[] = [];
  check.days.forEach((d, i) => d.short.forEach((s) => items.push({
    text: <><b>{DAY_LONG[i]} {Number(dates[i].slice(8))}</b>: {s.have} on {s.type.name}, needs {s.need}</>,
  })));
  employees.forEach((e, row) => check.people.get(e.id)?.problems.forEach((p) => {
    const day = DAY_LONG.findIndex((d) => p.includes(d));
    items.push({ text: <><b>{e.name}</b> {p}</>, row, col: day >= 0 ? day : undefined });
  }));

  if (check.empty === 0 && items.length === 0) {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-ok/25 bg-ok/[0.06] px-4 py-3">
        <span className="grid size-7 place-items-center rounded-full bg-ok/15"><Check className="size-4 text-ok" /></span>
        <span className="font-medium text-ok">Week is complete{rules ? ' and follows every rule' : ''}.</span>
        <span className="text-[13px] text-mute">Ready to print.</span>
      </div>
    );
  }
  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-line bg-ink-900">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        {check.empty > 0 && (
          <span className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-full bg-white/[0.07] text-[12px] font-semibold">{check.empty}</span>
            <b>{check.empty === 1 ? 'night still open' : 'nights still open'}</b>
          </span>
        )}
        {items.length > 0 && (
          <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-warn">
            <span className="grid size-7 place-items-center rounded-full bg-warn/15 text-[12px] font-semibold">{items.length}</span>
            <b>{items.length === 1 ? 'thing to fix' : 'things to fix'}</b>
            <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
          </button>
        )}
        {check.empty > 0 && rules && <Button size="sm" variant="primary" className="ml-auto" icon={<Sparkles className="size-3.5" />} onClick={onFill}>Auto-fill open nights</Button>}
      </div>
      {open && items.length > 0 && (
        <ul className="grid gap-0.5 border-t border-line px-2 py-2">
          {items.map((it, i) => (
            <li key={i}>
              <button
                disabled={it.row == null}
                onClick={() => it.row != null && onGoTo(it.row, it.col ?? 0)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13.5px] text-white/80 enabled:hover:bg-white/[0.05]"
              >
                <AlertTriangle className="size-3.5 shrink-0 text-warn" />
                <span>{it.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Chip({ type, className }: { type: ShiftType; className?: string }) {
  return <span className={cn('inline-grid size-5 place-items-center rounded-md font-mono text-[10.5px] font-bold ring-1 ring-inset', shiftColor(type.color).chip, className)}>{type.code}</span>;
}

function WeekNote({ dept, start, initial }: { dept: Department; start: string; initial: string }) {
  const [note, setNote] = useState(initial);
  const [open, setOpen] = useState(!!initial);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const toast = useToast();
  useEffect(() => { setNote(initial); setOpen(!!initial); setState('idle'); }, [initial, dept.id, start]);
  const save = async () => {
    if (note === initial && state !== 'saved') return;
    setState('saving');
    try {
      await saveWeekNote({ department_id: dept.id, week_start: start, note: note.trim() || null });
      setState('saved');
    } catch (e) {
      toast((e as Error).message, 'bad');
      setState('idle');
    }
  };
  if (!open) {
    return <button onClick={() => setOpen(true)} className="mt-4 flex items-center gap-2 text-[13px] text-white/55 hover:text-white"><StickyNote className="size-4" /> Add a note to the printed schedule</button>;
  }
  return (
    <div className="mt-4 grid gap-1.5">
      <label className="flex items-center justify-between text-[13px] font-medium text-white/80">
        <span className="flex items-center gap-2"><StickyNote className="size-4 text-white/50" /> Note on the printed schedule</span>
        <span className="text-[11.5px] font-normal text-white/40">{state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : ''}</span>
      </label>
      <Textarea autoFocus={!initial} rows={2} className="min-h-16" placeholder="e.g. Halloween on Saturday: everyone in costume, briefing at 17:15" value={note} onChange={(e) => { setNote(e.target.value); setState('idle'); }} onBlur={save} maxLength={500} />
    </div>
  );
}

/** Small floating panel that closes on outside click or Escape. */
function Popover({ children, onClose, className }: { children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const t = setTimeout(() => document.addEventListener('pointerdown', away), 0);
    document.addEventListener('keydown', esc);
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [onClose]);
  return <div ref={ref} className={cn('absolute z-40 min-w-56 animate-fade-up rounded-xl border border-line bg-ink-800 p-1.5 shadow-pop', className)}>{children}</div>;
}

function MenuItem({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] hover:bg-white/[0.07]">
      <span className="text-white/55">{icon}</span>{children}
    </button>
  );
}

function useMediaQuery(q: string) {
  const [match, setMatch] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setMatch(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return match;
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const without = <K, V>(m: Map<K, V>, k: K) => { const n = new Map(m); n.delete(k); return n; };
