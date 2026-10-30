// Month schedule, for teams booked night by night rather than on a weekly pattern (DJs):
// one line per night with who plays and when, the night's note (Halloween…), and a
// count of nights per DJ for the month.
//
// "+ Add" on a night books a DJ: pick a resident, a guest who played before, or type a new
// guest's name. Times past midnight (12:00 AM, 1:00 AM) belong to the evening they start in.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Cake, ChevronLeft, ChevronRight, ImageUp, Plus, Printer, Trash2, UserPlus } from 'lucide-react';
import { Button, DJ_HOURS, IconButton, Spinner, TimeSelect, useToast } from '@/components/ui';
import { arubaToday, cn } from '@/lib/format';
import { DAY_LONG, DAY_SHORT, addDays, fmtTime, isBirthday, weekStart, weekday } from '@/lib/schedule';
import { clearShifts, listEmployees, listNightNotes, listShifts, saveEmployee, saveNightNote, setShifts, updateShift, uploadLogo } from '@/lib/staff';
import { useLoad } from '@/lib/useLoad';
import { NameOrLogo } from '@/components/staff';
import { useDrag } from '@/lib/useDrag';
import type { Department, Employee, Shift } from '@/types';


export const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
export const addMonths = (m: string, n: number) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return d.toISOString().slice(0, 10);
};
const monthDates = (start: string) => {
  const out: string[] = [];
  for (let d = start; d.slice(0, 7) === start.slice(0, 7); d = addDays(d, 1)) out.push(d);
  return out;
};
/** Every day shown on the calendar: whole weeks, Monday to Sunday, around the month. */
const calendar = (start: string) => {
  const days = monthDates(start);
  const first = weekStart(start);
  const last = addDays(weekStart(days[days.length - 1]), 6);
  const out: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
  return out;
};
const monthLabel = (start: string) => new Date(`${start}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
// Night order: evening first, then the small hours.
export const nightOrder = (t: string | null) => { const h = Number((t ?? '00').slice(0, 2)); return (h < 8 ? h + 24 : h) * 60 + Number((t ?? '00:00').slice(3, 5)); };

function useMonth(deptId: string, start: string) {
  const dates = useMemo(() => monthDates(start), [start]);
  const load = useLoad(async () => {
    const end = dates[dates.length - 1];
    const [employees, shifts, notes] = await Promise.all([listEmployees(), listShifts(start, end), listNightNotes(start, end)]);
    const team = employees.filter((e) => e.department_id === deptId);
    const ids = new Set(team.map((e) => e.id));
    return { team, shifts: shifts.filter((s) => ids.has(s.employee_id) && s.kind === 'work'), notes: new Map(notes.map((n) => [n.date, n.note])) };
  }, [deptId, start]);
  return { ...load, dates };
}

/** 10:00 PM, or 9:00 PM – 11:00 PM when the set has an end time. */
const setTimes = (s: Shift) => (s.end_time ? `${fmtTime(s.start_time)} – ${fmtTime(s.end_time)}` : fmtTime(s.start_time));
/**
 * Times are only shown (and printed) for special nights: a night with a note like Halloween,
 * or a booking that doesn't start at the usual time or has an end time.
 */
const showTimes = (s: Shift, usual: string, notes: Map<string, string>) =>
  !!notes.get(s.date) || !!s.end_time || s.start_time?.slice(0, 5) !== usual.slice(0, 5);

export function MonthSchedule({ dept }: { dept: Department }) {
  const [params, setParams] = useSearchParams();
  const today = arubaToday(true);
  const start = monthStart(params.get('month') ? `${params.get('month')}-01` : today);
  const { data, reload, set, dates } = useMonth(dept.id, start);
  const toast = useToast();
  const [adding, setAdding] = useState<{ date: string; rect: DOMRect } | null>(null);
  const [editing, setEditing] = useState<{ shift: Shift; rect: DOMRect } | null>(null);
  const [inviting, setInviting] = useState<{ date: string; rect: DOMRect } | null>(null);
  const go = (m: string) => setParams((p) => { p.set('month', m.slice(0, 7)); return p; }, { replace: true });

  // The hook has to come before the early return; the drop handler needs the loaded data.
  const dropRef = useRef<(id: string, from: string | null, date: string | null) => void>(() => {});
  const drag = useDrag((id, from, date) => dropRef.current(id, from, date));

  if (!data) return <div className="grid h-48 place-items-center"><Spinner /></div>;
  const person = (id: string) => data.team.find((e) => e.id === id);
  const byNight = (d: string) => data.shifts.filter((s) => s.date === d).sort((a, b) => nightOrder(a.start_time) - nightOrder(b.start_time));
  const residents = data.team.filter((e) => !e.guest && e.active);
  // Invited DJs nearly always play once, so they're only in the strip for a month they play.
  const guestsThisMonth = data.team.filter((e) => e.guest && data.shifts.some((s) => s.employee_id === e.id));

  const book = async (employee: Employee, date: string, time: string) => {
    const row = { employee_id: employee.id, date, kind: 'work' as const, shift_type_id: null, start_time: time };
    try {
      const [saved] = await setShifts([row]);
      set((d) => d && { ...d, shifts: [...d.shifts.filter((s) => !(s.employee_id === employee.id && s.date === date)), saved] });
    } catch (e) { toast((e as Error).message, 'bad'); }
  };
  const addGuest = async (name: string, date: string, time: string, logo?: File | null) => {
    try {
      let guest = await saveEmployee({ name: name.trim(), department_id: dept.id, job_title: 'Guest DJ', guest: true, vacation_days: 0, active: true, position: 1000 });
      if (logo) guest = await uploadLogo(guest, logo);
      await setShifts([{ employee_id: guest.id, date, kind: 'work', shift_type_id: null, start_time: time }]);
      await reload();
      toast(`${guest.name} booked as a guest`);
    } catch (e) { toast((e as Error).message, 'bad'); }
  };
  const remove = async (s: Shift) => {
    set((d) => d && { ...d, shifts: d.shifts.filter((x) => x.id !== s.id) });
    try { await clearShifts([{ employee_id: s.employee_id, date: s.date }]); } catch (e) { toast((e as Error).message, 'bad'); reload(); }
  };
  const setEnd = async (s: Shift, end: string | null) => {
    set((d) => d && { ...d, shifts: d.shifts.map((x) => (x.id === s.id ? { ...x, end_time: end } : x)) });
    try { await updateShift(s.id, { end_time: end }); } catch (e) { toast((e as Error).message, 'bad'); reload(); }
  };
  // Drag a DJ from the strip onto a night to book them, or a booking to another night to move it.
  const drop = async (employeeId: string, fromId: string | null, date: string | null) => {
    // The "Invited DJ" tile: ask who it is right on that night.
    if (employeeId === INVITE && date) {
      const cell = document.querySelector(`[data-drop="${date}"]`);
      if (cell) setInviting({ date, rect: cell.getBoundingClientRect() });
      return;
    }
    const e = person(employeeId);
    const from = fromId ? data.shifts.find((s) => s.id === fromId) : undefined;
    if (!e || !date || from?.date === date) return;
    if (byNight(date).some((s) => s.employee_id === e.id)) { toast(`${e.name} already plays that night`, 'bad'); return; }
    if (!from) { book(e, date, usual); return; }
    try {
      const [saved] = await setShifts([{ employee_id: e.id, date, kind: 'work', shift_type_id: null, start_time: from.start_time }]);
      const moved = from.end_time ? await updateShift(saved.id, { end_time: from.end_time }) : saved;
      await clearShifts([{ employee_id: e.id, date: from.date }]);
      set((x) => x && { ...x, shifts: [...x.shifts.filter((s) => s.id !== from.id && !(s.employee_id === e.id && s.date === date)), moved] });
    } catch (err) { toast((err as Error).message, 'bad'); reload(); }
  };
  dropRef.current = drop;
  const ghost = (e: Employee | undefined) => <NameOrLogo e={e} className="h-8" />;
  const usual = dept.usual_start.slice(0, 5);

  const counts = [...residents, ...guestsThisMonth].map((e) => ({ e, n: data.shifts.filter((s) => s.employee_id === e.id).length }));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-line bg-ink-900 p-1">
          <IconButton label="Previous month" className="size-9" onClick={() => go(addMonths(start, -1))}><ChevronLeft className="size-5" /></IconButton>
          <span className="min-w-[150px] text-center font-semibold">{monthLabel(start)}</span>
          <IconButton label="Next month" className="size-9" onClick={() => go(addMonths(start, 1))}><ChevronRight className="size-5" /></IconButton>
          {start !== monthStart(today) && <button onClick={() => go(monthStart(today))} className="h-9 rounded-lg px-3 text-[13px] font-medium text-white/70 hover:bg-white/[0.06]">This month</button>}
        </div>
        <Link to={`/schedule/print?dept=${dept.id}&month=${start.slice(0, 7)}`} target="_blank" className="ml-auto"><Button icon={<Printer className="size-4" />}>Print month</Button></Link>
      </div>

      {/* Calendar: Monday to Sunday across, a row per week. Phones get a list instead. */}
      <div className="hidden overflow-hidden rounded-xl border border-white/[0.09] bg-ink-900 md:block">
        <div className="grid grid-cols-7 border-b border-white/[0.09] bg-ink-850">
          {DAY_LONG.map((d, i) => <div key={d} className={cn('border-r border-white/[0.09] px-3 py-2 text-[13px] font-semibold last:border-r-0', i >= 4 && i <= 5 ? 'text-white' : 'text-white/60')}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {calendar(start).map((d) => {
            const inMonth = d.slice(0, 7) === start.slice(0, 7);
            const i = weekday(d);
            const nights = inMonth ? byNight(d) : [];
            return (
              <div
                key={d}
                data-drop={inMonth ? d : undefined}
                className={cn(
                  'group flex min-h-[124px] flex-col gap-1 border-b border-r border-white/[0.09] p-1.5 [&:nth-child(7n)]:border-r-0',
                  !inMonth && 'bg-black/20',
                  inMonth && i >= 4 && i <= 5 && 'bg-white/[0.025]',
                  d === today && 'bg-gold/[0.07] outline outline-1 -outline-offset-1 outline-gold/40',
                  drag.dragging && drag.over === d && 'bg-gold/[0.12] outline outline-2 -outline-offset-2 outline-gold',
                )}
              >
                <div className="flex items-center gap-1.5 px-1">
                  <span className={cn('text-[14px] font-semibold tabular-nums', !inMonth && 'text-white/20', d === today && 'text-gold')}>{Number(d.slice(8))}</span>
                  {inMonth && <NoteCell date={d} note={data.notes.get(d) ?? ''} onSave={async (n) => { await saveNightNote(d, n); reload(); }} />}
                </div>
                {inMonth && (
                  <>
                    {nights.map((s) => {
                      const e = person(s.employee_id);
                      return (
                        <button
                          key={s.id}
                          onPointerDown={(ev) => drag.start(ev, s.employee_id, ghost(e), s.id)}
                          onClick={(ev) => !drag.justDropped() && setEditing({ shift: s, rect: ev.currentTarget.getBoundingClientRect() })}
                          aria-label={`${e?.name ?? 'Unknown'} ${setTimes(s)}`}
                          className={cn('flex min-h-10 cursor-grab flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md bg-white/[0.06] px-2 py-1 text-left text-[13px] hover:bg-white/[0.1] active:cursor-grabbing', drag.dragging?.from === s.id && 'opacity-40')}
                        >
                          <span className="flex min-w-[64px] flex-1 items-center font-semibold"><NameOrLogo e={e} className="h-8" />{isBirthday(e?.birthday ?? null, s.date) && <Cake className="ml-1 size-3.5 shrink-0 text-gold" aria-label="Birthday" />}{e?.guest && <span className="ml-1 shrink-0 text-[10.5px] font-normal text-gold/80">guest</span>}</span>
                          {showTimes(s, usual, data.notes) && <span className="ml-auto shrink-0 text-[11.5px] tabular-nums text-gold/90">{setTimes(s)}</span>}
                        </button>
                      );
                    })}
                    <button
                      onClick={(ev) => setAdding({ date: d, rect: ev.currentTarget.getBoundingClientRect() })}
                      className="mt-auto flex h-7 items-center gap-1 rounded-md px-1.5 text-[12px] text-white/0 hover:bg-white/[0.06] hover:text-white group-hover:text-white/40 focus:text-white/60"
                    >
                      <Plus className="size-3.5" /> Add
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Phones: a line per night */}
      <div className="overflow-hidden rounded-xl border border-white/[0.09] bg-ink-900 md:hidden">
        {dates.map((d) => {
          const i = weekday(d);
          const nights = byNight(d);
          return (
            <div key={d} className={cn('flex items-start gap-2 border-b border-white/[0.09] px-3 py-2 last:border-b-0', i >= 4 && i <= 5 && 'bg-white/[0.025]', d === today && 'bg-gold/[0.06]')}>
              <div className={cn('w-14 shrink-0 pt-1', d === today && 'text-gold')}>
                <span className="text-[12px] text-white/50">{DAY_SHORT[i]}</span> <span className="font-semibold tabular-nums">{Number(d.slice(8))}</span>
                {data.notes.get(d) && <div className="text-[11px] font-semibold text-[#ff7a59]">{data.notes.get(d)}</div>}
              </div>
              <div className="flex flex-1 flex-wrap gap-1.5">
                {nights.map((s) => (
                  <button key={s.id} onClick={(ev) => setEditing({ shift: s, rect: ev.currentTarget.getBoundingClientRect() })} className="flex h-8 items-center gap-2 rounded-md bg-white/[0.06] px-2.5 text-[13.5px]">
                    <span className="flex font-semibold"><NameOrLogo e={person(s.employee_id)} className="h-5" /></span>
                    {showTimes(s, usual, data.notes) && <span className="text-gold/90">{setTimes(s)}</span>}
                  </button>
                ))}
                <button onClick={(ev) => setAdding({ date: d, rect: ev.currentTarget.getBoundingClientRect() })} className="flex h-8 items-center gap-1 px-1.5 text-[13px] text-white/35"><Plus className="size-3.5" /> Add</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* The DJs with their nights this month; drag one onto a night to book them. Sticks to
          the bottom of the screen so it's in reach while scrolling the calendar. */}
      <div className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-white/[0.12] bg-ink-900/95 px-4 py-3 text-[13.5px] shadow-[0_12px_40px_-8px_rgba(0,0,0,0.8)] backdrop-blur">
        <span className="mr-2 grid leading-tight">
          <span className="font-semibold">Nights in {monthLabel(start).split(' ')[0]}</span>
          <span className="hidden text-[12px] text-white/45 md:inline">Drag a DJ onto a night</span>
        </span>
        {counts.map(({ e, n }) => (
          <span
            key={e.id}
            onPointerDown={(ev) => drag.start(ev, e.id, ghost(e), null)}
            title={`Drag ${e.name} onto a night`}
            className={cn('flex h-14 cursor-grab select-none items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 hover:border-white/20 hover:bg-white/[0.07] active:cursor-grabbing', drag.dragging?.id === e.id && !drag.dragging.from && 'opacity-40')}
          >
            <span className="flex items-center text-white/80"><NameOrLogo e={e} className="h-10 max-w-[140px]" />{e.guest && <span className="ml-1 text-[11px] text-gold/80">guest</span>}</span>
            <span className="text-[17px] font-semibold tabular-nums">{n}</span>
          </span>
        ))}
        {/* Drag onto a night, then say who it is */}
        <span
          onPointerDown={(ev) => drag.start(ev, INVITE, <span className="flex items-center gap-2 text-gold"><UserPlus className="size-4" /> Invited DJ</span>, null)}
          onClick={() => { if (!drag.justDropped()) toast('Drag this onto the night the invited DJ plays'); }}
          title="Drag onto a night to book an invited DJ"
          className={cn('flex h-14 cursor-grab select-none items-center gap-2 rounded-lg border border-dashed border-gold/40 px-4 text-[13.5px] font-medium text-gold/80 hover:border-gold hover:text-gold active:cursor-grabbing', drag.dragging?.id === INVITE && 'opacity-40')}
        >
          <UserPlus className="size-4" /> Invited DJ
        </span>
      </div>
      {inviting && (
        <InviteMenu
          rect={inviting.rect}
          date={inviting.date}
          previous={data.team.filter((e) => e.guest && !byNight(inviting.date).some((s) => s.employee_id === e.id))}
          onInvite={(name, logo) => { const d = inviting.date; setInviting(null); addGuest(name, d, usual, logo); }}
          onPick={(e) => { const d = inviting.date; setInviting(null); book(e, d, usual); }}
          onClose={() => setInviting(null)}
        />
      )}

      {drag.ghost}
      {adding && (
        <AddMenu
          rect={adding.rect}
          date={adding.date}
          residents={residents}
          guests={data.team.filter((e) => e.guest)}
          booked={new Set(byNight(adding.date).map((s) => s.employee_id))}
          usual={usual}
          onBook={(e, t) => { const d = adding.date; setAdding(null); book(e, d, t); }}
          onGuest={(name, t) => { const d = adding.date; setAdding(null); addGuest(name, d, t); }}
          onClose={() => setAdding(null)}
        />
      )}
      {editing && (
        <Floating rect={editing.rect} onClose={() => setEditing(null)}>
          <div className="px-1 pb-2 text-[13px] font-semibold">{person(editing.shift.employee_id)?.name} · {DAY_LONG[weekday(editing.shift.date)]} {Number(editing.shift.date.slice(8))}</div>
          <div className="grid grid-cols-2 gap-2 px-1">
            <label className="grid gap-1 text-[12px] text-white/55">
              Starts
              <TimeSelect steps={DJ_HOURS} value={editing.shift.start_time} onChange={(t) => { if (!t) return; const e = person(editing.shift.employee_id); if (e) book(e, editing.shift.date, t); setEditing(null); }} className="h-9 w-full" />
            </label>
            <label className="grid gap-1 text-[12px] text-white/55">
              Ends
              <TimeSelect steps={DJ_HOURS} value={editing.shift.end_time} placeholder="Not set" onChange={(t) => { setEnd(editing.shift, t); setEditing(null); }} className="h-9 w-full" />
            </label>
          </div>
          <p className="mt-2 px-1 text-[11.5px] leading-snug text-white/40">Usually everyone starts at {fmtTime(usual)} and no times are printed. Change a time for a special night and it shows on the printout.</p>
          <button onClick={() => { remove(editing.shift); setEditing(null); }} className="mt-2 flex h-9 w-full items-center gap-2 rounded-lg px-2 text-[13.5px] text-bad hover:bg-bad/10">
            <Trash2 className="size-4" /> Remove from this night
          </button>
        </Floating>
      )}
    </>
  );
}

export function NoteCell({ date, note, onSave }: { date: string; note: string; onSave: (note: string) => Promise<void> }) {
  const [v, setV] = useState(note);
  useEffect(() => setV(note), [note]);
  return (
    <input
      value={v}
      maxLength={60}
      placeholder="+ note"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v.trim() !== note) onSave(v); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      aria-label={`Note for ${date}`}
      className="h-6 min-w-0 flex-1 truncate rounded bg-transparent px-1 text-right text-[12.5px] font-semibold text-[#ff7a59] placeholder:font-normal placeholder:text-white/0 hover:placeholder:text-white/25 focus:bg-white/[0.05] focus:text-left focus:placeholder:text-white/25 focus:outline-none"
    />
  );
}

function AddMenu({ rect, date, residents, guests, booked, usual, onBook, onGuest, onClose }: {
  rect: DOMRect; date: string; residents: Employee[]; guests: Employee[]; booked: Set<string>; usual: string;
  onBook: (e: Employee, time: string) => void; onGuest: (name: string, time: string) => void; onClose: () => void;
}) {
  const [time, setTime] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const pick = (e: Employee) => onBook(e, time ?? usual);
  const row = (e: Employee) => (
    <button key={e.id} disabled={booked.has(e.id)} onClick={() => pick(e)} className="flex h-9 w-full items-center justify-between rounded-lg px-2 text-left text-[13.5px] hover:bg-white/[0.07] disabled:opacity-35">
      <span className="flex min-w-0 items-center gap-2"><span className="flex w-16 shrink-0">{e.logo_path && <NameOrLogo e={e} className="h-5" />}</span><span className="truncate">{e.name}</span></span>
      <span className="shrink-0 text-[11.5px] text-white/40">{booked.has(e.id) ? 'booked' : fmtTime(time ?? usual)}</span>
    </button>
  );
  const submitGuest = (ev: FormEvent) => { ev.preventDefault(); if (guestName.trim()) onGuest(guestName, time ?? usual); };
  return (
    <Floating rect={rect} onClose={onClose}>
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <span className="text-[13px] font-semibold">{DAY_LONG[weekday(date)]} {Number(date.slice(8))}</span>
        <TimeSelect steps={DJ_HOURS} value={time} onChange={setTime} placeholder={`${fmtTime(usual)} (usual)`} className="h-8 w-[150px] px-2 text-[12.5px]" aria-label="Start time" />
      </div>
      <Group>Residents</Group>
      {residents.map(row)}
      {guests.length > 0 && <><Group>Guests</Group>{guests.map(row)}</>}
      <Group>New guest DJ</Group>
      <form onSubmit={submitGuest} className="flex gap-1.5 px-1 pb-1">
        <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Name" className="field h-9 min-w-0 flex-1 px-2.5 text-[13.5px]" aria-label="Guest DJ name" />
        <Button size="sm" type="submit" disabled={!guestName.trim()} icon={<UserPlus className="size-3.5" />} className="h-9">Book</Button>
      </form>
    </Floating>
  );
}

/** After the "Invited DJ" tile is dropped on a night: who is it? Someone new (with their logo if there is one) or a guest who played before. */
function InviteMenu({ rect, date, previous, onInvite, onPick, onClose }: {
  rect: DOMRect; date: string; previous: Employee[]; onInvite: (name: string, logo: File | null) => void; onPick: (e: Employee) => void; onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [logo, setLogo] = useState<File | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const submit = (ev: FormEvent) => { ev.preventDefault(); if (name.trim()) onInvite(name, logo); };
  return (
    <Floating rect={rect} onClose={onClose}>
      <div className="px-1 pb-1 text-[13px] font-semibold">Invited DJ · {DAY_LONG[weekday(date)]} {Number(date.slice(8))}</div>
      <Group>New</Group>
      <form onSubmit={submit} className="grid gap-1.5 px-1 pb-1">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="field h-9 px-2.5 text-[13.5px]" aria-label="Invited DJ name" />
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => file.current?.click()} className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line px-2.5 text-left text-[12.5px] text-white/60 hover:bg-white/[0.05]">
            <ImageUp className="size-3.5 shrink-0" /><span className="truncate">{logo ? logo.name : 'Logo (optional)'}</span>
          </button>
          <Button size="sm" type="submit" disabled={!name.trim()} className="h-9">Book</Button>
        </div>
        <input ref={file} type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" className="sr-only" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
      </form>
      {previous.length > 0 && (
        <>
          <Group>Played here before</Group>
          <div className="max-h-56 overflow-y-auto">
            {previous.map((e) => (
              <button key={e.id} onClick={() => onPick(e)} className="flex h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-[13.5px] hover:bg-white/[0.07]">
                <span className="flex w-16 shrink-0">{e.logo_path && <NameOrLogo e={e} className="h-6" />}</span>
                <span className="truncate">{e.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </Floating>
  );
}

const INVITE = 'invite';

export const Group = ({ children }: { children: ReactNode }) => <div className="px-2 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-white/35">{children}</div>;

export function Floating({ rect, onClose, children }: { rect: DOMRect; onClose: () => void; children: ReactNode }) {
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
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [onClose]);
  return createPortal(
    <div ref={ref} style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }} className="fixed z-[70] w-72 animate-fade-up rounded-xl border border-line bg-ink-800 p-2 shadow-pop">
      {children}
    </div>,
    document.body,
  );
}

/** Printable month: one line per night (nights nobody plays are left out). */
export function MonthPrint({ dept, month }: { dept: Department; month: string }) {
  const start = `${month}-01`;
  const { data } = useMonth(dept.id, start);
  useEffect(() => { document.title = `Gusto ${dept.plural} · ${monthLabel(start)}`; return () => { document.title = 'Gusto Command'; }; }, [dept.plural, start]);
  if (!data) return <div className="grid min-h-dvh place-items-center"><Spinner /></div>;
  const dj = (id: string) => data.team.find((e) => e.id === id);
  return (
    <div className="min-h-dvh bg-[#e9e7ee] text-black print:bg-white">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-black/10 bg-white/90 px-4 py-3 backdrop-blur print:hidden">
        <Link to={`/schedule?dept=${dept.id}&month=${month}`} className="mr-auto flex items-center gap-2 text-[13px] font-medium text-black/60 hover:text-black"><ArrowLeft className="size-4" /> Back to schedule</Link>
        <Button variant="primary" icon={<Printer className="size-4" />} onClick={() => window.print()}>Print</Button>
      </div>
      <section className="mx-auto my-4 max-w-[1100px] rounded-md bg-white p-8 shadow-sm print:m-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-end justify-between border-b-2 border-black pb-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-black/50">Gusto Aruba</div>
            <h1 className="mt-1 font-display text-[30px] font-bold leading-none">{dept.plural}</h1>
          </div>
          <div className="font-display text-[20px] font-bold">{monthLabel(start)}</div>
        </header>
        <table className="mt-4 w-full table-fixed border-collapse text-[12px]">
          <thead>
            <tr>{DAY_LONG.map((d) => <th key={d} className="border border-black px-2 py-1 text-left text-[12px] font-bold">{d}</th>)}</tr>
          </thead>
          <tbody>
            {Array.from({ length: calendar(start).length / 7 }, (_, w) => calendar(start).slice(w * 7, w * 7 + 7)).map((week) => (
              <tr key={week[0]}>
                {week.map((d) => {
                  const inMonth = d.slice(0, 7) === month;
                  return (
                    <td key={d} className={`h-[78px] border border-black/60 p-1.5 align-top ${inMonth ? '' : 'bg-black/[0.04]'}`}>
                      {inMonth && (
                        <>
                          <div className="flex items-baseline justify-between gap-1">
                            <b className="text-[13px]">{Number(d.slice(8))}</b>
                            {data.notes.get(d) && <span className="truncate text-[11px] font-bold text-[#c2410c]">{data.notes.get(d)}</span>}
                          </div>
                          {data.shifts.filter((s) => s.date === d).sort((a, b) => nightOrder(a.start_time) - nightOrder(b.start_time)).map((s) => (
                            <div key={s.id} className="mt-0.5 leading-tight">
                              <div className="truncate font-semibold">{dj(s.employee_id)?.name}</div>
                              {/* Times only for special nights */}
                              {showTimes(s, dept.usual_start, data.notes) && <div className="text-[11px] text-black/70">{setTimes(s)}</div>}
                            </div>
                          ))}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <style>{'@page { size: A4 landscape; margin: 10mm; } @media print { html, body { background: #fff !important; } }'}</style>
    </div>
  );
}

