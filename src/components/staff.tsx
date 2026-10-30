// Shared pieces for the team pages: time-off dialog, yearly balances, little badges.
import { useEffect, useState, type FormEvent } from 'react';
import { Badge, Button, Dialog, Field, Input, Segmented, Switch, Textarea, useToast } from './ui';
import { arubaToday, cn } from '@/lib/format';
import { publicUrl } from '@/lib/media';
import { TIME_OFF, defaultVacationDays, overlapDays, timeOffDays } from '@/lib/schedule';
import { deleteTimeOff, saveTimeOff } from '@/lib/staff';
import type { Department, Employee, TimeOff, TimeOffKind } from '@/types';

export interface Balance { allowance: number; taken: number; planned: number; left: number; sickDays: number; sickTimes: number; noCertificate: number }

/** Vacation and sick days for one person in one calendar year. */
export function balance(e: Employee, all: TimeOff[], year: number, dept?: Department): Balance {
  const from = `${year}-01-01`, to = `${year}-12-31`, today = arubaToday();
  const mine = all.filter((t) => t.employee_id === e.id && t.starts_on <= to && t.ends_on >= from);
  let taken = 0, planned = 0, sickDays = 0, sickTimes = 0, noCertificate = 0;
  for (const t of mine) {
    if (t.kind === 'vacation') {
      const inYear = t.starts_on >= from && t.ends_on <= to;
      const days = inYear ? timeOffDays(t, dept?.days_off_per_week ?? null) : defaultVacationDays(t.starts_on > from ? t.starts_on : from, t.ends_on < to ? t.ends_on : to, dept?.days_off_per_week ?? null);
      if (t.starts_on <= today) taken += days; else planned += days;
    } else if (t.kind === 'sick') {
      sickDays += overlapDays(t, from, to);
      sickTimes++;
      if (!t.certificate) noCertificate++;
    }
  }
  const allowance = Number(e.vacation_days);
  return { allowance, taken, planned, left: allowance - taken - planned, sickDays, sickTimes, noCertificate };
}

/** A DJ's logo, or their name when there's none. `print` keeps dark logos dark. */
export function NameOrLogo({ e, className, print }: { e: Pick<Employee, 'name' | 'logo_path' | 'logo_invert'> | undefined; className?: string; print?: boolean }) {
  if (!e) return <span>—</span>;
  if (!e.logo_path) return <span className="truncate">{e.name}</span>;
  return <img src={publicUrl(e.logo_path)} alt={e.name} title={e.name} draggable={false} className={cn('h-6 w-auto max-w-full object-contain object-left', e.logo_invert && !print && 'invert', className)} />;
}

export const fmtDays = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function KindBadge({ kind }: { kind: TimeOffKind }) {
  const tone = kind === 'vacation' ? 'bg-teal/12 text-teal' : kind === 'sick' ? 'bg-bad/12 text-bad' : kind === 'request' ? 'bg-warn/12 text-warn' : 'bg-white/[0.07] text-white/70';
  return <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-semibold', tone)}>{TIME_OFF[kind].label}</span>;
}

/** Add or edit time off. */
export function TimeOffDialog({ open, onClose, onSaved, employees, departments, initial }: {
  open: boolean; onClose: () => void; onSaved: () => void; employees: Employee[]; departments: Department[]; initial?: Partial<TimeOff>;
}) {
  const toast = useToast();
  const today = arubaToday();
  const [form, setForm] = useState<Partial<TimeOff>>({});
  const [daysEdited, setDaysEdited] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ kind: 'vacation', starts_on: today, ends_on: today, certificate: false, ...initial });
    setDaysEdited(initial?.days != null);
  }, [open, initial, today]);

  const person = employees.find((e) => e.id === form.employee_id);
  const dept = departments.find((d) => d.id === person?.department_id);
  const auto = form.starts_on && form.ends_on && form.ends_on >= form.starts_on ? defaultVacationDays(form.starts_on, form.ends_on, dept?.days_off_per_week ?? null) : 0;
  const nights = form.starts_on && form.ends_on && form.ends_on >= form.starts_on ? overlapDays({ starts_on: form.starts_on, ends_on: form.ends_on }, form.starts_on, form.ends_on) : 0;
  const year = Number((form.starts_on ?? today).slice(0, 4));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.employee_id) return toast('Pick who it’s for', 'bad');
    if (!form.starts_on || !form.ends_on || form.ends_on < form.starts_on) return toast('The last day can’t be before the first', 'bad');
    setBusy(true);
    try {
      await saveTimeOff({
        ...(form.id ? { id: form.id } : {}),
        employee_id: form.employee_id,
        kind: form.kind,
        starts_on: form.starts_on,
        ends_on: form.ends_on,
        days: form.kind === 'vacation' && daysEdited ? Number(form.days) : null,
        certificate: form.kind === 'sick' ? !!form.certificate : false,
        note: form.note?.trim() || null,
      });
      toast(form.kind === 'request' ? 'Saved. The schedule will keep that day free.' : 'Saved. Their shifts on those days were cleared.');
      onSaved();
      onClose();
    } catch (err) {
      toast((err as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const set = (patch: Partial<TimeOff>) => setForm((f) => ({ ...f, ...patch }));
  const grouped = departments.map((d) => ({ d, people: employees.filter((e) => e.department_id === d.id && (e.active || e.id === form.employee_id)) })).filter((g) => g.people.length);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={form.id ? 'Edit time off' : 'Add time off'}
      footer={<>
        {form.id && <Button variant="ghost" className="mr-auto text-bad" onClick={async () => {
          try { await deleteTimeOff(form.id!); toast('Time off deleted'); onSaved(); onClose(); } catch (err) { toast((err as Error).message, 'bad'); }
        }}>Delete</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" type="submit" form="time-off-form" loading={busy}>Save</Button>
      </>}
    >
      <form id="time-off-form" onSubmit={submit} className="grid gap-4">
        <Field label="Who">
          {(id) => (
            <select id={id} className="field" value={form.employee_id ?? ''} onChange={(e) => set({ employee_id: e.target.value })} required>
              <option value="" disabled>Choose a person</option>
              {grouped.map(({ d, people }) => (
                <optgroup key={d.id} label={d.plural}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
              ))}
            </select>
          )}
        </Field>
        <Segmented<TimeOffKind>
          value={form.kind ?? 'vacation'}
          onChange={(kind) => set({ kind })}
          className="w-full"
          size="sm"
          options={(['vacation', 'sick', 'leave', 'request'] as const).map((k) => ({ value: k, label: TIME_OFF[k].label }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="First day">{(id) => <Input id={id} type="date" required value={form.starts_on ?? ''} onChange={(e) => set({ starts_on: e.target.value, ends_on: !form.ends_on || form.ends_on < e.target.value ? e.target.value : form.ends_on })} />}</Field>
          <Field label="Last day">{(id) => <Input id={id} type="date" required min={form.starts_on} value={form.ends_on ?? ''} onChange={(e) => set({ ends_on: e.target.value })} />}</Field>
        </div>
        {form.kind === 'vacation' && (
          <Field label="Vacation days used" hint={daysEdited ? <button type="button" className="underline" onClick={() => { setDaysEdited(false); set({ days: null }); }}>Use the default ({fmtDays(auto)})</button> : `${nights} ${nights === 1 ? 'night' : 'nights'}${dept?.days_off_per_week ? `, minus ${dept.days_off_per_week} days off per full week` : ''}. Change it if their contract counts differently.`}>
            {(id) => <Input id={id} type="number" min={0} step={0.5} value={daysEdited ? form.days ?? '' : auto} onChange={(e) => { setDaysEdited(true); set({ days: e.target.value === '' ? null : Number(e.target.value) }); }} className="w-32" />}
          </Field>
        )}
        {form.kind === 'sick' && <Switch checked={!!form.certificate} onChange={(certificate) => set({ certificate })} label="Doctor’s note received" description="Keep track of who still owes one." />}
        {form.kind === 'request' && <p className="rounded-xl bg-warn/10 px-3.5 py-3 text-[13px] text-warn">“Asked off” is a wish, not leave: Fill week gives them those days off, and you’re warned if they end up scheduled.</p>}
        <Field label="Note" hint={`Only admins see this. ${year !== Number(today.slice(0, 4)) ? `Counts toward ${year}.` : ''}`}>
          {(id) => <Textarea id={id} rows={2} className="min-h-16" maxLength={300} value={form.note ?? ''} onChange={(e) => set({ note: e.target.value })} />}
        </Field>
      </form>
    </Dialog>
  );
}

export function BalanceBar({ b }: { b: Balance }) {
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / Math.max(b.allowance, 0.01)) * 100))}%`;
  return (
    <div className="grid gap-1.5">
      <div className="flex h-2 overflow-hidden rounded-full bg-white/[0.07]">
        <span className="bg-teal" style={{ width: pct(b.taken) }} />
        <span className="bg-teal/40" style={{ width: pct(b.planned) }} />
      </div>
      <div className="flex justify-between font-mono text-[10.5px] text-white/50">
        <span>Vacation · <span className="text-teal">{fmtDays(b.taken)}</span> taken · <span className="text-teal/70">{fmtDays(b.planned)}</span> planned</span>
        <span className={b.left < 0 ? 'text-bad' : 'text-white/80'}>{fmtDays(b.left)} of {fmtDays(b.allowance)} left</span>
      </div>
    </div>
  );
}

export { Badge };
