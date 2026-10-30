// Security's week, laid out like their Excel: each night is a column of time blocks
// ("8:30 PM – 1:30 AM", "9:30 PM – Closing") with the people in them, and underneath the
// posts: who stands at the stair entrance, and when.
//
// Drag people from the team strip under the week onto a night (usual times), onto a block
// (that block's times) or onto a post. Drag a name to another block or night to move it.
// Click a block's time to change it for everyone in it, a name to change just theirs or
// tag them (VIP), a post to change or delete it.
import { useState, type FormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Cake, Plus, Trash2, X } from 'lucide-react';
import { Button, TimeSelect, useToast } from '@/components/ui';
import { cn } from '@/lib/format';
import { DAY_LONG, DAY_SHORT, cellAt, fmtTime, isBirthday, weekday } from '@/lib/schedule';
import { clearShifts, deletePosts, savePost, setBlockShifts } from '@/lib/staff';
import { useDrag } from '@/lib/useDrag';
import type { useWeek } from '@/lib/useWeek';
import type { Department, Employee, Post, Shift } from '@/types';
import { Floating, Group, NoteCell, nightOrder } from './MonthSchedule';

type WeekLoad = NonNullable<ReturnType<typeof useWeek>['data']>;
type SetWeek = ReturnType<typeof useWeek>['set'];

/** 8:30 PM – 1:30 AM, or 9:30 PM – Closing. */
export const rangeLabel = (start: string, end: string | null) => `${fmtTime(start)} – ${end ? fmtTime(end) : 'Closing'}`;
const hm = (t: string | null) => (t ? t.slice(0, 5) : null);
// Closing is the latest end there is.
const endOrder = (t: string | null) => (t ? nightOrder(t) : 99 * 60);

export interface Block { key: string; start: string; end: string | null; shifts: Shift[] }

/** A night's shifts grouped by their times, earliest first. */
export function blocksOf(shifts: Shift[]): Block[] {
  const map = new Map<string, Block>();
  for (const s of shifts) {
    const start = hm(s.start_time)!, end = hm(s.end_time);
    const key = `${start}|${end ?? ''}`;
    if (!map.has(key)) map.set(key, { key, start, end, shifts: [] });
    map.get(key)!.shifts.push(s);
  }
  return [...map.values()].sort((a, b) => nightOrder(a.start) - nightOrder(b.start) || endOrder(a.end) - endOrder(b.end));
}

export const postsOf = (posts: Post[], deptId: string, date: string) =>
  posts.filter((p) => p.department_id === deptId && p.date === date).sort((a, b) => nightOrder(a.start_time) - nightOrder(b.start_time) || a.location.localeCompare(b.location));

type Menu =
  | { kind: 'block'; date: string; block: Block; rect: DOMRect }
  | { kind: 'person'; shift: Shift; rect: DOMRect }
  | { kind: 'post'; date: string; post: Post | null; rect: DOMRect }
  | { kind: 'add'; date: string; post: Post | null; rect: DOMRect };

export function BlockWeek({ dept, data, set, team, dates, today, onNightNote }: {
  dept: Department; data: WeekLoad; set: SetWeek; team: Employee[]; dates: string[]; today: string;
  onNightNote: (date: string, note: string) => Promise<void>;
}) {
  const toast = useToast();
  const [menu, setMenu] = useState<Menu | null>(null);
  const usual = { start: hm(dept.usual_start)!, end: hm(dept.usual_end) };
  const person = (id: string) => team.find((e) => e.id === id);
  const ids = new Set(team.map((e) => e.id));
  const nightShifts = (date: string) => [...data.shifts.values()].filter((s) => s.date === date && s.kind === 'work' && ids.has(s.employee_id));
  const away = (id: string, date: string) => {
    const c = cellAt({ shifts: data.shifts, timeOff: data.timeOff, shiftTypes: [] }, id, date);
    return c.type === 'away' ? c.timeOff.kind : null;
  };
  const fail = (e: unknown) => toast((e as Error).message, 'bad');

  // --- changes -------------------------------------------------------------------
  const putShifts = async (rows: { employee_id: string; date: string; start_time: string; end_time: string | null; note: string | null }[], drop: Shift[] = []) => {
    try {
      if (drop.length) await clearShifts(drop.map((s) => ({ employee_id: s.employee_id, date: s.date })));
      const saved = await setBlockShifts(rows);
      set((d) => {
        if (!d) return d;
        const m = new Map(d.shifts);
        for (const s of drop) m.delete(`${s.employee_id}|${s.date}`);
        for (const s of saved) m.set(`${s.employee_id}|${s.date}`, s);
        return { ...d, shifts: m };
      });
    } catch (e) { fail(e); }
  };
  const removeShift = async (s: Shift) => {
    set((d) => { if (!d) return d; const m = new Map(d.shifts); m.delete(`${s.employee_id}|${s.date}`); return { ...d, shifts: m }; });
    try { await clearShifts([{ employee_id: s.employee_id, date: s.date }]); } catch (e) { fail(e); }
  };
  const putPost = async (p: Partial<Post>) => {
    try {
      const saved = await savePost({ department_id: dept.id, ...p });
      set((d) => d && { ...d, posts: [...d.posts.filter((x) => x.id !== saved.id), saved] });
      return saved;
    } catch (e) { fail(e); return null; }
  };
  const removePost = async (p: Post) => {
    set((d) => d && { ...d, posts: d.posts.filter((x) => x.id !== p.id) });
    try { await deletePosts([p.id]); } catch (e) { fail(e); }
  };

  const book = (e: Employee, date: string, start = usual.start, end = usual.end, from?: Shift) => {
    const kind = away(e.id, date);
    if (kind) { toast(`${e.name} is off that night (${kind})`, 'bad'); return; }
    const existing = data.shifts.get(`${e.id}|${date}`);
    const note = from?.note ?? (existing?.kind === 'work' ? existing.note : null);
    putShifts([{ employee_id: e.id, date, start_time: start, end_time: end, note }], from && from.date !== date ? [from] : []);
  };
  const addToPost = (e: Employee, post: Post, from?: Post) => {
    const kind = away(e.id, post.date);
    if (kind) { toast(`${e.name} is off that night (${kind})`, 'bad'); return; }
    if (post.employee_ids.includes(e.id)) return;
    putPost({ ...post, employee_ids: [...post.employee_ids, e.id] });
    if (from && from.id !== post.id) putPost({ ...from, employee_ids: from.employee_ids.filter((x) => x !== e.id) });
  };

  // Moving within blocks (or within posts) moves; from a block to a post, or the other way,
  // adds: someone can work a block and take a turn at the stair the same night.
  const drag = useDrag((id, from, target) => {
    const e = person(id);
    if (!e || !target) return;
    const [kind, a, b, c] = target.split('|');
    const fromShift = from?.startsWith('s|') ? data.shifts.get(from.slice(2)) : undefined;
    const fromPost = from?.startsWith('p|') ? data.posts.find((p) => p.id === from.slice(2)) : undefined;
    if (kind === 'd') book(e, a, undefined, undefined, fromShift);
    else if (kind === 'b') book(e, a, b, c || null, fromShift);
    else if (kind === 'p') { const post = data.posts.find((p) => p.id === a); if (post) addToPost(e, post, fromPost); }
  });

  const nights = (id: string) => dates.filter((d) => data.shifts.get(`${id}|${d}`)?.kind === 'work' || data.posts.some((p) => p.date === d && p.department_id === dept.id && p.employee_ids.includes(id))).length;

  // --- render --------------------------------------------------------------------
  const Name = ({ e, tag, dim, birthday, onClick, onPointerDown, onRemove }: { e: Employee | undefined; tag?: string | null; dim?: boolean; birthday?: boolean; onClick?: (ev: ReactMouseEvent<HTMLElement>) => void; onPointerDown?: (ev: ReactPointerEvent) => void; onRemove?: () => void }) => (
    <div className={cn('group/name flex items-center rounded-md bg-white/[0.06] hover:bg-white/[0.1]', dim && 'opacity-35')}>
      <button onPointerDown={onPointerDown} onClick={(ev) => !drag.justDropped() && onClick?.(ev)} className="flex min-h-8 min-w-0 flex-1 cursor-grab items-baseline gap-1.5 px-2 py-1 text-left text-[13.5px] font-semibold uppercase tracking-wide active:cursor-grabbing">
        <span className="truncate">{e?.name ?? '—'}</span>
        {birthday && <Cake className="size-3.5 shrink-0 self-center text-gold" aria-label="Birthday" />}
        {tag && <span className="shrink-0 rounded bg-gold/15 px-1 text-[10px] font-bold tracking-normal text-gold">{tag}</span>}
      </button>
      {onRemove && <button aria-label={`Remove ${e?.name}`} onClick={onRemove} className="grid size-7 shrink-0 place-items-center text-white/0 hover:text-bad group-hover/name:text-white/40"><X className="size-3.5" /></button>}
    </div>
  );

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-white/[0.09] bg-ink-900">
        <div className="grid min-w-[980px] grid-cols-7">
          {/* night headers */}
          {dates.map((d, i) => (
            <div key={d} className={cn('border-b border-r border-white/[0.09] bg-ink-850 px-2.5 py-2 last:border-r-0', d === today && 'bg-gold/[0.08]')}>
              <div className="flex items-baseline justify-between gap-1">
                <span className={cn('text-[13px] font-semibold', d === today && 'text-gold')}>{DAY_LONG[i]} {Number(d.slice(8))}</span>
              </div>
              <div className="-mx-1 flex"><NoteCell date={d} note={data.nightNotes.get(d) ?? ''} onSave={(n) => onNightNote(d, n)} /></div>
            </div>
          ))}

          {/* time blocks */}
          {dates.map((d) => {
            const blocks = blocksOf(nightShifts(d));
            return (
              <div key={d} data-drop={`d|${d}`} className={cn('group flex min-h-[220px] flex-col gap-2 border-r border-white/[0.09] p-1.5 last:border-r-0', d === today && 'bg-gold/[0.03]', drag.dragging && drag.over === `d|${d}` && 'bg-gold/[0.1] outline outline-2 -outline-offset-2 outline-gold')}>
                {blocks.map((b) => (
                  <div key={b.key} data-drop={`b|${d}|${b.start}|${b.end ?? ''}`} className={cn('grid gap-1 rounded-lg p-1', drag.dragging && drag.over === `b|${d}|${b.start}|${b.end ?? ''}` && 'bg-gold/[0.12] outline outline-2 -outline-offset-2 outline-gold')}>
                    <button
                      onClick={(ev) => setMenu({ kind: 'block', date: d, block: b, rect: ev.currentTarget.getBoundingClientRect() })}
                      className="rounded-md bg-teal/12 px-2 py-1 text-center text-[11.5px] font-bold tabular-nums text-teal hover:bg-teal/20"
                    >
                      {rangeLabel(b.start, b.end)}
                    </button>
                    {b.shifts.sort((x, y) => (person(x.employee_id)?.position ?? 0) - (person(y.employee_id)?.position ?? 0)).map((s) => (
                      <Name
                        key={s.id}
                        e={person(s.employee_id)}
                        tag={s.note}
                        birthday={isBirthday(person(s.employee_id)?.birthday ?? null, s.date)}
                        dim={drag.dragging?.from === `s|${s.employee_id}|${s.date}`}
                        onPointerDown={(ev) => drag.start(ev, s.employee_id, person(s.employee_id)?.name.toUpperCase(), `s|${s.employee_id}|${s.date}`)}
                        onClick={(ev) => setMenu({ kind: 'person', shift: s, rect: ev.currentTarget.getBoundingClientRect() })}
                      />
                    ))}
                  </div>
                ))}
                <button
                  onClick={(ev) => setMenu({ kind: 'add', date: d, post: null, rect: ev.currentTarget.getBoundingClientRect() })}
                  className="mt-auto flex h-8 items-center gap-1 rounded-md px-1.5 text-[12px] text-white/0 hover:bg-white/[0.06] hover:text-white group-hover:text-white/40 focus:text-white/60"
                >
                  <Plus className="size-3.5" /> Add
                </button>
              </div>
            );
          })}

          {/* posts */}
          {dates.map((d) => (
            <div key={d} className="group/posts flex flex-col gap-2 border-r border-t border-white/[0.09] bg-white/[0.015] p-1.5 last:border-r-0">
              {postsOf(data.posts, dept.id, d).map((p) => (
                <div key={p.id} data-drop={`p|${p.id}`} className={cn('grid gap-1 rounded-lg border border-gold/25 bg-gold/[0.05] p-1', drag.dragging && drag.over === `p|${p.id}` && 'bg-gold/[0.15] outline outline-2 -outline-offset-2 outline-gold')}>
                  <button onClick={(ev) => setMenu({ kind: 'post', date: d, post: p, rect: ev.currentTarget.getBoundingClientRect() })} className="rounded-md px-1 py-0.5 text-center leading-tight hover:bg-white/[0.06]">
                    <div className="text-[10.5px] font-bold uppercase tracking-wide text-gold/90">{p.location}</div>
                    <div className="text-[11px] tabular-nums text-white/60">{rangeLabel(p.start_time, p.end_time)}</div>
                  </button>
                  {p.employee_ids.map((id) => (
                    <Name
                      key={id}
                      e={person(id)}
                      dim={drag.dragging?.from === `p|${p.id}` && drag.dragging.id === id}
                      onPointerDown={(ev) => drag.start(ev, id, person(id)?.name.toUpperCase(), `p|${p.id}`)}
                      onRemove={() => putPost({ ...p, employee_ids: p.employee_ids.filter((x) => x !== id) })}
                    />
                  ))}
                  {p.employee_ids.length === 0 && (
                    <button onClick={(ev) => setMenu({ kind: 'add', date: d, post: p, rect: ev.currentTarget.getBoundingClientRect() })} className="h-8 rounded-md border border-dashed border-white/15 text-[12px] text-white/40 hover:text-white/70">
                      Drag someone here
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={(ev) => setMenu({ kind: 'post', date: d, post: null, rect: ev.currentTarget.getBoundingClientRect() })}
                className="flex h-8 items-center gap-1 rounded-md px-1.5 text-[12px] text-white/30 hover:bg-white/[0.06] hover:text-white focus:text-white/60"
              >
                <Plus className="size-3.5" /> Post
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* The team; drag someone onto a night, a block or a post. */}
      <div className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.12] bg-ink-900/95 px-4 py-3 text-[13.5px] shadow-[0_12px_40px_-8px_rgba(0,0,0,0.8)] backdrop-blur">
        <span className="mr-2 grid leading-tight">
          <span className="font-semibold">Nights this week</span>
          <span className="hidden text-[12px] text-white/45 md:inline">Drag onto a night, block or post</span>
        </span>
        {team.map((e) => (
          <span
            key={e.id}
            onPointerDown={(ev) => drag.start(ev, e.id, e.name.toUpperCase(), null)}
            title={`Drag ${e.name} onto a night`}
            className={cn('flex h-11 cursor-grab select-none items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 font-semibold uppercase tracking-wide hover:border-white/20 hover:bg-white/[0.07] active:cursor-grabbing', drag.dragging?.id === e.id && !drag.dragging.from && 'opacity-40')}
          >
            {e.name}
            <span className="text-[15px] tabular-nums text-white/60">{nights(e.id)}</span>
          </span>
        ))}
      </div>
      {drag.ghost}

      {menu?.kind === 'block' && (
        <TimesMenu
          rect={menu.rect}
          title={`${DAY_LONG[dates.indexOf(menu.date)]} · ${menu.block.shifts.length} ${menu.block.shifts.length === 1 ? 'person' : 'people'}`}
          start={menu.block.start}
          end={menu.block.end}
          onSave={(start, end) => { const b = menu.block; setMenu(null); putShifts(b.shifts.map((s) => ({ employee_id: s.employee_id, date: s.date, start_time: start, end_time: end, note: s.note }))); }}
          onClose={() => setMenu(null)}
        />
      )}
      {menu?.kind === 'person' && (() => {
        const s = menu.shift;
        const e = person(s.employee_id);
        return (
          <Floating rect={menu.rect} onClose={() => setMenu(null)}>
            <div className="px-1 pb-2 text-[13px] font-semibold">{e?.name} · {DAY_LONG[dates.indexOf(s.date)]} {Number(s.date.slice(8))}</div>
            <TimePair
              start={hm(s.start_time)!}
              end={hm(s.end_time)}
              onChange={(start, end) => { setMenu(null); putShifts([{ employee_id: s.employee_id, date: s.date, start_time: start, end_time: end, note: s.note }]); }}
            />
            {dept.locations.length > 0 && (
              <>
                <Group>Tag</Group>
                <div className="flex flex-wrap gap-1.5 px-1">
                  {dept.locations.map((l) => (
                    <button
                      key={l}
                      onClick={() => { setMenu(null); putShifts([{ employee_id: s.employee_id, date: s.date, start_time: s.start_time!, end_time: s.end_time, note: s.note === l ? null : l }]); }}
                      className={cn('h-8 rounded-lg border px-2.5 text-[12.5px] font-medium', s.note === l ? 'border-gold bg-gold/15 text-gold' : 'border-line text-white/70 hover:bg-white/[0.06]')}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button onClick={() => { setMenu(null); removeShift(s); }} className="mt-2 flex h-9 w-full items-center gap-2 rounded-lg px-2 text-[13.5px] text-bad hover:bg-bad/10">
              <Trash2 className="size-4" /> Remove from this night
            </button>
          </Floating>
        );
      })()}
      {menu?.kind === 'post' && (
        <PostMenu
          rect={menu.rect}
          dept={dept}
          date={menu.date}
          post={menu.post}
          onSave={async (p) => { setMenu(null); await putPost(p); }}
          onDelete={menu.post ? () => { const p = menu.post!; setMenu(null); removePost(p); } : undefined}
          onClose={() => setMenu(null)}
        />
      )}
      {menu?.kind === 'add' && (
        <Floating rect={menu.rect} onClose={() => setMenu(null)}>
          <div className="px-1 pb-1 text-[13px] font-semibold">{menu.post ? menu.post.location : `${DAY_LONG[dates.indexOf(menu.date)]} · ${rangeLabel(usual.start, usual.end)}`}</div>
          <div className="max-h-72 overflow-y-auto">
            {team.map((e) => {
              const off = away(e.id, menu.date);
              const on = menu.post ? menu.post.employee_ids.includes(e.id) : data.shifts.get(`${e.id}|${menu.date}`)?.kind === 'work';
              return (
                <button
                  key={e.id}
                  disabled={!!off || on}
                  onClick={() => { const m = menu; setMenu(null); if (m.post) addToPost(e, m.post); else book(e, m.date); }}
                  className="flex h-9 w-full items-center justify-between rounded-lg px-2 text-left text-[13.5px] hover:bg-white/[0.07] disabled:opacity-35"
                >
                  <span className="font-semibold uppercase tracking-wide">{e.name}</span>
                  <span className="text-[11.5px] text-white/40">{off ?? (on ? 'on' : '')}</span>
                </button>
              );
            })}
          </div>
        </Floating>
      )}
    </>
  );
}

/** Start and end; an empty end means until closing. */
function TimePair({ start, end, onChange }: { start: string; end: string | null; onChange: (start: string, end: string | null) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 px-1">
      <label className="grid gap-1 text-[12px] text-white/55">
        From
        <TimeSelect value={start} onChange={(t) => t && onChange(t, end)} className="h-9 w-full" />
      </label>
      <label className="grid gap-1 text-[12px] text-white/55">
        Until
        <TimeSelect value={end} placeholder="Closing" onChange={(t) => onChange(start, t)} className="h-9 w-full" />
      </label>
    </div>
  );
}

function TimesMenu({ rect, title, start, end, onSave, onClose }: {
  rect: DOMRect; title: string; start: string; end: string | null; onSave: (start: string, end: string | null) => void; onClose: () => void;
}) {
  return (
    <Floating rect={rect} onClose={onClose}>
      <div className="px-1 pb-2 text-[13px] font-semibold">{title}</div>
      <TimePair start={start} end={end} onChange={onSave} />
      <p className="mt-2 px-1 text-[11.5px] leading-snug text-white/40">Changes the times for everyone in this block.</p>
    </Floating>
  );
}

function PostMenu({ rect, dept, date, post, onSave, onDelete, onClose }: {
  rect: DOMRect; dept: Department; date: string; post: Post | null;
  onSave: (p: Partial<Post>) => void; onDelete?: () => void; onClose: () => void;
}) {
  const posts = dept.locations.filter((l) => l !== 'VIP');
  const [location, setLocation] = useState(post?.location ?? posts[0] ?? '');
  const [start, setStart] = useState(hm(post?.start_time ?? dept.usual_start)!);
  const [end, setEnd] = useState<string | null>(post ? hm(post.end_time) : null);
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!location.trim()) return;
    onSave({ ...(post ?? { date, employee_ids: [] }), location: location.trim(), start_time: start, end_time: end });
  };
  return (
    <Floating rect={rect} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-2">
        <div className="px-1 text-[13px] font-semibold">{post ? 'Post' : 'New post'} · {DAY_SHORT[weekday(date)]} {Number(date.slice(8))}</div>
        <label className="grid gap-1 px-1 text-[12px] text-white/55">
          Where
          <input list="post-locations" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={40} className="field h-9 px-2.5 text-[13.5px] text-white" />
          <datalist id="post-locations">{posts.map((l) => <option key={l} value={l} />)}</datalist>
        </label>
        <TimePair start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e); }} />
        <div className="flex items-center gap-2 px-1 pt-1">
          {onDelete && <Button type="button" variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={onDelete} className="text-bad">Delete</Button>}
          <Button type="submit" variant="primary" size="sm" className="ml-auto">{post ? 'Save' : 'Add post'}</Button>
        </div>
      </form>
    </Floating>
  );
}

/** Print: the Excel layout. Day headers, then each night's blocks (time bar, names), then the posts. */
export function BlockPrint({ dept, data, team, dates }: { dept: Department; data: WeekLoad; team: Employee[]; dates: string[] }) {
  const ids = new Set(team.map((e) => e.id));
  const name = (id: string) => team.find((e) => e.id === id)?.name.toUpperCase() ?? '';
  const months = [...new Set(dates.map((d) => new Date(`${d}T12:00:00`).toLocaleString('en-US', { month: 'long' }).toUpperCase()))].join(' / ');
  const head = (i: number) => (i % 2 ? '#a9cdf5' : '#cdeefd');
  const bar = (i: number) => (i % 2 ? '#fff45c' : '#c9f2c9');
  return (
    <section className="print-sheet rounded-md bg-white p-8 shadow-sm print:break-after-page print:rounded-none print:p-0 print:shadow-none">
      <table className="w-full table-fixed border-collapse border-2 border-black text-black [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
        <thead>
          <tr><th colSpan={7} className="border border-black py-1 font-serif text-[22px] font-bold uppercase">Gusto {dept.plural} week schedule</th></tr>
          <tr><th colSpan={7} className="border border-black py-0.5 text-[12px] font-bold">{months} {dates[6].slice(0, 4)}</th></tr>
          <tr>{dates.map((d, i) => <th key={d} style={{ background: head(i) }} className="border border-black py-2.5 text-[12px] font-bold uppercase">{DAY_LONG[i]} {d.slice(8)}{data.nightNotes.get(d) && <div className="text-[11px] text-[#c2410c]">{data.nightNotes.get(d)}</div>}</th>)}</tr>
        </thead>
        <tbody>
          <tr>
            {dates.map((d, i) => (
              <td key={d} className="border border-black p-0 align-top">
                {blocksOf([...data.shifts.values()].filter((s) => s.date === d && s.kind === 'work' && ids.has(s.employee_id))).map((b) => (
                  <div key={b.key}>
                    <div style={{ background: bar(i) }} className="border-y border-black/60 py-1 text-center text-[10.5px] font-bold">{rangeLabel(b.start, b.end).toUpperCase()}</div>
                    {b.shifts.map((s) => (
                      <div key={s.id} className="py-1 text-center text-[14px] font-bold">{name(s.employee_id)}{s.note && <span className="text-[9px]"> - {s.note.toUpperCase()}</span>}</div>
                    ))}
                  </div>
                ))}
              </td>
            ))}
          </tr>
          <tr>
            {dates.map((d, i) => (
              <td key={d} className="border border-black p-0 align-top">
                {postsOf(data.posts, dept.id, d).map((p, k) => (
                  <div key={p.id} style={{ background: k % 2 ? bar(i + 1) : bar(i) }} className="border-b border-black/60 py-1 text-center">
                    <div className="text-[10px] font-bold uppercase">{p.location}</div>
                    <div className="text-[10px] font-bold">{rangeLabel(p.start_time, p.end_time)}</div>
                    <div className="mt-0.5 text-[13px] font-bold">{p.employee_ids.map(name).join('+')}</div>
                  </div>
                ))}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </section>
  );
}
