// Schedule rules, one department at a time, in three plain questions:
//   1. What shifts are there, and when do they start?
//   2. What does each person's week look like? (days off, how many of each shift)
//   3. How many people are needed each night?
// Edits are kept as a draft and saved together from the bar at the bottom.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, Check, Minus, Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Button, Dialog, Empty, Field, IconButton, Input, Segmented, Spinner, Switch, TimeSelect, DJ_HOURS, useConfirm, useToast } from '@/components/ui';
import { RulesSummary } from '../staff/Schedule';
import { useAuth } from '@/lib/auth';
import { allTeams } from '@/lib/access';
import { cn, slugify } from '@/lib/format';
import { DAY_SHORT, RESERVED_KEYS, SHIFT_COLORS, fmtTime, shiftColor } from '@/lib/schedule';
import { deleteDepartment, listDepartments, listShiftTypes, saveDepartment, saveShiftType } from '@/lib/staff';
import { useLoad } from '@/lib/useLoad';
import type { Department, ShiftType } from '@/types';

export function ScheduleRules() {
  const { access } = useAuth();
  const { data, reload } = useLoad(async () => {
    const [departments, types] = await Promise.all([listDepartments(), listShiftTypes()]);
    return { departments, types };
  });
  const [params, setParams] = useSearchParams();
  const [newDept, setNewDept] = useState(false);
  const deptId = params.get('dept') ?? data?.departments[0]?.id;
  const dept = data?.departments.find((d) => d.id === deptId);

  return (
    <>
      <PageHeader
        title="Schedule rules"
        subtitle="How each team works. The schedule checks every week against these rules, and Auto-fill follows them."
      />
      {!data ? <div className="grid h-48 place-items-center"><Spinner /></div> : data.departments.length === 0 ? (
        <Empty icon={<SlidersHorizontal />} title="No teams yet" action={<Button variant="primary" onClick={() => setNewDept(true)}>Add a team</Button>} />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-ink-900 p-1">
              {data.departments.map((d) => (
                <button
                  key={d.id}
                  role="tab"
                  aria-selected={d.id === dept?.id}
                  onClick={() => setParams({ dept: d.id }, { replace: true })}
                  className={cn('h-10 whitespace-nowrap rounded-lg px-4 text-[14px] font-semibold transition-colors', d.id === dept?.id ? 'bg-white text-ink-950' : 'text-white/60 hover:text-white')}
                >
                  {d.plural}
                </button>
              ))}
            </div>
            {allTeams(access) && <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setNewDept(true)}>Add a team</Button>}
          </div>
          {dept && (
            <DepartmentRules
              key={dept.id}
              dept={dept}
              types={data.types.filter((t) => t.department_id === dept.id)}
              onSaved={reload}
              onDeleted={() => { setParams({}, { replace: true }); reload(); }}
            />
          )}
        </>
      )}
      <NewDepartmentDialog open={newDept} onClose={() => setNewDept(false)} count={data?.departments.length ?? 0} onSaved={(id) => { reload(); setParams({ dept: id }, { replace: true }); }} />
    </>
  );
}

function DepartmentRules({ dept, types, onSaved, onDeleted }: { dept: Department; types: ShiftType[]; onSaved: () => void; onDeleted: () => void }) {
  const { access } = useAuth();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [d, setD] = useState(dept);
  const [ts, setTs] = useState(types);
  const [editing, setEditing] = useState<Partial<ShiftType> | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setD(dept); setTs(types); }, [dept, types]);

  const live = ts.filter((t) => !t.archived);
  const archived = ts.filter((t) => t.archived);
  const dirty = JSON.stringify(d) !== JSON.stringify(dept) || JSON.stringify(ts) !== JSON.stringify(types);
  const setType = (id: string, patch: Partial<ShiftType>) => setTs((all) => all.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const usesPattern = d.days_off_per_week != null || live.some((t) => t.weekly_target != null);
  const patternTotal = (d.days_off_per_week ?? 0) + live.reduce((n, t) => n + (t.weekly_target ?? 0), 0);

  const togglePattern = (on: boolean) => {
    setD((x) => ({ ...x, days_off_per_week: on ? x.days_off_per_week ?? 2 : null }));
    setTs((all) => all.map((t) => (t.archived ? t : { ...t, weekly_target: on ? t.weekly_target ?? 0 : null })));
  };

  const save = async () => {
    setSaving(true);
    try {
      if (JSON.stringify(d) !== JSON.stringify(dept)) await saveDepartment({ id: d.id, name: d.name.trim(), plural: d.plural.trim(), position: d.position, days_off_per_week: d.days_off_per_week, schedule_by: d.schedule_by, usual_start: d.usual_start, usual_end: d.usual_end, locations: d.locations });
      for (const t of ts) {
        const before = types.find((x) => x.id === t.id);
        if (JSON.stringify(before) === JSON.stringify(t)) continue;
        await saveShiftType({
          id: t.id, department_id: t.department_id, name: t.name.trim(), code: t.code, start_time: t.start_time, end_time: t.end_time || null,
          weekly_target: t.weekly_target, daily_minimum: t.daily_minimum, color: t.color, position: t.position, archived: t.archived,
        });
      }
      toast('Rules saved. Shifts already planned from tonight on use the new start times.');
      onSaved();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid max-w-4xl gap-5 pb-24">
      <section className="rounded-2xl border border-gold/20 bg-gold/[0.04] p-5">
        <h2 className="mb-3 text-[15px]">In short</h2>
        <div className="text-white/80">{d.schedule_by === 'month' ? <p>Planned by month: book who plays each night. Everyone starts at {fmtTime(d.usual_start)} unless you change it for a special night.</p>
          : d.schedule_by === 'none' ? <p>Not on the schedule. People in this team still get time off and birthdays, and can open the club if they have keys.</p>
          : d.schedule_by === 'blocks' ? <p>Planned a week at a time in time blocks. Someone added to a night works {fmtTime(d.usual_start)} – {d.usual_end ? fmtTime(d.usual_end) : 'closing'} unless you change it.{d.locations.length > 0 && ` Posts and tags: ${d.locations.join(', ')}.`}</p>
          : <RulesSummary dept={d} types={live} compact />}</div>
      </section>

      {d.schedule_by === 'week' && <>
      {/* 1. Shifts */}
      <Card step={1} title="Shifts and start times" body="The shifts this team works. Change a time here and it applies to every night from tonight on. One-off times can still be set on the schedule itself.">
        <div className="divide-y divide-line">
          {live.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
              <span className={cn('size-3 shrink-0 rounded-full', shiftColor(t.color).dot)} />
              <span className="min-w-24 flex-1 font-semibold">{t.name}</span>
              <label className="flex items-center gap-2 text-[13px] text-white/60">
                Starts
                <TimeSelect aria-label={`${t.name} starts`} value={t.start_time} onChange={(v) => v && setType(t.id, { start_time: v })} className="h-10" />
              </label>
              <label className="flex items-center gap-2 text-[13px] text-white/60">
                Ends
                <TimeSelect aria-label={`${t.name} ends`} value={t.end_time} onChange={(v) => setType(t.id, { end_time: v })} placeholder="Till close" className="h-10" />
              </label>
              <IconButton label={`Edit ${t.name}`} className="size-9" onClick={() => setEditing(t)}><Pencil className="size-4" /></IconButton>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing({ department_id: dept.id, color: 'gold', start_time: '21:00', position: ts.length })}>Add a shift</Button>
          {archived.length > 0 && <span className="text-[12.5px] text-white/40">Archived: {archived.map((t) => <button key={t.id} className="ml-1 underline" onClick={() => setEditing(t)}>{t.name}</button>)}</span>}
        </div>
      </Card>

      {/* 2. Weekly pattern */}
      <Card
        step={2}
        title="Each person’s week"
        body="How many days off everyone gets, and how many nights of each shift. Leave it off for teams that are planned by hand."
        aside={<Switch checked={usesPattern} onChange={togglePattern} label="" />}
      >
        {usesPattern ? (
          <div className="grid gap-2">
            {live.map((t) => (
              <StepperRow key={t.id} label={<><span className={cn('size-2.5 rounded-full', shiftColor(t.color).dot)} />{t.name} <span className="num text-white/40">{fmtTime(t.start_time)}</span></>} unit="nights" value={t.weekly_target ?? 0} onChange={(n) => setType(t.id, { weekly_target: n })} />
            ))}
            <StepperRow label={<><span className="size-2.5 rounded-full bg-white/25" />Days off</>} unit="days" value={d.days_off_per_week ?? 0} onChange={(n) => setD({ ...d, days_off_per_week: n })} />
            <div className={cn('mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-[13px]', patternTotal === 7 ? 'bg-ok/[0.07] text-ok' : 'bg-warn/10 text-warn')}>
              {patternTotal === 7 ? <Check className="size-4" /> : <Minus className="size-4" />}
              {patternTotal === 7 ? 'Adds up to the full week (7 nights).' : `Adds up to ${patternTotal} of 7 nights. Usually this should be 7.`}
            </div>
          </div>
        ) : <p className="text-mute">Off: nobody is flagged for their mix of shifts or days off.</p>}
      </Card>

      {/* 3. Minimums */}
      <Card step={3} title="People needed each night" body="The schedule warns when a night has fewer people than this. Turn it on only for the shifts that need it.">
        <div className="grid gap-4">
          {live.map((t) => (
            <div key={t.id} className="grid gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-semibold"><span className={cn('size-2.5 rounded-full', shiftColor(t.color).dot)} />{t.name} <span className="num font-normal text-white/40">{fmtTime(t.start_time)}</span></span>
                <Switch checked={!!t.daily_minimum} onChange={(on) => setType(t.id, { daily_minimum: on ? [2, 2, 2, 2, 3, 3, 2] : null })} label="" />
              </div>
              {t.daily_minimum && (
                <div className="grid grid-cols-7 gap-1.5">
                  {DAY_SHORT.map((day, i) => (
                    <div key={day} className={cn('grid gap-1 rounded-xl border border-line p-1.5 text-center', (i === 4 || i === 5) && 'border-gold/20 bg-gold/[0.03]')}>
                      <span className="text-[11.5px] font-medium text-white/55">{day}</span>
                      <span className="num text-[20px] font-semibold leading-tight">{t.daily_minimum![i]}</span>
                      <div className="flex justify-center gap-1">
                        <MiniStep label={`Fewer on ${day}`} onClick={() => setType(t.id, { daily_minimum: t.daily_minimum!.map((n, j) => (j === i ? Math.max(0, n - 1) : n)) })}><Minus className="size-3" /></MiniStep>
                        <MiniStep label={`More on ${day}`} onClick={() => setType(t.id, { daily_minimum: t.daily_minimum!.map((n, j) => (j === i ? Math.min(50, n + 1) : n)) })}><Plus className="size-3" /></MiniStep>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      </>}

      {/* Week or month */}
      <Card title="How this team is planned" body={{
        week: 'A week at a time, a row per person, with the shifts, weekly pattern and minimums below (bar).',
        blocks: 'A week at a time, each night in time blocks with posts like the stair entrance underneath (security).',
        month: 'A month at a time: each night lists who plays (DJs). Guests can be added right from the schedule.',
        none: 'Not on the schedule (management). They still have time off, birthdays and can open the club.',
      }[d.schedule_by]}>
        <Segmented<'week' | 'blocks' | 'month' | 'none'>
          value={d.schedule_by}
          onChange={(v) => setD({ ...d, schedule_by: v })}
          options={[{ value: 'week', label: 'By week' }, { value: 'blocks', label: 'Time blocks' }, { value: 'month', label: 'By month' }, { value: 'none', label: 'Not scheduled' }]}
        />
      </Card>

      {d.schedule_by === 'month' && (
        <Card title="Usual start time" body="New bookings start at this time. For a special night like Halloween, click a booking on the schedule to give it its own start and end time; only those times are printed.">
          <TimeSelect steps={DJ_HOURS} value={d.usual_start} onChange={(t) => t && setD({ ...d, usual_start: t })} className="h-11 w-[160px]" aria-label="Usual start time" />
        </Card>
      )}

      {d.schedule_by === 'blocks' && (
        <>
          <Card title="Usual times" body="Someone dragged onto a night gets these times. Change a single night by clicking its block on the schedule.">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="From">{(id) => <TimeSelect id={id} value={d.usual_start} onChange={(t) => t && setD({ ...d, usual_start: t })} className="h-11 w-[160px]" />}</Field>
              <Field label="Until">{(id) => <TimeSelect id={id} value={d.usual_end} placeholder="Closing" onChange={(t) => setD({ ...d, usual_end: t })} className="h-11 w-[160px]" />}</Field>
            </div>
          </Card>
          <Card title="Posts and tags" body="Places someone can be posted on a night, like the stair entrance. VIP is a tag on a person instead of a post.">
            <Locations value={d.locations} onChange={(locations) => setD({ ...d, locations })} />
          </Card>
        </>
      )}

      {/* Team name */}
      <Card title="Team name">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="One person" hint="e.g. Bar, Security">{(id) => <Input id={id} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />}</Field>
          <Field label="The whole team" hint="Shown on the schedule and print-out">{(id) => <Input id={id} value={d.plural} onChange={(e) => setD({ ...d, plural: e.target.value })} />}</Field>
        </div>
        {allTeams(access) && <button
          className="mt-4 flex items-center gap-2 text-[13px] text-white/45 hover:text-bad"
          onClick={async () => {
            if (!(await confirm(`Delete ${dept.plural}?`, 'Only possible when nobody is in this team any more. Its shifts and rules go with it.'))) return;
            try { await deleteDepartment(dept.id); toast('Team deleted'); onDeleted(); } catch (e) { toast((e as Error).message, 'bad'); }
          }}
        >
          <Trash2 className="size-4" /> Delete this team
        </button>}
      </Card>

      {/* Save bar */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 md:bottom-6 md:left-[248px]">
          <div className="flex w-full max-w-xl animate-fade-up items-center gap-3 rounded-2xl border border-line bg-ink-700 px-4 py-3 shadow-pop">
            <span className="flex-1 font-medium">You have unsaved changes</span>
            <Button variant="ghost" size="sm" onClick={() => { setD(dept); setTs(types); }}>Undo</Button>
            <Button variant="primary" size="sm" loading={saving} onClick={save}>Save rules</Button>
          </div>
        </div>
      )}

      {editing && <ShiftDialog initial={editing} siblings={ts} onClose={() => setEditing(null)} onSaved={onSaved} />}
      {dialog}
    </div>
  );
}

function Locations({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [add, setAdd] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = add.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setAdd('');
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.map((l) => (
        <span key={l} className="flex h-9 items-center gap-1 rounded-lg border border-line bg-white/[0.04] pl-3 pr-1 text-[13.5px]">
          {l}
          <IconButton label={`Remove ${l}`} className="size-7" onClick={() => onChange(value.filter((x) => x !== l))}><Trash2 className="size-3.5" /></IconButton>
        </span>
      ))}
      <form onSubmit={submit} className="flex gap-1.5">
        <Input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Add a post or tag" maxLength={40} className="h-9 w-48" />
        <Button type="submit" size="sm" icon={<Plus className="size-4" />} disabled={!add.trim()}>Add</Button>
      </form>
    </div>
  );
}

function Card({ step, title, body, aside, children }: { step?: number; title: string; body?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-start gap-3">
        {step && <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/[0.07] text-[13px] font-semibold text-white/70">{step}</span>}
        <div className="grid flex-1 gap-1">
          <h2 className="text-[17px]">{title}</h2>
          {body && <p className="text-[13px] text-mute">{body}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function StepperRow({ label, unit, value, onChange }: { label: ReactNode; unit: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
      <span className="flex flex-1 items-center gap-2 font-medium">{label}</span>
      <div className="flex items-center gap-1">
        <IconButton label="Fewer" variant="secondary" className="size-9" disabled={value <= 0} onClick={() => onChange(value - 1)}><Minus className="size-4" /></IconButton>
        <span className="num w-8 text-center text-[18px] font-semibold">{value}</span>
        <IconButton label="More" variant="secondary" className="size-9" disabled={value >= 7} onClick={() => onChange(value + 1)}><Plus className="size-4" /></IconButton>
      </div>
      <span className="w-12 text-[13px] text-white/45">{unit}</span>
    </div>
  );
}

const MiniStep = ({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) => (
  <button type="button" aria-label={label} title={label} onClick={onClick} className="grid size-6 place-items-center rounded-md bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white">{children}</button>
);

/** Add a shift, or change its name, letter and colour (times live on the page). */
function ShiftDialog({ initial, siblings, onClose, onSaved }: { initial: Partial<ShiftType>; siblings: ShiftType[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [t, setT] = useState<Partial<ShiftType>>(initial);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<ShiftType>) => setT((x) => ({ ...x, ...p }));
  const suggested = useMemo(() => (t.name ?? '').trim().charAt(0).toUpperCase(), [t.name]);
  const code = (t.code ?? (t.id ? '' : suggested)).toUpperCase();
  const codeError = code && RESERVED_KEYS[code] ? `${code} is the shortcut for ${RESERVED_KEYS[code] === 'off' ? 'Off' : RESERVED_KEYS[code]}` : siblings.some((s) => s.code === code && s.id !== t.id) ? 'Another shift uses this letter' : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (codeError || !code) return;
    setBusy(true);
    try {
      await saveShiftType({
        ...(t.id ? { id: t.id } : {}),
        department_id: t.department_id, name: t.name?.trim(), code, start_time: t.start_time, end_time: t.end_time || null,
        weekly_target: t.weekly_target ?? null, daily_minimum: t.daily_minimum ?? null, color: t.color ?? 'gold', position: t.position ?? 0, archived: t.archived ?? false,
      });
      onSaved();
      onClose();
    } catch (err) { toast((err as Error).message, 'bad'); } finally { setBusy(false); }
  };
  const archive = async () => {
    try {
      // Archived, not deleted: weeks already planned keep showing it.
      await saveShiftType({ ...(t as ShiftType), archived: !t.archived });
      onSaved();
      onClose();
    } catch (err) { toast((err as Error).message, 'bad'); }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t.id ? `Edit ${initial.name}` : 'Add a shift'}
      footer={<>
        {t.id && <Button variant="ghost" className="mr-auto" icon={t.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} onClick={archive}>{t.archived ? 'Bring back' : 'Archive'}</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" type="submit" form="shift-form" loading={busy}>{t.id ? 'Save' : 'Add shift'}</Button>
      </>}
    >
      <form id="shift-form" onSubmit={submit} className="grid gap-4">
        <Field label="Name">{(id) => <Input id={id} required maxLength={30} placeholder="e.g. Early, Door, Closing" value={t.name ?? ''} onChange={(e) => set({ name: e.target.value })} />}</Field>
        {!t.id && (
          <Field label="Starts">{(id) => <TimeSelect id={id} value={t.start_time ?? '21:00'} onChange={(v) => v && set({ start_time: v })} />}</Field>
        )}
        <div className="grid gap-1.5">
          <span className="text-[13px] font-medium text-white/85">Colour on the schedule</span>
          <div className="flex gap-2.5">
            {Object.entries(SHIFT_COLORS).map(([key, c]) => (
              <button key={key} type="button" aria-label={key} onClick={() => set({ color: key })} className={cn('size-8 rounded-full ring-2 ring-offset-2 ring-offset-ink-850', c.dot, t.color === key ? 'ring-white' : 'ring-transparent')} />
            ))}
          </div>
        </div>
        <Field label="Keyboard letter" error={codeError} hint="Press this letter on the schedule to set the shift.">
          {(id) => <Input id={id} maxLength={2} className="w-20 text-center font-mono uppercase" value={code} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />}
        </Field>
      </form>
    </Dialog>
  );
}

function NewDepartmentDialog({ open, onClose, onSaved, count }: { open: boolean; onClose: () => void; onSaved: (id: string) => void; count: number }) {
  const toast = useToast();
  const [plural, setPlural] = useState('');
  useEffect(() => { if (open) setPlural(''); }, [open]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const id = slugify(plural);
    if (!id) return;
    try {
      await saveDepartment({ id, name: plural.trim(), plural: plural.trim(), position: count, days_off_per_week: null, schedule_by: 'week' });
      onSaved(id);
      onClose();
    } catch (err) { toast((err as Error).message, 'bad'); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Add a team" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="new-dept">Add team</Button></>}>
      <form id="new-dept" onSubmit={submit}>
        <Field label="Team name" hint="e.g. Hosts, Kitchen. You add its shifts next.">{(id) => <Input id={id} required value={plural} onChange={(e) => setPlural(e.target.value)} />}</Field>
      </form>
    </Dialog>
  );
}
