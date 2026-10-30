// Schedule logic: weeks, what each cell shows, checking a week against the department's
// rules, and filling a week automatically.
//
// Rules (set per department in Settings → Schedule rules):
//   days_off_per_week          every person gets this many days off
//   shift_types.weekly_target  nights per person per week on that shift (bar: 3 early, 2 late)
//   shift_types.daily_minimum  people needed on that shift each night (bar early: 3, Fri/Sat 4)
// Vacation, sick days and other leave take the place of working nights, so someone away
// for 3 nights still gets their 2 days off and works the 2 nights left.
import type { Department, Employee, Shift, ShiftType, TimeOff, TimeOffKind } from '@/types';

// --- dates ----------------------------------------------------------------------
const toDate = (d: string) => new Date(`${d}T12:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (d: string, n: number) => {
  const x = toDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return toIso(x);
};
/** 0 = Monday … 6 = Sunday */
export const weekday = (d: string) => (toDate(d).getUTCDay() + 6) % 7;
export const weekStart = (d: string) => addDays(d, -weekday(d));
/** The next birthday on or after `from`: its date, how old they turn and how many days away. */
export function nextBirthday(birthday: string, from: string) {
  const on = (y: number) => {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return birthday.endsWith('02-29') && !leap ? `${y}-02-28` : `${y}${birthday.slice(4)}`; // Feb 29 in a short year
  };
  let year = Number(from.slice(0, 4));
  if (on(year) < from) year++;
  const date = on(year);
  return { date, age: year - Number(birthday.slice(0, 4)), days: Math.round((toDate(date).getTime() - toDate(from).getTime()) / 86_400_000) };
}
/** Is this the person's birthday? */
export const isBirthday = (birthday: string | null, date: string) => !!birthday && nextBirthday(birthday, date).date === date;

export const weekDates = (start: string) => Array.from({ length: 7 }, (_, i) => addDays(start, i));
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);

export function isoWeek(d: string) {
  const x = toDate(d);
  x.setUTCDate(x.getUTCDate() + 3 - ((x.getUTCDay() + 6) % 7));
  const firstThursday = new Date(Date.UTC(x.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((x.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const formatRange = (start: string, end: string) => {
  const a = toDate(start), b = toDate(end);
  const month = (x: Date) => x.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  if (start === end) return `${month(a)} ${a.getUTCDate()}`;
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${month(a)} ${a.getUTCDate()} – ${b.getUTCDate()}`
    : `${month(a)} ${a.getUTCDate()} – ${month(b)} ${b.getUTCDate()}`;
};

export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');

/** A time as the club says it: "5:30 PM". Everything shown on screen and on paper uses this. */
export const fmtTime = (t: string | null | undefined) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

// --- time off -------------------------------------------------------------------
export const TIME_OFF: Record<TimeOffKind, { label: string; short: string; tone: string }> = {
  vacation: { label: 'Vacation', short: 'VAC', tone: 'teal' },
  sick: { label: 'Sick', short: 'SICK', tone: 'red' },
  leave: { label: 'Other leave', short: 'LEAVE', tone: 'slate' },
  request: { label: 'Asked off', short: 'ASK', tone: 'amber' },
};

/** Vacation days a range uses by default: every night, minus the usual days off for each full week. */
export function defaultVacationDays(start: string, end: string, daysOffPerWeek: number | null) {
  const nights = daysBetween(start, end) + 1;
  return nights - Math.floor(nights / 7) * (daysOffPerWeek ?? 0);
}

export const timeOffDays = (t: TimeOff, daysOffPerWeek: number | null) =>
  t.days ?? defaultVacationDays(t.starts_on, t.ends_on, daysOffPerWeek);

/** Days of a range that fall within [from, to]. */
export const overlapDays = (t: Pick<TimeOff, 'starts_on' | 'ends_on'>, from: string, to: string) => {
  const s = t.starts_on > from ? t.starts_on : from;
  const e = t.ends_on < to ? t.ends_on : to;
  return s > e ? 0 : daysBetween(s, e) + 1;
};

/** Something done to one person's night. */
export type CellAction =
  | { kind: 'type'; type: ShiftType }
  | { kind: 'custom'; time: string }
  | { kind: 'off' }
  | { kind: 'away'; away: TimeOffKind }
  | { kind: 'clear' };

/**
 * What was typed into a schedule cell, Excel style: "5:30", "530", "7:45pm", "5", "off",
 * or a letter (the shift's letter, O off, V vacation, S sick, A asked off). Times without
 * AM/PM are read as the club reads them: 1–11 is PM. A time that matches a shift's start
 * becomes that shift. Returns null when it can't be read.
 */
export function parseCellInput(raw: string, types: ShiftType[]): CellAction | null {
  const v = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!v) return { kind: 'clear' };
  if (['off', 'o', 'x', 'free', 'vrij'].includes(v)) return { kind: 'off' };
  if (['v', 'vac', 'vacation', 'vakantie'].includes(v)) return { kind: 'away', away: 'vacation' };
  if (['s', 'sick', 'ziek'].includes(v)) return { kind: 'away', away: 'sick' };
  if (['a', 'ask', 'asked', 'asked off'].includes(v)) return { kind: 'away', away: 'request' };
  const byCode = types.find((t) => t.code.toLowerCase() === v || t.name.toLowerCase() === v);
  if (byCode) return { kind: 'type', type: byCode };
  const m = v.match(/^(\d{1,2})(?:[:.h]?(\d{2}))?\s*(a|am|p|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  if (m[3]?.startsWith('a')) h = h === 12 ? 0 : h;
  else if (m[3]?.startsWith('p') || (h >= 1 && h <= 11)) h = h === 12 ? 12 : h < 12 ? h + 12 : h;
  const time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  const type = types.find((t) => t.start_time.slice(0, 5) === time);
  return type ? { kind: 'type', type } : { kind: 'custom', time };
}

/** How a cell reads in the sheet and on paper. */
export function cellText(c: Cell) {
  if (c.type === 'work') return fmtTime(c.shift.start_time);
  if (c.type === 'off') return 'off';
  if (c.type === 'away') return TIME_OFF[c.timeOff.kind].label;
  return '';
}

// --- cells ----------------------------------------------------------------------
export type Cell =
  | { type: 'empty' }
  | { type: 'work'; shift: Shift; shiftType: ShiftType | undefined }
  | { type: 'off'; shift: Shift }
  | { type: 'away'; timeOff: TimeOff };

export const cellKey = (employeeId: string, date: string) => `${employeeId}|${date}`;

export interface WeekData {
  dates: string[];
  employees: Employee[];
  shiftTypes: ShiftType[]; // this department's, not archived
  shifts: Map<string, Shift>;
  timeOff: TimeOff[];
}

export function cellAt(week: Pick<WeekData, 'shifts' | 'timeOff' | 'shiftTypes'>, employeeId: string, date: string): Cell {
  const away = week.timeOff.find((t) => t.employee_id === employeeId && t.kind !== 'request' && t.starts_on <= date && t.ends_on >= date);
  if (away) return { type: 'away', timeOff: away };
  const shift = week.shifts.get(cellKey(employeeId, date));
  if (!shift) return { type: 'empty' };
  if (shift.kind === 'off') return { type: 'off', shift };
  return { type: 'work', shift, shiftType: week.shiftTypes.find((t) => t.id === shift.shift_type_id) };
}

export const askedOff = (timeOff: TimeOff[], employeeId: string, date: string) =>
  timeOff.find((t) => t.employee_id === employeeId && t.kind === 'request' && t.starts_on <= date && t.ends_on >= date);

// --- targets --------------------------------------------------------------------
export const hasRules = (dept: Department, types: ShiftType[]) =>
  dept.days_off_per_week != null || types.some((t) => t.weekly_target != null || t.daily_minimum != null);

/**
 * What one person should get this week: days off and nights per shift type, given the
 * nights they're away. If they work fewer nights than the targets add up to, shifts with
 * a nightly minimum keep theirs first.
 */
export function personTargets(dept: Department, types: ShiftType[], awayNights: number) {
  const available = 7 - awayNights;
  const off = dept.days_off_per_week == null ? null : Math.min(dept.days_off_per_week, available);
  const work = off == null ? null : available - off;
  const targets = new Map<string, number>();
  const withTarget = types.filter((t) => t.weekly_target != null);
  let left = work ?? Infinity;
  for (const t of [...withTarget].sort((a, b) => Number(!!b.daily_minimum) - Number(!!a.daily_minimum) || a.position - b.position)) {
    const n = Math.min(t.weekly_target!, left);
    targets.set(t.id, n);
    left -= n;
  }
  return { off, work, targets };
}

// --- checking a week ------------------------------------------------------------
export interface PersonCheck {
  off: number;
  away: number;
  empty: number;
  byType: Map<string, number>;
  targets: ReturnType<typeof personTargets>;
  problems: string[];
}

export interface DayCheck {
  working: number;
  empty: number; // people not planned yet that night
  byType: Map<string, number>;
  short: { type: ShiftType; have: number; need: number }[];
}

export function checkWeek(dept: Department, week: WeekData) {
  const people = new Map<string, PersonCheck>();
  const days = week.dates.map<DayCheck>(() => ({ working: 0, empty: 0, byType: new Map(), short: [] }));

  for (const e of week.employees) {
    const p: PersonCheck = { off: 0, away: 0, empty: 0, byType: new Map(), targets: personTargets(dept, week.shiftTypes, 0), problems: [] };
    let flex = 0;
    week.dates.forEach((date, i) => {
      const c = cellAt(week, e.id, date);
      if (c.type === 'away') p.away++;
      else if (c.type === 'off') p.off++;
      else if (c.type === 'empty') { p.empty++; if (e.counted) days[i].empty++; }
      else {
        const id = c.shift.shift_type_id ?? 'custom';
        // A shift moved to a special time for the night (Halloween: everyone at 5:00) still
        // counts for that night's staffing, but toward the person's mix it counts as
        // whichever shift they're short of.
        if (c.shiftType && c.shift.start_time !== c.shiftType.start_time) flex++;
        else p.byType.set(id, (p.byType.get(id) ?? 0) + 1);
        if (e.counted) {
          days[i].working++;
          days[i].byType.set(id, (days[i].byType.get(id) ?? 0) + 1);
        }
        if (askedOff(week.timeOff, e.id, date)) p.problems.push(`works ${DAY_LONG[i]}, which they asked off`);
      }
    });
    p.targets = personTargets(dept, week.shiftTypes, p.away);
    for (const t of week.shiftTypes) {
      const want = p.targets.targets.get(t.id);
      if (want == null || !flex) continue;
      const add = Math.min(flex, Math.max(0, want - (p.byType.get(t.id) ?? 0)));
      if (add) { p.byType.set(t.id, (p.byType.get(t.id) ?? 0) + add); flex -= add; }
    }
    // Any left over (nothing was short) go to the first shift, so counts still add up.
    if (flex && week.shiftTypes[0]) p.byType.set(week.shiftTypes[0].id, (p.byType.get(week.shiftTypes[0].id) ?? 0) + flex);
    // Not counted (hookah staff on the bar sheet): no days-off or shift-mix rules either.
    if (p.empty === 0 && e.counted) {
      if (p.targets.off != null && p.off !== p.targets.off) {
        p.problems.push(`has ${p.off} ${p.off === 1 ? 'day' : 'days'} off instead of ${p.targets.off}`);
      }
      for (const t of week.shiftTypes) {
        const want = p.targets.targets.get(t.id);
        const have = p.byType.get(t.id) ?? 0;
        if (want != null && have !== want) p.problems.push(`has ${have} ${t.name} instead of ${want}`);
      }
    }
    people.set(e.id, p);
  }

  week.dates.forEach((date, i) => {
    for (const t of week.shiftTypes) {
      const need = t.daily_minimum?.[weekday(date)];
      const have = days[i].byType.get(t.id) ?? 0;
      // Only once the night is fully planned: before that it's just unfinished.
      if (need && have < need && days[i].empty === 0) days[i].short.push({ type: t, have, need });
    }
  });

  const empty = [...people.values()].reduce((n, p) => n + p.empty, 0);
  const problems = [...people.values()].reduce((n, p) => n + p.problems.length, 0) + days.reduce((n, d) => n + d.short.length, 0);
  return { people, days, empty, problems };
}

// --- filling a week -------------------------------------------------------------
export interface Assignment {
  employee_id: string;
  date: string;
  kind: 'work' | 'off';
  shift_type_id: string | null;
  start_time: string | null;
}

type Label = 'off' | string; // shift type id

/**
 * Fills a week so everyone gets their days off and shift mix, every night has its minimum,
 * asked-off days are respected, and days off land next to each other where possible.
 * `keep` = leave cells that already have something; otherwise everything but time off is redone.
 * Randomised local search: plenty for a team of a few dozen.
 */
export function fillWeek(dept: Department, week: WeekData, keep: boolean): Assignment[] {
  const types = week.shiftTypes;
  const fallback = types.find((t) => t.daily_minimum) ?? types[0];
  if (!fallback) return [];

  interface Row { employee: Employee; free: number[]; fixed: (Label | null)[]; labels: Label[]; asked: Set<number> }
  // People outside the team's numbers are planned by hand.
  const rows: Row[] = week.employees.filter((e) => e.counted).map((employee) => {
    const fixed: (Label | null)[] = [];
    const free: number[] = [];
    let away = 0;
    const asked = new Set<number>();
    week.dates.forEach((date, i) => {
      const c = cellAt(week, employee.id, date);
      if (askedOff(week.timeOff, employee.id, date)) asked.add(i);
      if (c.type === 'away') { away++; fixed.push(null); return; }
      if (keep && c.type === 'off') { fixed.push('off'); return; }
      if (keep && c.type === 'work') { fixed.push(c.shift.shift_type_id ?? 'custom'); return; }
      fixed.push(null);
      free.push(i);
    });
    const t = personTargets(dept, types, away);
    const already = (l: Label) => fixed.filter((f) => f === l).length;
    const labels: Label[] = [];
    for (let n = Math.max(0, (t.off ?? 0) - already('off')); n > 0; n--) labels.push('off');
    for (const [id, want] of t.targets) for (let n = Math.max(0, want - already(id)); n > 0; n--) labels.push(id);
    const own = types.find((x) => x.id === employee.default_shift_type_id) ?? fallback;
    while (labels.length < free.length) labels.push(own.id);
    labels.length = free.length; // over target because of kept cells: drop the extras
    return { employee, free, fixed, labels, asked };
  });

  const grid = (rs: Row[]) => rs.map((r) => {
    const g = [...r.fixed];
    r.free.forEach((d, k) => { g[d] = r.labels[k]; });
    return g;
  });

  const score = (g: (Label | null)[][]) => {
    let s = 0;
    for (let d = 0; d < 7; d++) {
      const count = new Map<Label, number>();
      for (const row of g) if (row[d]) count.set(row[d]!, (count.get(row[d]!) ?? 0) + 1);
      for (const t of types) {
        const need = t.daily_minimum?.[weekday(week.dates[d])] ?? 0;
        const gap = Math.max(0, need - (count.get(t.id) ?? 0));
        s += gap * gap * 100;
        // Spread the rest evenly so no night is thin.
        s += ((count.get(t.id) ?? 0) - need) ** 2 * 0.5;
      }
    }
    // Someone with keys starts early every night (Peter or Jordan opens).
    if (rows.some((r) => r.employee.can_open)) {
      for (let d = 0; d < 7; d++) if (!g.some((row, i) => rows[i].employee.can_open && row[d] === fallback.id)) s += 200;
    }
    g.forEach((row, i) => {
      for (const d of rows[i].asked) if (row[d] && row[d] !== 'off') s += 60;
      for (let d = 1; d < 7; d++) if (row[d] === 'off' && row[d - 1] === 'off') s -= 4; // days off together
    });
    return s;
  };

  let best: Row[] = rows;
  let bestScore = Infinity;
  for (let restart = 0; restart < 12; restart++) {
    const rs = rows.map((r) => {
      // Asked-off days get the days off first, the rest is shuffled in.
      const pool = [...r.labels];
      const labels: (Label | undefined)[] = r.free.map((d) => {
        const j = r.asked.has(d) ? pool.indexOf('off') : -1;
        return j >= 0 ? pool.splice(j, 1)[0] : undefined;
      });
      shuffle(pool);
      return { ...r, labels: labels.map((l) => l ?? pool.pop()!) };
    });
    let current = score(grid(rs));
    for (let it = 0; it < 3000; it++) {
      const r = rs[Math.floor(Math.random() * rs.length)];
      if (!r || r.labels.length < 2) continue;
      const a = Math.floor(Math.random() * r.labels.length);
      const b = Math.floor(Math.random() * r.labels.length);
      if (r.labels[a] === r.labels[b]) continue;
      [r.labels[a], r.labels[b]] = [r.labels[b], r.labels[a]];
      const next = score(grid(rs));
      if (next <= current) current = next;
      else [r.labels[a], r.labels[b]] = [r.labels[b], r.labels[a]];
    }
    if (current < bestScore) { bestScore = current; best = rs.map((r) => ({ ...r, labels: [...r.labels] })); }
  }

  return best.flatMap((r) => r.free.map((d, k) => {
    const label = r.labels[k];
    const type = types.find((t) => t.id === label);
    return label === 'off' || !type
      ? { employee_id: r.employee.id, date: week.dates[d], kind: 'off' as const, shift_type_id: null, start_time: null }
      : { employee_id: r.employee.id, date: week.dates[d], kind: 'work' as const, shift_type_id: type.id, start_time: type.start_time };
  }));
}

function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- colours for shift types ------------------------------------------------------
export const SHIFT_COLORS: Record<string, { chip: string; print: string; dot: string }> = {
  gold: { chip: 'bg-gold/15 text-gold ring-gold/30', print: '#e4b11a', dot: 'bg-gold' },
  violet: { chip: 'bg-[#a78bfa]/15 text-[#c4b5fd] ring-[#a78bfa]/30', print: '#8b5cf6', dot: 'bg-[#a78bfa]' },
  sky: { chip: 'bg-[#38bdf8]/15 text-[#7dd3fc] ring-[#38bdf8]/30', print: '#0ea5e9', dot: 'bg-[#38bdf8]' },
  rose: { chip: 'bg-[#fb7185]/15 text-[#fda4af] ring-[#fb7185]/30', print: '#f43f5e', dot: 'bg-[#fb7185]' },
  lime: { chip: 'bg-[#a3e635]/15 text-[#bef264] ring-[#a3e635]/30', print: '#65a30d', dot: 'bg-[#a3e635]' },
};
export const shiftColor = (c: string | undefined) => SHIFT_COLORS[c ?? 'gold'] ?? SHIFT_COLORS.gold;

/** Letters the grid keeps for itself (can't be used as shift codes). */
export const RESERVED_KEYS: Record<string, 'off' | TimeOffKind> = { O: 'off', V: 'vacation', S: 'sick', A: 'request' };
