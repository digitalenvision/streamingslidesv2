// The planning board, laid out like a spreadsheet: nights across the top, a block of rows
// per shift (Early, Late…), then Day off and Away, with a totals line under each shift.
// The team sits in a plain table on the right (Name · Early · Late · Off for the week).
//
// Drag a name from the team table into a night's Early or Late cell, drag names between
// cells, or drag one back to the team table to take it off that night. Clicking a name
// opens a short menu with the same choices.
//
// On phones the sheet shows one night at a time (pick it from the strip) with the team
// underneath: tap a name to place it on that night.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, Flag } from 'lucide-react';
import { useToast } from '@/components/ui';
import { cn } from '@/lib/format';
import { useDrag } from '@/lib/useDrag';
import { DAY_LONG, DAY_SHORT, TIME_OFF, askedOff, cellAt, checkWeek, fmtTime, weekday, type Assignment, type WeekData } from '@/lib/schedule';
import type { Department, Employee, ShiftType, TimeOffKind } from '@/types';

export type BoardAction =
  | { kind: 'type'; type: ShiftType }
  | { kind: 'off' }
  | { kind: 'away'; away: TimeOffKind }
  | { kind: 'clear' };

type Slot = 'off' | string; // shift type id, or a day off

interface Props {
  dept: Department;
  week: WeekData;
  check: ReturnType<typeof checkWeek>;
  today: string;
  small: boolean;
  day: number; // the night shown on phones
  setDay: (i: number) => void;
  apply: (e: Employee, date: string, action: BoardAction) => Promise<void>;
  applyMany: (rows: Assignment[]) => Promise<void>;
}

const shortName = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
};

// Spreadsheet lines.
const LINE = 'border-b border-r border-white/[0.08]';

export function WeekBoard({ week, check, today, small, day, setDay, apply }: Props) {
  const toast = useToast();
  const types = week.shiftTypes;
  const [hovered, setHovered] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ employee: Employee; date: string; rect: DOMRect } | null>(null);
  const person = (id: string) => week.employees.find((e) => e.id === id);

  const drop = async (employeeId: string, from: string | null, target: { date: string; slot: Slot } | 'roster' | null) => {
    const e = person(employeeId);
    if (!e || !target) return;
    if (target === 'roster') {
      if (from) await apply(e, from, { kind: 'clear' });
      return;
    }
    const there = cellAt(week, e.id, target.date);
    if (there.type === 'away') {
      toast(`${e.name} is on ${TIME_OFF[there.timeOff.kind].label.toLowerCase()} that night`, 'bad');
      return;
    }
    const type = types.find((t) => t.id === target.slot);
    const action: BoardAction | null = target.slot === 'off' ? { kind: 'off' } : type ? { kind: 'type', type } : null;
    if (!action) return;
    if (from && from !== target.date) await apply(e, from, { kind: 'clear' });
    await apply(e, target.date, action);
  };
  const drag = useDrag((id, from, t) => drop(id, from, t === 'roster' ? 'roster' : t ? { date: t.split('|')[0], slot: t.split('|')[1] } : null));

  const cols = small ? [day] : [0, 1, 2, 3, 4, 5, 6];
  const anyAway = week.employees.some((e) => week.dates.some((d) => cellAt(week, e.id, d).type === 'away'));
  const anyOther = week.employees.some((e) => week.dates.some((d) => { const c = cellAt(week, e.id, d); return c.type === 'work' && !types.some((t) => t.id === c.shift.shift_type_id); }));

  const peopleIn = (date: string, slot: Slot | 'away' | 'other') => week.employees.filter((e) => {
    const c = cellAt(week, e.id, date);
    if (slot === 'away') return c.type === 'away';
    if (slot === 'off') return c.type === 'off';
    if (slot === 'other') return c.type === 'work' && !types.some((t) => t.id === c.shift.shift_type_id);
    return c.type === 'work' && c.shift.shift_type_id === slot;
  });

  const name = (e: Employee, date: string, muted = false, note?: string) => {
    const asked = !!askedOff(week.timeOff, e.id, date);
    return (
      <div
        key={e.id}
        role="button"
        tabIndex={0}
        title={`${e.name}${asked ? ' (asked for this day off)' : ''}`}
        onPointerDown={(ev) => drag.start(ev, e.id, e.name, date)}
        onClick={(ev) => { if (!drag.justDropped()) setMenu({ employee: e, date, rect: ev.currentTarget.getBoundingClientRect() }); }}
        onKeyDown={(ev) => { if (ev.key === 'Enter') setMenu({ employee: e, date, rect: ev.currentTarget.getBoundingClientRect() }); }}
        onMouseEnter={() => setHovered(e.id)}
        onMouseLeave={() => setHovered(null)}
        className={cn(
          'flex h-7 cursor-grab select-none items-center gap-1 truncate rounded px-1.5 text-[13px] hover:bg-white/[0.07] active:cursor-grabbing',
          muted ? 'text-white/45' : 'text-white/90',
          hovered === e.id && 'bg-gold/15 text-white',
          drag.dragging?.id === e.id && drag.dragging.from === date && 'opacity-30',
        )}
      >
        <span className="truncate">{small ? e.name : shortName(e.name)}</span>
        {note && <span className="ml-auto shrink-0 text-[11px] text-white/40">{note}</span>}
        {asked && !note && <Flag className="ml-auto size-3 shrink-0 text-warn" aria-label="Asked off" />}
      </div>
    );
  };

  const nameCell = (date: string, slot: Slot, content: ReactNode, minRows = 1) => (
    <DropCell key={date} target={{ date, slot }} drag={drag} className={cn(LINE, 'p-1', date === today && 'bg-gold/[0.04]')} style={{ minHeight: 8 + minRows * 28 }}>
      {content}
    </DropCell>
  );

  const label = (title: ReactNode, sub?: ReactNode, muted = false) => (
    <div className={cn(LINE, 'sticky left-0 z-10 bg-ink-900 px-3 py-2')}>
      <div className={cn('text-[13px] font-semibold', muted && 'text-white/55')}>{title}</div>
      {sub && <div className="text-[11.5px] text-white/45">{sub}</div>}
    </div>
  );

  const sheet = (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-ink-900">
      <div className="grid border-l-0" style={{ gridTemplateColumns: `112px repeat(${cols.length}, minmax(0, 1fr))` }}>
        {/* header */}
        <div className={cn(LINE, 'sticky left-0 z-10 bg-ink-850')} />
        {cols.map((i) => {
          const d = week.dates[i];
          return (
            <div key={d} className={cn(LINE, 'bg-ink-850 px-2 py-2 text-center', d === today && 'text-gold')}>
              <span className="text-[13px] font-semibold">{small ? DAY_LONG[i] : DAY_SHORT[i]} {Number(d.slice(8))}</span>
              {d === today && <span className="ml-1 text-[11px] font-normal">tonight</span>}
            </div>
          );
        })}

        {/* a block per shift: names, then the total for the night */}
        {types.map((t) => {
          const most = Math.max(1, ...week.dates.map((d) => peopleIn(d, t.id).length), ...(t.daily_minimum ?? [0]));
          return (
            <div key={t.id} className="contents">
              {label(t.name, fmtTime(t.start_time))}
              {cols.map((i) => {
                const d = week.dates[i];
                return nameCell(d, t.id, peopleIn(d, t.id).map((e) => name(e, d)), most);
              })}
              <div className={cn(LINE, 'sticky left-0 z-10 bg-ink-850 px-3 py-1 text-[11.5px] text-white/45')}>{t.daily_minimum ? 'On shift / needed' : 'On shift'}</div>
              {cols.map((i) => {
                const d = week.dates[i];
                const have = peopleIn(d, t.id).filter((e) => e.counted).length;
                const need = t.daily_minimum?.[weekday(d)];
                const planned = check.days[i].empty === 0;
                const short = need != null && have < need;
                return (
                  <div key={d} className={cn(LINE, 'bg-ink-850 px-2 py-1 text-center text-[12px] tabular-nums', short ? (planned ? 'font-semibold text-bad' : 'text-white/45') : need != null ? 'text-white/75' : 'text-white/45')}>
                    {have}{need != null && ` / ${need}`}
                  </div>
                );
              })}
            </div>
          );
        })}

        {anyOther && (
          <>
            {label('Other times', undefined, true)}
            {cols.map((i) => {
              const d = week.dates[i];
              return (
                <div key={d} className={cn(LINE, 'p-1')}>
                  {peopleIn(d, 'other').map((e) => { const c = cellAt(week, e.id, d); return name(e, d, false, c.type === 'work' ? fmtTime(c.shift.start_time) : undefined); })}
                </div>
              );
            })}
          </>
        )}

        {label('Day off', undefined, true)}
        {cols.map((i) => { const d = week.dates[i]; return nameCell(d, 'off', peopleIn(d, 'off').map((e) => name(e, d, true)), 2); })}

        {anyAway && (
          <>
            {label('Away', 'Vacation, sick', true)}
            {cols.map((i) => {
              const d = week.dates[i];
              return (
                <div key={d} className={cn(LINE, 'p-1')}>
                  {peopleIn(d, 'away').map((e) => { const c = cellAt(week, e.id, d); return name(e, d, true, c.type === 'away' ? TIME_OFF[c.timeOff.kind].label : undefined); })}
                </div>
              );
            })}
          </>
        )}

        {label('Not placed', undefined, true)}
        {cols.map((i) => {
          const d = week.dates[i];
          const n = week.employees.filter((e) => cellAt(week, e.id, d).type === 'empty').length;
          return <div key={d} className={cn(LINE, 'px-2 py-2 text-center text-[12px] tabular-nums', n ? 'text-white/55' : 'text-ok')}>{n || <Check className="mx-auto size-3.5" aria-label="Everyone placed" />}</div>;
        })}
      </div>
    </div>
  );

  // The team, under the board: a compact strip of names with this week's counts
  // (Early · Late · Off against the rules), several per row so it stays on screen.
  const roster = (
    <DropCell target="roster" drag={drag} className="rounded-xl border border-white/[0.08] bg-ink-900 p-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1 pb-2">
        <span className="text-[13px] font-semibold">Team</span>
        <span className="text-[11.5px] text-white/40">
          Counts: {types.map((t) => t.name).join(' · ')} · Off this week. {small ? 'Tap a name to place it on the night above.' : 'Drag a name onto a night, or back here to take it off.'}
        </span>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
        {week.employees.map((e) => {
          const p = check.people.get(e.id)!;
          const done = p.empty === 0 && p.problems.length === 0;
          const placedHere = small && cellAt(week, e.id, week.dates[day]).type !== 'empty';
          const num = (key: string, have: number, want: number | null | undefined) => (
            <span key={key} className={cn('tabular-nums', want != null && have > want ? 'font-semibold text-bad' : want != null && have === want ? 'text-white/35' : 'text-white/80')}>
              {have}{want != null && <span className="text-white/30">/{want}</span>}
            </span>
          );
          return (
            <div
              key={e.id}
              role="button"
              tabIndex={0}
              title={small ? `Place ${e.name} on ${DAY_LONG[day]}` : 'Drag onto a night'}
              onPointerDown={(ev) => drag.start(ev, e.id, e.name, null)}
              onClick={(ev) => { if (small && !drag.justDropped()) setMenu({ employee: e, date: week.dates[day], rect: ev.currentTarget.getBoundingClientRect() }); }}
              onMouseEnter={() => setHovered(e.id)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                'flex h-9 cursor-grab select-none items-center gap-2 rounded-lg border px-2.5 text-[13px] active:cursor-grabbing',
                hovered === e.id ? 'border-gold/50 bg-gold/15' : 'border-white/[0.08] hover:bg-white/[0.04]',
                placedHere && 'opacity-40',
              )}
            >
              <span className="min-w-0 flex-1 truncate font-medium">{e.name}</span>
              {done && <Check className="size-3.5 shrink-0 text-ok" aria-label="Week complete" />}
              <span className="flex shrink-0 gap-2 text-[12px]">
                {types.map((t) => num(t.id, p.byType.get(t.id) ?? 0, p.targets.targets.get(t.id)))}
                {num('off', p.off, p.targets.off)}
              </span>
            </div>
          );
        })}
      </div>
    </DropCell>
  );

  return (
    <>
      {small && (
        <div className="mb-3 grid grid-cols-7 overflow-hidden rounded-xl border border-white/[0.08]">
          {week.dates.map((d, i) => (
            <button key={d} onClick={() => setDay(i)} className={cn('border-r border-white/[0.08] py-2 text-center last:border-r-0', i === day ? 'bg-white text-ink-950' : 'bg-ink-900 text-white/70')}>
              <div className="text-[11px]">{DAY_SHORT[i]}</div>
              <div className="text-[15px] font-semibold">{Number(d.slice(8))}</div>
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-4">
        <div className={cn(!small && 'scroll-thin overflow-x-auto')}><div className={cn(!small && 'min-w-[760px]')}>{sheet}</div></div>
        {roster}
      </div>
      {drag.ghost}
      {menu && (
        <PlaceMenu
          employee={menu.employee}
          date={menu.date}
          rect={menu.rect}
          types={types}
          current={cellAt(week, menu.employee.id, menu.date)}
          onPick={(a) => { const m = menu; setMenu(null); apply(m.employee, m.date, a); }}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}

function DropCell({ target, drag, className, style, children }: {
  target: { date: string; slot: Slot } | 'roster'; drag: ReturnType<typeof useDrag>; className?: string; style?: React.CSSProperties; children: ReactNode;
}) {
  const key = target === 'roster' ? 'roster' : `${target.date}|${target.slot}`;
  const over = drag.dragging && drag.over === key;
  return <div data-drop={key} style={style} className={cn(className, over && '!bg-gold/[0.12] outline outline-1 -outline-offset-1 outline-gold/70')}>{children}</div>;
}

function PlaceMenu({ employee, date, rect, types, current, onPick, onClose }: {
  employee: Employee; date: string; rect: DOMRect; types: ShiftType[]; current: ReturnType<typeof cellAt>; onPick: (a: BoardAction) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const h = m.offsetHeight, w = m.offsetWidth;
    const below = rect.bottom + 6 + h <= window.innerHeight - 8;
    setPos({ top: below ? rect.bottom + 6 : Math.max(8, rect.top - 6 - h), left: Math.min(window.innerWidth - w - 8, Math.max(8, rect.left)) });
  }, [rect]);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const t = setTimeout(() => document.addEventListener('pointerdown', away), 0);
    document.addEventListener('keydown', esc);
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [onClose]);

  const is = (a: BoardAction) =>
    (a.kind === 'type' && current.type === 'work' && current.shift.shift_type_id === a.type.id) ||
    (a.kind === 'off' && current.type === 'off') ||
    (a.kind === 'away' && current.type === 'away' && current.timeOff.kind === a.away);
  const options: { a: BoardAction; label: ReactNode }[] = [
    ...types.map((t) => ({ a: { kind: 'type', type: t } as BoardAction, label: <>{t.name} <span className="text-white/45">{fmtTime(t.start_time)}</span></> })),
    { a: { kind: 'off' }, label: 'Day off' },
    { a: { kind: 'away', away: 'vacation' }, label: 'Vacation' },
    { a: { kind: 'away', away: 'sick' }, label: 'Sick' },
    { a: { kind: 'away', away: 'request' }, label: 'Asked for this day off' },
    ...(current.type !== 'empty' ? [{ a: { kind: 'clear' } as BoardAction, label: <span className="text-white/60">Take off this night</span> }] : []),
  ];
  return createPortal(
    <div ref={ref} style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }} className="fixed z-[70] w-60 animate-fade-up rounded-xl border border-line bg-ink-800 p-1.5 shadow-pop">
      <div className="px-2.5 pb-1 pt-1.5 text-[13px] font-semibold">{employee.name.split(' ')[0]} · {DAY_LONG[weekday(date)]} {Number(date.slice(8))}</div>
      {options.map((o, i) => (
        <button key={i} onClick={() => onPick(o.a)} className={cn('flex h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[14px] hover:bg-white/[0.07] focus:bg-white/[0.07] focus:outline-none md:h-9 md:text-[13.5px]', is(o.a) && 'font-semibold')}>
          <span className="flex-1">{o.label}</span>
          {is(o.a) && <Check className="size-4 text-gold" />}
        </button>
      ))}
    </div>,
    document.body,
  );
}
