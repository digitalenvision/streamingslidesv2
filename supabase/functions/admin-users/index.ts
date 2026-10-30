// Admin accounts for Gusto Command. Owners only, signed in with 2FA.
//
//   list                      everyone with access, with sign-in and 2FA status
//   invite   {email, name, role, media?, rules?, accounting?, teams?}   sends an invitation email (sets a password, then 2FA)
//   update   {user_id, name?, role?, media?, rules?, accounting?, teams?}
//
// Managers: media and rules are on/off; teams is null (every team) or the team ids they run.
//   remove   {user_id}        deletes the login entirely
//   reset_mfa {user_id}       removes their authenticator so they can set up a new phone
//
// Sign-ups are off for the project, so this is the only way an account comes to exist.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const url = Deno.env.get('SUPABASE_URL')!;
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const configured = (Deno.env.get('ADMIN_ORIGINS') ?? 'https://command.gustoaruba.com').split(',').map((s) => s.trim());
// Against a local Supabase (`supabase start`), the dev server may be on any local port.
const isLocal = /^http:\/\/(kong|127\.0\.0\.1|localhost)[:/]/.test(url);
const allowed = (origin: string) =>
  configured.includes(origin) || (isLocal && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin));
const roles = ['owner', 'manager'] as const;

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  const cors = {
    'Access-Control-Allow-Origin': allowed(origin) ? origin : configured[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST only');
    if (origin && !allowed(origin)) throw new HttpError(403, 'Origin not allowed');
    const caller = await ownerFrom(req);
    const body = await req.json().catch(() => ({}));

    switch (body.action) {
      case 'list':
        return reply(await list());
      case 'invite': {
        const email = String(body.email ?? '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'That email doesn’t look right.');
        const role = checkRole(body.role);
        const name = cleanName(body.name);
        const redirectTo = `${allowed(origin) ? origin : configured[0]}/welcome`;
        const { data, error } = await service.auth.admin.inviteUserByEmail(email, { redirectTo, data: { name } });
        if (error) throw new HttpError(400, error.message.includes('already') ? 'That email already has an account.' : error.message);
        const access = await checkAccess(body);
        const { error: insertError } = await service.from('admin_users').insert({ user_id: data.user.id, email, role, name, ...access });
        if (insertError) throw new HttpError(400, insertError.message);
        await audit(caller, 'insert', data.user.id, { email, role, name, ...access, invited: true });
        return reply({ ok: true });
      }
      case 'update': {
        const userId = String(body.user_id ?? '');
        const patch: Record<string, unknown> = {};
        if (body.role !== undefined) patch.role = checkRole(body.role);
        if (body.name !== undefined) patch.name = cleanName(body.name);
        Object.assign(patch, await checkAccess(body));
        if (patch.role === 'manager') await keepAnOwner(userId);
        const { error } = await service.from('admin_users').update(patch).eq('user_id', userId);
        if (error) throw new HttpError(400, error.message);
        await audit(caller, 'update', userId, patch);
        return reply({ ok: true });
      }
      case 'remove': {
        const userId = String(body.user_id ?? '');
        if (userId === caller.id) throw new HttpError(400, 'You can’t remove your own account.');
        await keepAnOwner(userId);
        const { error } = await service.auth.admin.deleteUser(userId);
        if (error) throw new HttpError(400, error.message);
        await audit(caller, 'delete', userId, {});
        return reply({ ok: true });
      }
      case 'reset_mfa': {
        const userId = String(body.user_id ?? '');
        const { data, error } = await service.auth.admin.mfa.listFactors({ userId });
        if (error) throw new HttpError(400, error.message);
        for (const factor of data.factors) await service.auth.admin.mfa.deleteFactor({ userId, id: factor.id });
        // Sign them out everywhere: the next sign-in asks them to set up an authenticator again.
        await service.auth.admin.signOut(userId, 'global').catch(() => {});
        await audit(caller, 'update', userId, { mfa_reset: true });
        return reply({ ok: true });
      }
      default:
        throw new HttpError(400, 'Unknown action');
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    return reply({ error: status === 500 ? 'Something went wrong' : (e as Error).message }, status);
  }
});

/** The caller, if they're an owner signed in with their authenticator app. */
async function ownerFrom(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in first');
  const { data, error } = await service.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw new HttpError(401, 'Sign in first');
  if (data.claims.aal !== 'aal2') throw new HttpError(403, 'Confirm with your authenticator app first');
  const { data: row } = await service.from('admin_users').select('role').eq('user_id', data.claims.sub).maybeSingle();
  if (row?.role !== 'owner') throw new HttpError(403, 'Only owners can manage accounts');
  return { id: data.claims.sub as string, email: (data.claims.email as string) ?? null };
}

async function list() {
  const [{ data: admins, error }, { data: users, error: usersError }] = await Promise.all([
    service.from('admin_users').select('*').order('created_at'),
    service.auth.admin.listUsers({ perPage: 200 }),
  ]);
  if (error || usersError) throw new HttpError(500, (error ?? usersError)!.message);
  const byId = new Map(users.users.map((u) => [u.id, u]));
  return await Promise.all((admins ?? []).map(async (a) => {
    const u = byId.get(a.user_id);
    const { data: f } = await service.auth.admin.mfa.listFactors({ userId: a.user_id });
    return {
      ...a,
      email: u?.email ?? a.email,
      last_sign_in_at: u?.last_sign_in_at ?? null,
      invited: !!u?.invited_at && !u?.last_sign_in_at,
      mfa: (f?.factors ?? []).some((x) => x.status === 'verified'),
    };
  }));
}

function checkRole(role: unknown) {
  if (!roles.includes(role as (typeof roles)[number])) throw new HttpError(400, 'Role must be owner or manager');
  return role as string;
}

/** media/rules (booleans) and teams (null = every team, or a list of team ids), when given. */
async function checkAccess(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (body.media !== undefined) out.media = body.media === true;
  if (body.rules !== undefined) out.rules = body.rules === true;
  if (body.accounting !== undefined) out.accounting = body.accounting === true;
  if (body.teams !== undefined) {
    if (body.teams === null) out.teams = null;
    else {
      if (!Array.isArray(body.teams)) throw new HttpError(400, 'Teams must be a list');
      const { data } = await service.from('departments').select('id');
      const known = new Set((data ?? []).map((d) => d.id));
      const teams = [...new Set(body.teams.map(String))];
      if (teams.some((t) => !known.has(t))) throw new HttpError(400, 'Unknown team');
      out.teams = teams;
    }
  }
  return out;
}

const cleanName = (name: unknown) => (typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : null);

async function keepAnOwner(userId: string) {
  const { data } = await service.from('admin_users').select('user_id').eq('role', 'owner');
  const owners = (data ?? []).map((r) => r.user_id);
  if (owners.length === 1 && owners[0] === userId) throw new HttpError(400, 'There has to be at least one owner.');
}

// Rows written with the service key have no auth.uid(), so record the owner who did it.
async function audit(caller: { id: string; email: string | null }, action: string, recordId: string, record: unknown) {
  await service.from('audit_log').insert({
    actor: caller.id, actor_email: caller.email, table_name: 'admin_accounts', action, record_id: recordId, record,
  });
}
