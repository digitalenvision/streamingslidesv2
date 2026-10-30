// The schedule as a spreadsheet, the way the managers already keep it in Excel:
// a person per row, a night per column, "5:30 PM", "7:45 PM" or "off" in the cells,
// how many people work each night along the top, and a note above a night ("Halloween").
//
// Editing works like Excel: click a cell and type (5:30, 7:45, 5, off, or a letter:
// E early, L late, O off, V vacation, S sick, A asked off), then Enter (down), Tab (right)
// or the arrows. Backspace clears. Double-click, or the ▾ on the selected cell, opens a
// menu with every option. Clicking a night's date sets one start time for everyone that
// night (Halloween: everyone at 5:00).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Cake, Check, ChevronDown, Flag, KeyRound } from 'lucide-react';
import { Floating } from './MonthSchedule';
import { Button, Dialog, TimeSelect, useToast } from '@/components/ui';
import { cn } from '@/lib/format';
import {
  DAY_LONG, DAY_SHORT, TIME_OFF, askedOff, cellAt, cellText, checkWeek, fmtTime, hhmm, parseCellInput, weekday,
  type Cell, type CellAction, type WeekData, isBirthday,
} from '@/lib/schedule';
import type { Employee, ShiftType } from '@/types';

interface Props {
  week: WeekData;
  check: ReturnType<typeof checkWeek>;
  today: string;
  nightNotes: Map<string, string>;
  onNightNote: (date: string, note: string) => Promise<void>;
  onNightTime: (date: string, time: string | null) => Promise<void>;
  apply: (e: Employee, date: string, action: CellAction) => Promise<void>;
  /** Who opens the club each night, and everyone with keys (any team). */
  openers?: { byDate: Map<string, string>; candidates: Employee[]; onPick: (date: string, id: string | null) => void };
}

const LINE = 'border-b border-r border-white/[0.09]';

export function Sheet({ week, check, today, nightNotes, onNightNote, onNightTime, apply, openers }: Props) {
  const toast = useToast();
  const { employees, dates, shiftTypes: types } = week;
  const [sel, setSel] = useState<{ row: number; col: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // text being typed into the selected cell
  const [menu, setMenu] = useState(false);
  const [night, setNight] = useState<number | null>(null); // header menu for a whole night
  const [opening, setOpening] = useState<{ col: number; rect: DOMRect } | null>(null);
  // Typing goes into a hidden field (like Google Sheets does), so key presses, phone
  // keyboards, dictation and paste all start editing the selected cell.
  const keys = useRef<HTMLInputElement>(null);
  const touch = useRef(false);

  const focusGrid = () => {
    keys.current?.focus({ preventScroll: true });
    requestAnimationFrame(() => { if (document.activeElement === document.body) keys.current?.focus({ preventScroll: true }); });
  };
  const move = (dr: number, dc: number) => setSel((s) => s && { row: clamp(s.row + dr, 0, employees.length - 1), col: clamp(s.col + dc, 0, 6) });

  const commit = (text: string, then?: [number, number]) => {
    if (!sel) return;
    const e = employees[sel.row];
    const action = parseCellInput(text, types);
    focusGrid();
    setEditing(null);
    if (!action) {
      toast(`“${text}” isn’t a time. Try 5:30, 7:45 or off.`, 'bad');
      return;
    }
    apply(e, dates[sel.col], action);
    if (then) move(...then);
    focusGrid();
  };

  const onKey = (ev: React.KeyboardEvent) => {
    if (!sel || menu || night != null) return;
    const k = ev.key;
    const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Enter: [1, 0], Tab: [0, ev.shiftKey ? -1 : 1] };
    if (arrows[k]) { ev.preventDefault(); move(...arrows[k]); return; }
    if (k === 'Backspace' || k === 'Delete') { ev.preventDefault(); apply(employees[sel.row], dates[sel.col], { kind: 'clear' }); return; }
    if (k === 'F2') { ev.preventDefault(); setEditing(cellText(cellAt(week, employees[sel.row].id, dates[sel.col]))); }
  };
  const onType = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const typed = ev.target.value;
    ev.target.value = '';
    if (sel && typed) setEditing((cur) => (cur ?? '') + typed);
  };

  useEffect(() => { setEditing(null); }, [sel?.row, sel?.col]);

  const selCell = sel ? cellAt(week, employees[sel.row].id, dates[sel.col]) : null;

  return (
    <>
      <div className="scroll-thin overflow-x-auto rounded-xl border border-white/[0.09] bg-ink-900">
        <input ref={keys} onKeyDown={onKey} onChange={onType} aria-label="Type a start time or off" className="pointer-events-none fixed left-0 top-0 size-px opacity-0" autoComplete="off" />
        <div
          role="grid"
          aria-label="Schedule"
          className="grid min-w-[820px] outline-none"
          style={{ gridTemplateColumns: 'minmax(130px, 1.2fr) repeat(7, minmax(92px, 1fr)) 44px' }}
        >
          {/* night notes (Halloween…) */}
          <div className={cn(LINE, 'sticky left-0 z-10 bg-ink-900 px-3 py-1 text-[11.5px] text-white/35')}>Note</div>
          {dates.map((d) => <NightNote key={d} date={d} note={nightNotes.get(d) ?? ''} onSave={onNightNote} />)}
          <div className={LINE} />

          {/* day headers */}
          <div className={cn(LINE, 'sticky left-0 z-10 bg-ink-850')} />
          {dates.map((d, i) => (
            <button
              key={d}
              onClick={() => setNight(i)}
              title="Set one start time for everyone this night"
              className={cn(LINE, 'bg-ink-850 px-2 py-2 text-center text-[13px] font-semibold hover:bg-white/[0.06]', d === today && 'text-gold')}
            >
              {DAY_LONG[i]} {Number(d.slice(8))}
            </button>
          ))}
          <div className={cn(LINE, 'bg-ink-850')} />

          {/* how many work each night */}
          <div className={cn(LINE, 'sticky left-0 z-10 bg-ink-850 px-3 py-1.5 text-[12px] text-white/50')}>Working</div>
          {dates.map((d, i) => {
            const day = check.days[i];
            const short = day.short.length > 0;
            const tip = types.map((t) => `${t.name}: ${day.byType.get(t.id) ?? 0}${t.daily_minimum ? ` of ${t.daily_minimum[weekday(d)]} needed` : ''}`).join('\n');
            return (
              <div key={d} title={tip} className={cn(LINE, 'flex items-center justify-center gap-1 bg-ink-850 py-1.5 text-[15px] font-bold tabular-nums', short && 'text-bad')}>
                {day.working}
                {short && <AlertTriangle className="size-3.5" aria-label={day.short.map((s) => `${s.have} of ${s.need} on ${s.type.name}`).join(', ')} />}
              </div>
            );
          })}
          <div className={cn(LINE, 'bg-ink-850')} />

          {/* who opens the club for the early staff */}
          {openers && (
            <>
              <div className={cn(LINE, 'sticky left-0 z-10 flex items-center gap-1.5 bg-ink-850 px-3 py-1.5 text-[12px] text-white/50')}><KeyRound className="size-3.5" /> Opens</div>
              {dates.map((d, i) => {
                const id = openers.byDate.get(d);
                const who = openers.candidates.find((c) => c.id === id);
                const st = who ? openerStatus(week, who, d) : null;
                const missing = !who && check.days[i].empty === 0 && check.days[i].working > 0;
                return (
                  <button
                    key={d}
                    onClick={(ev) => setOpening({ col: i, rect: ev.currentTarget.getBoundingClientRect() })}
                    title={st?.problem ?? (missing ? 'Nobody is set to open' : 'Who opens for the early staff')}
                    className={cn(LINE, 'flex items-center justify-center gap-1 bg-ink-850 py-1.5 text-[13px] font-semibold hover:bg-white/[0.06]',
                      st?.problem ? (st.bad ? 'text-bad' : 'text-warn') : who ? 'text-gold' : missing ? 'text-bad' : 'text-white/25')}
                  >
                    {who ? <>{who.name}{st?.problem && <AlertTriangle className="size-3.5" />}</> : missing ? 'Nobody' : '—'}
                  </button>
                );
              })}
              <div className={cn(LINE, 'bg-ink-850')} />
            </>
          )}

          {/* people */}
          {employees.map((e, row) => {
            const p = check.people.get(e.id)!;
            return (
              <div key={e.id} className="contents" role="row">
                <div className={cn(LINE, 'sticky left-0 z-10 flex items-center truncate bg-ink-900 px-3 text-[14px] font-semibold', sel?.row === row && 'bg-[#1a1228]')}>
                  <span className="truncate">{e.name}</span>
                  {dates.some((d) => isBirthday(e.birthday, d)) && <Cake className="ml-1.5 size-3.5 shrink-0 text-gold" aria-label={`Birthday on ${DAY_LONG[dates.findIndex((d) => isBirthday(e.birthday, d))]}`} />}
                  {!e.counted && <span className="ml-2 shrink-0 text-[11px] font-normal text-white/40" title="Not in the nightly counts or weekly rules">{e.job_title?.toLowerCase() || 'not counted'}</span>}
                </div>
                {dates.map((d, col) => {
                  const c = cellAt(week, e.id, d);
                  const isSel = sel?.row === row && sel?.col === col;
                  const asked = !!askedOff(week.timeOff, e.id, d);
                  return (
                    <div
                      key={d}
                      role="gridcell"
                      aria-selected={isSel}
                      aria-label={`${e.name}, ${DAY_LONG[col]}: ${cellText(c) || 'empty'}`}
                      onPointerDown={(ev) => { touch.current = ev.pointerType === 'touch'; }}
                      onClick={() => { setSel({ row, col }); if (touch.current) setMenu(true); else keys.current?.focus({ preventScroll: true }); }}
                      onDoubleClick={() => { setSel({ row, col }); setMenu(true); }}
                      className={cn(LINE, 'relative flex h-10 cursor-cell select-none items-center justify-center text-[14px] tabular-nums', d === today && 'bg-gold/[0.04]', isSel && 'z-[5] outline outline-2 -outline-offset-2 outline-gold')}
                    >
                      {isSel && editing != null ? (
                        <CellInput
                          value={editing}
                          onChange={setEditing}
                          onCommit={commit}
                          onCancel={() => { setEditing(null); focusGrid(); }}
                        />
                      ) : (
                        <>
                          <CellValue cell={c} types={types} />
                          {isBirthday(e.birthday, d) && <Cake className="absolute left-1 top-1 size-3 text-gold" aria-label="Birthday" />}
                          {asked && <Flag className={cn('absolute right-1 top-1 size-3', c.type === 'work' ? 'text-bad' : 'text-warn')} aria-label="Asked for this day off" />}
                          {isSel && (
                            <button
                              type="button"
                              aria-label="More options"
                              onClick={(ev) => { ev.stopPropagation(); setMenu(true); }}
                              className="absolute bottom-0 right-0 grid h-4 w-5 place-items-center rounded-tl bg-gold text-ink-950"
                            >
                              <ChevronDown className="size-3" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
                <div className={cn(LINE, 'grid place-items-center')} title={p.problems.join('\n') || (p.empty ? `${p.empty} nights not filled in` : 'Week follows the rules')}>
                  {p.empty > 0 ? <span className="text-[11px] text-white/30">{p.empty}</span> : p.problems.length ? <AlertTriangle className="size-3.5 text-warn" /> : <Check className="size-3.5 text-ok" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 px-1 text-[12px] text-white/40">
        Click a cell and type <b className="font-medium text-white/60">5:30</b>, <b className="font-medium text-white/60">7:45</b> or <b className="font-medium text-white/60">off</b>, then Enter. Double-click for vacation, sick and more. Click a date to set one start time for that whole night.
      </p>

      {menu && sel && selCell && (
        <CellMenu
          employee={employees[sel.row]}
          date={dates[sel.col]}
          types={types}
          cell={selCell}
          onPick={(a) => { setMenu(false); apply(employees[sel.row], dates[sel.col], a); focusGrid(); }}
          onClose={() => { setMenu(false); focusGrid(); }}
        />
      )}
      {opening && openers && (
        <Floating rect={opening.rect} onClose={() => setOpening(null)}>
          <div className="px-1 pb-1 text-[13px] font-semibold">Opens {DAY_LONG[opening.col]} {Number(dates[opening.col].slice(8))}</div>
          {openers.candidates.map((c) => {
            const st = openerStatus(week, c, dates[opening.col]);
            const on = openers.byDate.get(dates[opening.col]) === c.id;
            return (
              <button
                key={c.id}
                onClick={() => { openers.onPick(dates[opening.col], c.id); setOpening(null); }}
                className={cn('flex h-10 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-[13.5px] hover:bg-white/[0.07]', on && 'bg-gold/10')}
              >
                <span className={cn('flex items-center gap-2 font-semibold', on && 'text-gold')}>{on && <Check className="size-3.5" />}{c.name}</span>
                <span className={cn('text-[12px]', st.bad ? 'text-bad' : st.problem ? 'text-warn' : 'text-white/45')}>{st.label}</span>
              </button>
            );
          })}
          <button onClick={() => { openers.onPick(dates[opening.col], null); setOpening(null); }} className="mt-1 flex h-9 w-full items-center rounded-lg px-2 text-[13px] text-white/55 hover:bg-white/[0.07]">Nobody</button>
        </Floating>
      )}
      {night != null && (
        <NightDialog
          date={dates[night]}
          types={types}
          working={employees.filter((e) => cellAt(week, e.id, dates[night]).type === 'work').length}
          onClose={() => setNight(null)}
          onApply={async (time) => { await onNightTime(dates[night], time); setNight(null); }}
        />
      )}
    </>
  );
}

/**
 * Can this person open that night? Someone on the sheet should be on the earliest start;
 * someone from another team (the general manager) just shouldn't be off.
 */
export function openerStatus(week: WeekData, e: Employee, date: string): { label: string; problem?: string; bad?: boolean } {
  const c = cellAt(week, e.id, date);
  if (c.type === 'away') return { label: TIME_OFF[c.timeOff.kind].label.toLowerCase(), problem: `${e.name} is off (${TIME_OFF[c.timeOff.kind].label.toLowerCase()})`, bad: true };
  const onSheet = week.employees.some((x) => x.id === e.id);
  if (!onSheet) return { label: e.job_title ?? 'Backup' };
  if (c.type === 'off') return { label: 'day off', problem: `${e.name} has a day off`, bad: true };
  if (c.type === 'empty') return { label: 'not planned', problem: `${e.name} isn’t planned this night` };
  const earliest = week.employees.map((x) => cellAt(week, x.id, date)).flatMap((x) => (x.type === 'work' && x.shift.start_time ? [x.shift.start_time] : [])).sort()[0];
  const start = c.shift.start_time ?? '';
  // (times after midnight don't open the club, so a plain string sort is fine here)
  if (earliest && start > earliest) return { label: fmtTime(start), problem: `${e.name} starts at ${fmtTime(start)}, after the early staff` };
  return { label: fmtTime(start) };
}

/** Plain text, like the Excel sheet; colour only where it helps to scan. */
function CellValue({ cell, types }: { cell: Cell; types: ShiftType[] }) {
  if (cell.type === 'empty') return null;
  if (cell.type === 'off') return <span className="text-white/35">off</span>;
  if (cell.type === 'away') {
    const k = cell.timeOff.kind;
    return <span className={cn('text-[12.5px] font-medium', k === 'sick' ? 'text-bad' : k === 'vacation' ? 'text-teal' : 'text-white/55')}>{TIME_OFF[k].label}</span>;
  }
  // Early times plain, later shifts a touch dimmer so the two read apart at a glance.
  const order = types.findIndex((t) => t.id === cell.shift.shift_type_id);
  return <span className={cn(order > 0 ? 'text-[#c4b5fd]' : 'text-white', cell.shiftType && cell.shift.start_time !== cell.shiftType.start_time && 'font-semibold text-gold')}>{fmtTime(cell.shift.start_time)}</span>;
}

function CellInput({ value: v, onChange: setV, onCommit, onCancel }: { value: string; onChange: (v: string) => void; onCommit: (text: string, then?: [number, number]) => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = (then?: [number, number]) => { if (done.current) return; done.current = true; onCommit(v, then); };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  return (
    <input
      ref={ref}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish()}
      onKeyDown={(e) => {
        e.stopPropagation();
        const next: Record<string, [number, number]> = { Enter: [1, 0], Tab: [0, e.shiftKey ? -1 : 1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
        if (next[e.key]) { e.preventDefault(); finish(next[e.key]); }
        else if (e.key === 'Escape') { e.preventDefault(); done.current = true; onCancel(); }
      }}
      className="h-full w-full bg-ink-800 px-2 text-center text-[14px] outline-none"
      aria-label="Start time or off"
    />
  );
}

function NightNote({ date, note, onSave }: { date: string; note: string; onSave: (date: string, note: string) => Promise<void> }) {
  const [v, setV] = useState(note);
  useEffect(() => setV(note), [note]);
  return (
    <div className={cn(LINE, 'px-1')}>
      <input
        value={v}
        maxLength={60}
        placeholder="+ note"
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v.trim() !== note) onSave(date, v); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="h-7 w-full bg-transparent text-center text-[13px] font-semibold text-[#ff7a59] placeholder:font-normal placeholder:text-white/0 hover:placeholder:text-white/25 focus:placeholder:text-white/25 focus:outline-none"
        aria-label={`Note for ${DAY_LONG[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7]}`}
      />
    </div>
  );
}

function NightDialog({ date, types, working, onClose, onApply }: { date: string; types: ShiftType[]; working: number; onClose: () => void; onApply: (time: string | null) => Promise<void> }) {
  const [time, setTime] = useState<string | null>('17:00');
  const [busy, setBusy] = useState(false);
  const run = async (t: string | null) => { setBusy(true); try { await onApply(t); } finally { setBusy(false); } };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${DAY_LONG[weekday(date)]} ${Number(date.slice(8))}`}
      footer={<>
        <Button variant="ghost" className="mr-auto" onClick={() => run(null)} disabled={busy}>Back to normal times</Button>
        <Button variant="primary" onClick={() => run(time)} loading={busy} disabled={!time || !working}>Set for everyone</Button>
      </>}
    >
      <div className="grid gap-3">
        <p className="text-white/80">Start everyone working this night ({working}) at the same time, for a special night like Halloween.</p>
        <TimeSelect value={time} onChange={setTime} className="w-44" aria-label="Start time for everyone" />
        <p className="text-[12.5px] text-mute">They keep their Early or Late shift for the rules; only the time changes. “Back to normal times” sets {types.map((t) => `${t.name} to ${fmtTime(t.start_time)}`).join(' and ')} again.</p>
      </div>
    </Dialog>
  );
}

function CellMenu({ employee, date, types, cell, onPick, onClose }: {
  employee: Employee; date: string; types: ShiftType[]; cell: Cell; onPick: (a: CellAction) => void; onClose: () => void;
}) {
  const [custom, setCustom] = useState(cell.type === 'work' && !cell.shiftType ? hhmm(cell.shift.start_time) : '');
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const small = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
  useLayoutEffect(() => {
    if (small) return;
    const target = document.querySelector<HTMLElement>('[role=gridcell][aria-selected=true]');
    const m = ref.current;
    if (!target || !m) return;
    const r = target.getBoundingClientRect();
    const h = m.offsetHeight, w = m.offsetWidth;
    const below = r.bottom + 4 + h <= window.innerHeight - 8;
    setPos({ top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - h), left: Math.min(window.innerWidth - w - 8, Math.max(8, r.left)) });
  }, [small]);
  useEffect(() => {
    if (small) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const t = setTimeout(() => document.addEventListener('pointerdown', away), 0);
    document.addEventListener('keydown', esc);
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [onClose, small]);

  const is = (a: CellAction) =>
    (a.kind === 'type' && cell.type === 'work' && cell.shift.shift_type_id === a.type.id) ||
    (a.kind === 'off' && cell.type === 'off') ||
    (a.kind === 'away' && cell.type === 'away' && cell.timeOff.kind === a.away);
  const item = (a: CellAction, label: ReactNode, hint?: string) => (
    <button key={String(hint) + JSON.stringify(a.kind === 'type' ? a.type.id : a)} onClick={() => onPick(a)} className={cn('flex h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[14px] hover:bg-white/[0.07] focus:bg-white/[0.07] focus:outline-none md:h-9 md:text-[13.5px]', is(a) && 'font-semibold')}>
      <span className="flex-1">{label}</span>
      {is(a) ? <Check className="size-4 text-gold" /> : hint && <span className="text-[11px] text-white/30">{hint}</span>}
    </button>
  );
  const content = (
    <div className="grid gap-0.5">
      {types.map((t) => item({ kind: 'type', type: t }, <>{t.name} <span className="text-white/45">{fmtTime(t.start_time)}</span></>, t.code))}
      <form className="flex items-center gap-2 px-2.5 py-1" onSubmit={(e) => { e.preventDefault(); if (custom) onPick({ kind: 'custom', time: custom }); }}>
        <TimeSelect aria-label="Another start time" value={custom || null} onChange={(v) => setCustom(v ?? '')} placeholder="Another time…" className="h-8 min-w-0 flex-1 px-2 text-[12.5px]" />
        <Button size="sm" type="submit" disabled={!custom} className="h-8">Set</Button>
      </form>
      <div className="my-1 border-t border-line" />
      {item({ kind: 'off' }, 'Day off', 'O')}
      {item({ kind: 'away', away: 'vacation' }, 'Vacation', 'V')}
      {item({ kind: 'away', away: 'sick' }, 'Sick', 'S')}
      {item({ kind: 'away', away: 'leave' }, 'Other leave')}
      {item({ kind: 'away', away: 'request' }, 'Asked for this day off', 'A')}
      {cell.type !== 'empty' && <>{<div className="my-1 border-t border-line" />}{item({ kind: 'clear' }, <span className="text-white/60">Clear</span>, '⌫')}</>}
    </div>
  );
  const title = `${employee.name.split(' ')[0]} · ${DAY_SHORT[weekday(date)]} ${Number(date.slice(8))}`;
  if (small) return <Dialog open onClose={onClose} title={title}>{content}</Dialog>;
  return createPortal(
    <div ref={ref} style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }} className="fixed z-[60] w-60 animate-fade-up rounded-xl border border-line bg-ink-800 p-1.5 shadow-pop">
      <div className="px-2.5 pb-1 pt-1.5 text-[13px] font-semibold">{title}</div>
      {content}
    </div>,
    document.body,
  );
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
