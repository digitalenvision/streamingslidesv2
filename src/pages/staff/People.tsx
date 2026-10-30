// The team: bar staff, DJs and security. No logins, just the details the schedule needs,
// plus each person's vacation balance and sick days.
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Cake, CalendarPlus, ImageUp, Pencil, Phone, Plus, Search, Trash2, Users } from 'lucide-react';
import { PageHeader, Avatar } from '@/components/AppShell';
import { Badge, Button, Dialog, Empty, Field, IconButton, Input, Segmented, Switch, Textarea, useConfirm, useToast } from '@/components/ui';
import { BalanceBar, KindBadge, NameOrLogo, TimeOffDialog, balance, fmtDays } from '@/components/staff';
import { arubaToday, cn, formatDate, plural } from '@/lib/format';
import { formatRange, fmtTime, nextBirthday, timeOffDays } from '@/lib/schedule';
import { deleteEmployee, deleteTimeOff, listDepartments, listEmployees, listShiftTypes, listTimeOff, removeLogo, saveEmployee, uploadLogo } from '@/lib/staff';
import { useLoad } from '@/lib/useLoad';
import type { Employee, TimeOff } from '@/types';

export function People() {
  const year = Number(arubaToday().slice(0, 4));
  const { data, reload } = useLoad(async () => {
    const [departments, shiftTypes, employees, timeOff] = await Promise.all([
      listDepartments(), listShiftTypes(), listEmployees(), listTimeOff(`${year}-01-01`, `${year + 1}-12-31`),
    ]);
    return { departments, shiftTypes, employees, timeOff };
  });
  const [params, setParams] = useSearchParams();
  const [dept, setDept] = useState('all');
  const [query, setQuery] = useState('');
  const [inactive, setInactive] = useState(false);

  const openId = params.get('id');
  const creating = params.has('new');
  const close = () => setParams((p) => { p.delete('id'); p.delete('new'); return p; }, { replace: true });

  const groups = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.departments
      .filter((d) => dept === 'all' || d.id === dept)
      .map((d) => ({
        dept: d,
        people: data.employees.filter((e) => e.department_id === d.id && (inactive || e.active) && (!q || `${e.name} ${e.job_title ?? ''} ${e.phone ?? ''}`.toLowerCase().includes(q))),
      }))
      .filter((g) => g.people.length || (!q && dept !== 'all'));
  }, [data, dept, query, inactive]);

  const today = arubaToday();
  const awayNow = (e: Employee) => data?.timeOff.find((t) => t.employee_id === e.id && t.kind !== 'request' && t.starts_on <= today && t.ends_on >= today);
  const active = data?.employees.filter((e) => e.active).length ?? 0;

  return (
    <>
      <PageHeader
        kicker={data ? plural(active, 'active person', 'active people') : 'Team'}
        title="People"
        subtitle="Everyone on the schedule. They don’t need a login: managers and owners plan for them."
        actions={<>
          <Link to="/time-off?new=1"><Button icon={<CalendarPlus className="size-4" />}>Add time off</Button></Link>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setParams({ new: '1' })}>Add person</Button>
        </>}
      />

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Segmented
          value={dept}
          onChange={setDept}
          className="w-full overflow-x-auto lg:w-auto"
          options={[{ value: 'all', label: 'Everyone' }, ...(data?.departments ?? []).map((d) => ({ value: d.id, label: d.plural }))]}
        />
        <label className="relative flex-1 lg:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, role, phone" className="pl-9" />
        </label>
        <div className="lg:ml-auto"><Switch checked={inactive} onChange={setInactive} label="Show former staff" /></div>
      </div>

      {!data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-36 rounded-2xl" />)}</div>
      ) : data.employees.length === 0 ? (
        <Empty icon={<Users />} title="Add your team" body="Start with the bar staff: their schedule can then be filled in one click." action={<Button variant="primary" onClick={() => setParams({ new: '1' })}>Add person</Button>} />
      ) : (
        <div className="grid gap-8">
          {groups.map(({ dept: d, people }) => (
            <section key={d.id} className="grid gap-3">
              <h2 className="kicker flex items-center gap-2">{d.plural} <span className="text-white/25">{people.length}</span></h2>
              {people.length === 0 ? <p className="text-mute">Nobody here yet.</p> : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {people.map((e) => {
                    const b = balance(e, data.timeOff, year, d);
                    const away = awayNow(e);
                    const def = data.shiftTypes.find((t) => t.id === e.default_shift_type_id);
                    return (
                      <button key={e.id} onClick={() => setParams({ id: e.id })} className={cn('panel grid gap-4 p-4 text-left transition-colors hover:border-white/15', !e.active && 'opacity-55')}>
                        <div className="flex items-start gap-3">
                          {e.logo_path
                            ? <span className="grid h-10 w-16 shrink-0 place-items-center"><NameOrLogo e={e} className="h-auto max-h-10 w-full object-center" /></span>
                            : <Avatar name={e.name} className="size-10 text-[12px]" />}
                          <div className="grid min-w-0 flex-1 gap-0.5">
                            <span className="truncate text-[15px] font-semibold">{e.name}</span>
                            <span className="truncate text-[12.5px] text-mute">{[e.job_title, def && `usually ${def.name.toLowerCase()} ${fmtTime(def.start_time)}`].filter(Boolean).join(' · ') || d.name}</span>
                          </div>
                          {!e.active ? <Badge>Former</Badge> : away ? <KindBadge kind={away.kind} /> : e.guest ? <Badge tone="gold">Guest</Badge> : !e.counted ? <Badge>Not counted</Badge> : e.can_open ? <Badge tone="gold">Opens</Badge> : null}
                        </div>
                        {Number(e.vacation_days) > 0 && <BalanceBar b={b} />}
                        {e.birthday && e.active && (() => {
                          const n = nextBirthday(e.birthday, today);
                          return n.days <= 30 && (
                            <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-gold">
                              <Cake className="size-3.5" /> {n.days === 0 ? 'Birthday today' : `Birthday ${n.days === 1 ? 'tomorrow' : formatDate(n.date, { weekday: 'short', month: 'short', day: 'numeric' })}`} · turns {n.age}
                            </span>
                          );
                        })()}
                        <div className="flex items-center justify-between text-[12px] text-white/50">
                          <span>{e.phone ?? 'No phone'}</span>
                          <span className={cn(b.sickDays > 0 && 'text-white/75')}>Sick: {plural(b.sickDays, 'day')} in {year}{b.noCertificate > 0 && <span className="text-warn"> · {b.noCertificate} no note</span>}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {data && (
        <PersonSheet
          key={openId ?? (creating ? 'new' : 'none')}
          open={!!openId || creating}
          employee={data.employees.find((e) => e.id === openId) ?? null}
          data={data}
          year={year}
          defaultDept={dept === 'all' ? data.departments[0]?.id : dept}
          onClose={close}
          onSaved={(e) => { reload(); if (creating && e) setParams({ id: e.id }, { replace: true }); }}
        />
      )}
    </>
  );
}

type PeopleData = { departments: Awaited<ReturnType<typeof listDepartments>>; shiftTypes: Awaited<ReturnType<typeof listShiftTypes>>; employees: Employee[]; timeOff: TimeOff[] };

function PersonSheet({ open, employee, data, year, defaultDept, onClose, onSaved }: {
  open: boolean; employee: Employee | null; data: PeopleData; year: number; defaultDept?: string; onClose: () => void; onSaved: (e?: Employee) => void;
}) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [tab, setTab] = useState<'details' | 'time'>('details');
  const [form, setForm] = useState<Partial<Employee>>(() => employee ?? { department_id: defaultDept, vacation_days: 15, active: true, counted: true });
  const [busy, setBusy] = useState(false);
  const [logo, setLogo] = useState<File | 'remove' | null>(null);
  const logoPreview = useMemo(() => (logo instanceof File ? URL.createObjectURL(logo) : null), [logo]);
  const [timeOff, setTimeOff] = useState<{ open: boolean; initial?: Partial<TimeOff> }>({ open: false });
  const set = (patch: Partial<Employee>) => setForm((f) => ({ ...f, ...patch }));
  const dept = data.departments.find((d) => d.id === form.department_id);
  const types = data.shiftTypes.filter((t) => t.department_id === form.department_id && !t.archived);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await saveEmployee({
        ...(employee ? { id: employee.id } : {}),
        name: form.name?.trim(),
        department_id: form.department_id,
        job_title: form.job_title?.trim() || null,
        phone: form.phone?.trim() || null,
        email: form.email?.trim() || null,
        default_shift_type_id: types.some((t) => t.id === form.default_shift_type_id) ? form.default_shift_type_id : null,
        vacation_days: Number(form.vacation_days ?? 0),
        started_on: form.started_on || null,
        birthday: form.birthday || null,
        notes: form.notes?.trim() || null,
        active: form.active ?? true,
        counted: form.counted ?? true,
        can_open: form.can_open ?? false,
      });
      if (logo === 'remove') await removeLogo(saved);
      else if (logo) await uploadLogo(saved, logo);
      toast(employee ? 'Saved' : `${saved.name} added`);
      onSaved(saved);
      if (employee) onClose();
    } catch (err) {
      toast((err as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!employee) return;
    const ok = await confirm(
      `Delete ${employee.name}?`,
      <>This deletes their shifts and time-off history too. To keep the history, switch off <b>Works here</b> instead.</>,
    );
    if (!ok) return;
    try {
      await deleteEmployee(employee.id);
      toast('Deleted');
      onSaved();
      onClose();
    } catch (err) {
      toast((err as Error).message, 'bad');
    }
  };

  const mine = employee ? data.timeOff.filter((t) => t.employee_id === employee.id).sort((a, b) => b.starts_on.localeCompare(a.starts_on)) : [];
  const b = employee ? balance(employee, data.timeOff, year, dept) : null;

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        wide
        title={employee ? employee.name : 'Add a person'}
        footer={tab === 'details' ? (
          <>
            {employee && <Button variant="ghost" className="mr-auto text-bad" icon={<Trash2 className="size-4" />} onClick={remove}>Delete</Button>}
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" form="person-form" loading={busy}>{employee ? 'Save' : 'Add person'}</Button>
          </>
        ) : (
          <Button variant="primary" icon={<CalendarPlus className="size-4" />} onClick={() => setTimeOff({ open: true, initial: { employee_id: employee!.id } })}>Add time off</Button>
        )}
      >
        {employee && (
          <Segmented value={tab} onChange={setTab} className="mb-5 w-full" options={[{ value: 'details', label: 'Details' }, { value: 'time', label: `Time off ${year}` }]} />
        )}
        {tab === 'details' ? (
          <form id="person-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2">{(id) => <Input id={id} required autoFocus={!employee} maxLength={80} value={form.name ?? ''} onChange={(e) => set({ name: e.target.value })} />}</Field>
            <Field label="Department">
              {(id) => (
                <select id={id} className="field" value={form.department_id ?? ''} onChange={(e) => set({ department_id: e.target.value, default_shift_type_id: null })} required>
                  {data.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
            </Field>
            <Field label="Role" hint="Shown under their name">{(id) => <Input id={id} placeholder="Bartender, Head of security…" value={form.job_title ?? ''} onChange={(e) => set({ job_title: e.target.value })} />}</Field>
            <Field label="Usual shift" hint="Used for extra nights when filling a week">
              {(id) => (
                <select id={id} className="field" value={form.default_shift_type_id ?? ''} onChange={(e) => set({ default_shift_type_id: e.target.value || null })}>
                  <option value="">No preference</option>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name} · {fmtTime(t.start_time)}</option>)}
                </select>
              )}
            </Field>
            <Field label="Vacation days per year" hint="As in their contract">{(id) => <Input id={id} type="number" min={0} max={60} step={0.5} value={form.vacation_days ?? ''} onChange={(e) => set({ vacation_days: Number(e.target.value) })} />}</Field>
            <Field label="Phone">{(id) => <Input id={id} type="tel" autoComplete="off" value={form.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} />}</Field>
            <Field label="Email">{(id) => <Input id={id} type="email" autoComplete="off" value={form.email ?? ''} onChange={(e) => set({ email: e.target.value })} />}</Field>
            <Field label="Started on">{(id) => <Input id={id} type="date" value={form.started_on ?? ''} onChange={(e) => set({ started_on: e.target.value })} />}</Field>
            <Field label="Birthday" hint="Shown on Today and the schedule that week">{(id) => <Input id={id} type="date" min="1920-01-01" max="2020-12-31" value={form.birthday ?? ''} onChange={(e) => set({ birthday: e.target.value })} />}</Field>
            <div className="flex items-end pb-1"><Switch checked={form.active ?? true} onChange={(active) => set({ active })} label="Works here" description="Off: hidden from schedules, history kept" /></div>
            {dept?.schedule_by !== 'month' && <div className="flex items-end pb-1 sm:col-span-2"><Switch checked={form.counted ?? true} onChange={(counted) => set({ counted })} label="Counts toward the team's numbers" description="Off: still on the schedule, but left out of the nightly counts and weekly rules, like hookah staff on the bar sheet" /></div>}
            {dept?.schedule_by !== 'month' && <div className="flex items-end pb-1 sm:col-span-2"><Switch checked={form.can_open ?? false} onChange={(can_open) => set({ can_open })} label="Can open the club" description="Has keys: can be picked to open for the early staff" /></div>}
            {dept?.schedule_by === 'month' && (
              <Field label="Logo" className="sm:col-span-2" hint="PNG with a transparent background works best. Shown on the DJ calendar and print.">
                {(id) => (
                  <div className="flex items-center gap-3">
                    <div className="grid h-16 w-40 shrink-0 place-items-center rounded-lg border border-line bg-ink-950 p-2">
                      {logoPreview ? <img src={logoPreview} alt="" className="max-h-full max-w-full object-contain" />
                        : logo !== 'remove' && employee?.logo_path ? <NameOrLogo e={employee} className="h-auto max-h-12 w-full object-center" />
                        : <span className="text-[12px] text-mute">No logo</span>}
                    </div>
                    <Button type="button" size="sm" icon={<ImageUp className="size-4" />} onClick={() => document.getElementById(id)?.click()}>{(employee?.logo_path && logo !== 'remove') || logo instanceof File ? 'Replace' : 'Upload'}</Button>
                    <input id={id} type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setLogo(f); e.target.value = ''; }} />
                    {(logo instanceof File || (employee?.logo_path && logo !== 'remove')) && <Button type="button" variant="ghost" size="sm" onClick={() => setLogo(employee?.logo_path ? 'remove' : null)}>Remove</Button>}
                  </div>
                )}
              </Field>
            )}
            <Field label="Notes" className="sm:col-span-2" hint="Only admins see this.">{(id) => <Textarea id={id} rows={3} value={form.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />}</Field>
          </form>
        ) : (
          <div className="grid gap-5">
            {b && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Vacation left" value={fmtDays(b.left)} sub={`of ${fmtDays(b.allowance)} days`} tone={b.left < 0 ? 'bad' : 'teal'} />
                <Stat label="Taken + planned" value={fmtDays(b.taken + b.planned)} sub={`${fmtDays(b.planned)} still to come`} />
                <Stat label="Sick days" value={String(b.sickDays)} sub={b.noCertificate ? `${b.noCertificate} without doctor’s note` : `${plural(b.sickTimes, 'time')}`} tone={b.noCertificate ? 'warn' : undefined} />
              </div>
            )}
            {b && <BalanceBar b={b} />}
            {employee?.phone && <a href={`tel:${employee.phone}`} className="flex items-center gap-2 text-[13px] text-gold"><Phone className="size-4" /> Call {employee.name.split(' ')[0]}</a>}
            <div className="grid divide-y divide-line rounded-xl border border-line">
              {mine.length === 0 && <p className="p-4 text-mute">No time off recorded.</p>}
              {mine.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <KindBadge kind={t.kind} />
                  <span className="num text-[12.5px]">{formatRange(t.starts_on, t.ends_on)}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-mute">
                    {t.kind === 'vacation' && `${fmtDays(timeOffDays(t, dept?.days_off_per_week ?? null))} vacation days`}
                    {t.kind === 'sick' && (t.certificate ? 'Doctor’s note ✓' : 'No note yet')}
                    {t.note && ` ${t.note}`}
                  </span>
                  <IconButton label="Edit" className="size-8" onClick={() => setTimeOff({ open: true, initial: t })}><Pencil className="size-3.5" /></IconButton>
                  <IconButton label="Delete" className="size-8" onClick={async () => {
                    if (!(await confirm('Delete this time off?', 'Their schedule for those days stays empty until you fill it.'))) return;
                    try { await deleteTimeOff(t.id); onSaved(); } catch (err) { toast((err as Error).message, 'bad'); }
                  }}><Trash2 className="size-3.5" /></IconButton>
                </div>
              ))}
            </div>
          </div>
        )}
      </Dialog>
      <TimeOffDialog
        open={timeOff.open}
        initial={timeOff.initial}
        employees={data.employees}
        departments={data.departments}
        onClose={() => setTimeOff({ open: false })}
        onSaved={() => onSaved()}
      />
      {dialog}
    </>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'bad' | 'warn' | 'teal' }) {
  return (
    <div className="rounded-xl border border-line bg-white/[0.02] p-3.5">
      <div className="kicker">{label}</div>
      <div className={cn('num mt-2 text-[26px] font-semibold leading-none', tone === 'bad' && 'text-bad', tone === 'warn' && 'text-warn', tone === 'teal' && 'text-teal')}>{value}</div>
      {sub && <div className="mt-1 text-[12px] text-mute">{sub}</div>}
    </div>
  );
}
