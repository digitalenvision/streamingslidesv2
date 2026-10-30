// Reads and writes for team members, schedules, time off, rules and admin accounts.
// RLS lets only admins (signed in with 2FA) through; admin accounts go via the
// admin-users edge function.
import { supabase } from './supabase';
import { CACHE_SECONDS, GALLERY_BUCKET } from './media';
import { addDays, cellKey, type Assignment } from './schedule';
import type { AdminAccount, AuditEntry, Department, Employee, Post, Role, Shift, ShiftType, TimeOff, TimeOffKind, WeekNote } from '@/types';

const ok = <T>({ data, error }: { data: T | null; error: { message: string; code?: string } | null }): T => {
  if (error) throw new Error(friendly(error));
  return data as T;
};

function friendly(error: { message: string; code?: string }) {
  if (error.code === '23P01' || error.message.includes('time_off_no_overlap')) return 'They already have time off on one of those days.';
  if (error.code === '23505' && error.message.includes('shift_types')) return 'Another shift in this department uses that letter.';
  if (error.code === '23503' && error.message.includes('employees')) return 'People are still in this department. Move them first.';
  return error.message;
}

// --- rules ----------------------------------------------------------------------
export const listDepartments = async () => ok(await supabase.from('departments').select('*').order('position')) as Department[];
export const listShiftTypes = async () => ok(await supabase.from('shift_types').select('*').order('position')) as ShiftType[];

export const saveDepartment = async (d: Partial<Department> & { id: string }) =>
  ok(await supabase.from('departments').upsert(d).select().single()) as Department;
export const deleteDepartment = async (id: string) => ok(await supabase.from('departments').delete().eq('id', id));

export const saveShiftType = async (t: Partial<ShiftType>) =>
  ok(await supabase.from('shift_types').upsert(t).select().single()) as ShiftType;
export const updateShiftType = async (id: string, patch: Partial<ShiftType>) =>
  ok(await supabase.from('shift_types').update(patch).eq('id', id).select().single()) as ShiftType;

// --- people ---------------------------------------------------------------------
export const listEmployees = async () =>
  ok(await supabase.from('employees').select('*').order('position').order('name')) as Employee[];

export const saveEmployee = async (e: Partial<Employee>) =>
  ok(await supabase.from('employees').upsert(e).select().single()) as Employee;

// DJ logos: trimmed to their edges, at most 800×300, as WebP. A logo that's mostly dark
// (hardly any light parts, like a black wordmark) gets logo_invert so it shows white on the
// dark screens; it prints as it is.
export async function uploadLogo(employee: Employee, file: File) {
  const { blob, dark } = await prepareLogo(file);
  const path = `dj-logos/${employee.id}/${Date.now()}.webp`;
  const { error } = await supabase.storage.from(GALLERY_BUCKET).upload(path, blob, { cacheControl: CACHE_SECONDS, contentType: 'image/webp' });
  if (error) throw new Error(error.message);
  const saved = ok(await supabase.from('employees').update({ logo_path: path, logo_invert: dark }).eq('id', employee.id).select().single()) as Employee;
  if (employee.logo_path) await supabase.storage.from(GALLERY_BUCKET).remove([employee.logo_path]);
  return saved;
}

export async function removeLogo(employee: Employee) {
  const saved = ok(await supabase.from('employees').update({ logo_path: null, logo_invert: false }).eq('id', employee.id).select().single()) as Employee;
  if (employee.logo_path) await supabase.storage.from(GALLERY_BUCKET).remove([employee.logo_path]);
  return saved;
}

async function prepareLogo(file: File) {
  const img = await createImageBitmap(file);
  const src = document.createElement('canvas');
  src.width = img.width; src.height = img.height;
  const sc = src.getContext('2d')!;
  sc.drawImage(img, 0, 0);
  const { data } = sc.getImageData(0, 0, img.width, img.height);
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1, light = 0, opaque = 0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const i = (y * img.width + x) * 4, a = data[i + 3];
    if (a < 16) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    opaque++;
    if ((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255 > 0.45) light++;
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = img.width - 1; y1 = img.height - 1; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const scale = Math.min(1, 800 / w, 300 / h);
  const out = document.createElement('canvas');
  out.width = Math.round(w * scale); out.height = Math.round(h * scale);
  const oc = out.getContext('2d')!;
  oc.imageSmoothingQuality = 'high';
  oc.drawImage(src, x0, y0, w, h, 0, 0, out.width, out.height);
  const blob = await new Promise<Blob>((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that image'))), 'image/webp', 0.9));
  return { blob, dark: opaque > 0 && light / opaque < 0.05 };
}

export const updateEmployee = async (id: string, patch: Partial<Employee>) =>
  ok(await supabase.from('employees').update(patch).eq('id', id).select().single()) as Employee;

export const deleteEmployee = async (id: string) => ok(await supabase.from('employees').delete().eq('id', id));

// --- shifts ---------------------------------------------------------------------
export const listShifts = async (from: string, to: string) =>
  ok(await supabase.from('shifts').select('*').gte('date', from).lte('date', to).limit(5000)) as Shift[];

export async function setShifts(rows: Assignment[]) {
  if (!rows.length) return [] as Shift[];
  return ok(await supabase.from('shifts').upsert(rows.map((r) => ({ ...r, note: null })), { onConflict: 'employee_id,date' }).select()) as Shift[];
}

export const updateShift = async (id: string, patch: Partial<Shift>) =>
  ok(await supabase.from('shifts').update(patch).eq('id', id).select().single()) as Shift;

/** Blocks teams (security): a shift with its own end (null = closing) and tag (VIP). */
export async function setBlockShifts(rows: { employee_id: string; date: string; start_time: string; end_time: string | null; note: string | null }[]) {
  if (!rows.length) return [] as Shift[];
  return ok(await supabase.from('shifts').upsert(rows.map((r) => ({ ...r, kind: 'work', shift_type_id: null })), { onConflict: 'employee_id,date' }).select()) as Shift[];
}

// --- who opens the club each night -----------------------------------------------
export const listOpeners = async (from: string, to: string) =>
  ok(await supabase.from('night_openers').select('date,employee_id').gte('date', from).lte('date', to)) as { date: string; employee_id: string }[];
export async function setOpener(date: string, employeeId: string | null) {
  if (employeeId) ok(await supabase.from('night_openers').upsert({ date, employee_id: employeeId }));
  else ok(await supabase.from('night_openers').delete().eq('date', date));
}

// --- posts (who stands where) ---------------------------------------------------
export const listPosts = async (from: string, to: string) =>
  ok(await supabase.from('posts').select('*').gte('date', from).lte('date', to).order('date').order('start_time')) as Post[];
export const savePost = async (p: Partial<Post>) => ok(await supabase.from('posts').upsert(p).select().single()) as Post;
export const savePosts = async (ps: Partial<Post>[]) => (ps.length ? ok(await supabase.from('posts').insert(ps).select()) as Post[] : []);
export const deletePosts = async (ids: string[]) => { if (ids.length) ok(await supabase.from('posts').delete().in('id', ids)); };

export async function clearShifts(cells: { employee_id: string; date: string }[]) {
  const byPerson = new Map<string, string[]>();
  for (const c of cells) byPerson.set(c.employee_id, [...(byPerson.get(c.employee_id) ?? []), c.date]);
  await Promise.all([...byPerson].map(async ([id, dates]) => ok(await supabase.from('shifts').delete().eq('employee_id', id).in('date', dates))));
}

export const shiftMap = (shifts: Shift[]) => new Map(shifts.map((s) => [cellKey(s.employee_id, s.date), s]));

// --- week notes -----------------------------------------------------------------
export const listWeekNotes = async (weekStart: string) =>
  ok(await supabase.from('schedule_weeks').select('*').eq('week_start', weekStart)) as WeekNote[];
export const saveWeekNote = async (n: WeekNote) =>
  ok(await supabase.from('schedule_weeks').upsert({ ...n, updated_at: new Date().toISOString() }));

export const listNightNotes = async (from: string, to: string) =>
  ok(await supabase.from('schedule_days').select('date, note').gte('date', from).lte('date', to)) as { date: string; note: string }[];
export async function saveNightNote(date: string, note: string) {
  const text = note.trim();
  if (!text) return ok(await supabase.from('schedule_days').delete().eq('date', date));
  return ok(await supabase.from('schedule_days').upsert({ date, note: text, updated_at: new Date().toISOString() }));
}

// --- time off -------------------------------------------------------------------
export const listTimeOff = async (from: string, to: string) =>
  ok(await supabase.from('time_off').select('*').lte('starts_on', to).gte('ends_on', from).order('starts_on')) as TimeOff[];

export const saveTimeOff = async (t: Partial<TimeOff>) =>
  ok(await supabase.from('time_off').upsert(t).select().single()) as TimeOff;

export const deleteTimeOff = async (id: string) => ok(await supabase.from('time_off').delete().eq('id', id));

/**
 * Marks one night as time off (or clears it) from the schedule grid, keeping ranges whole:
 * the night joins a range of the same kind right next to it, and clearing a night in the
 * middle of a range splits it in two.
 */
export async function setTimeOffDay(all: TimeOff[], employeeId: string, date: string, kind: TimeOffKind | null) {
  const mine = all.filter((t) => t.employee_id === employeeId);
  const covering = mine.find((t) => t.starts_on <= date && t.ends_on >= date);
  if (covering?.kind === kind) return;

  if (covering) {
    await deleteTimeOff(covering.id);
    const { id: _id, created_at: _c, ...rest } = covering;
    const parts = [
      covering.starts_on < date && { ...rest, ends_on: addDays(date, -1), days: null },
      covering.ends_on > date && { ...rest, starts_on: addDays(date, 1), days: null },
    ].filter(Boolean) as Partial<TimeOff>[];
    for (const p of parts) await saveTimeOff(p);
  }
  if (!kind) return;

  const before = mine.find((t) => t.kind === kind && t.ends_on === addDays(date, -1) && t.id !== covering?.id);
  const after = mine.find((t) => t.kind === kind && t.starts_on === addDays(date, 1) && t.id !== covering?.id);
  if (before && after) {
    await deleteTimeOff(after.id);
    await saveTimeOff({ id: before.id, employee_id: employeeId, kind, starts_on: before.starts_on, ends_on: after.ends_on, days: null });
  } else if (before) {
    await saveTimeOff({ id: before.id, employee_id: employeeId, kind, starts_on: before.starts_on, ends_on: date, days: null });
  } else if (after) {
    await saveTimeOff({ id: after.id, employee_id: employeeId, kind, starts_on: date, ends_on: after.ends_on, days: null });
  } else {
    await saveTimeOff({ employee_id: employeeId, kind, starts_on: date, ends_on: date });
  }
}

// --- admin accounts -------------------------------------------------------------
async function adminUsers<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  return data as T;
}

export type AccessInput = { role: Role; media: boolean; rules: boolean; accounting: boolean; teams: string[] | null };
export const listAccounts = () => adminUsers<AdminAccount[]>({ action: 'list' });
export const inviteAccount = (email: string, name: string, access: AccessInput) => adminUsers({ action: 'invite', email, name, ...access });
export const updateAccount = (user_id: string, patch: Partial<AccessInput> & { name?: string }) => adminUsers({ action: 'update', user_id, ...patch });
/** Names of everyone with an account (any signed-in admin may read these). */
export const listAdminNames = async () =>
  ok(await supabase.from('admin_users').select('user_id,name,email,role,teams')) as { user_id: string; name: string | null; email: string | null; role: Role; teams: string[] | null }[];
export const removeAccount = (user_id: string) => adminUsers({ action: 'remove', user_id });
export const resetAccount2fa = (user_id: string) => adminUsers({ action: 'reset_mfa', user_id });

/** The activity log, newest first; `before` pages back, filters narrow it down. */
export async function listActivity({ limit = 200, before, actor, tables, from, to }: { limit?: number; before?: string; actor?: string; tables?: string[]; from?: string; to?: string } = {}) {
  let q = supabase.from('audit_log').select('*').order('at', { ascending: false }).order('id', { ascending: false }).limit(limit);
  if (before) q = q.lt('at', before);
  if (actor) q = q.eq('actor', actor);
  if (tables?.length) q = q.in('table_name', tables);
  if (from) q = q.gte('at', from);
  if (to) q = q.lt('at', to);
  return ok(await q) as AuditEntry[];
}
