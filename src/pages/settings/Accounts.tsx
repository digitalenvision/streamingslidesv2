// Owners only: who can sign in to Command and what each account may do.
//   Owner          everything, plus accounts and the activity log
//   Manager        media, schedule rules and every team, each switchable
//   Team manager   a manager limited to chosen teams (e.g. Glenn: security only, no media)
// Everyone can use tasks. The database enforces all of it.
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, History, KeyRound, MailPlus, Pencil, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { PageHeader, Avatar } from '@/components/AppShell';
import { Badge, Button, Dialog, Field, IconButton, Input, Spinner, Switch, useConfirm, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { cn, relativeTime } from '@/lib/format';
import { inviteAccount, listAccounts, listDepartments, removeAccount, resetAccount2fa, updateAccount, type AccessInput } from '@/lib/staff';
import { useLoad } from '@/lib/useLoad';
import type { AdminAccount, Department } from '@/types';

/** "Everything", "Media · Rules · All teams", "Security only"… */
export function accessSummary(a: Pick<AdminAccount, 'role' | 'media' | 'rules' | 'accounting' | 'teams'>, departments: Department[]) {
  if (a.role === 'owner') return 'Everything, including accounts and the activity log';
  const team = (id: string) => departments.find((d) => d.id === id)?.plural ?? id;
  const parts = [
    a.teams === null ? 'Every team' : a.teams.length ? `${a.teams.map(team).join(', ')} only` : 'No teams',
    a.media && 'Media',
    a.rules && a.teams?.length !== 0 && 'Schedule rules',
    a.accounting && 'Accounting',
    'Tasks',
  ].filter(Boolean);
  return parts.join(' · ');
}

export function Accounts() {
  const { session } = useAuth();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const accounts = useLoad(listAccounts);
  const departments = useLoad(listDepartments);
  const [editing, setEditing] = useState<AdminAccount | 'new' | null>(null);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try { await fn(); toast(done); accounts.reload(); } catch (e) { toast((e as Error).message, 'bad'); }
  };

  return (
    <>
      <PageHeader
        kicker="Admin · owners only"
        title="Accounts"
        subtitle="Who can sign in to Command and what they can do. Everyone signs in with a password and an authenticator app."
        actions={<>
          <Link to="/settings/activity"><Button icon={<History className="size-4" />}>Activity log</Button></Link>
          <Button variant="primary" icon={<MailPlus className="size-4" />} onClick={() => setEditing('new')}>Invite</Button>
        </>}
      />

      {accounts.error && <p className="panel mb-4 p-4 text-bad">{accounts.error}</p>}
      {!accounts.data || !departments.data ? <div className="grid h-32 place-items-center"><Spinner /></div> : (
        <div className="panel divide-y divide-line">
          {accounts.data.map((a) => {
            const me = a.user_id === session?.user.id;
            return (
              <div key={a.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <Avatar name={a.name ?? a.email ?? '?'} className="size-9" />
                <div className="grid min-w-0 flex-1 gap-0.5 leading-tight">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    {a.name ?? a.email}
                    <Badge tone={a.role === 'owner' ? 'gold' : undefined}>{a.role === 'owner' ? 'Owner' : a.teams === null ? 'Manager' : 'Team manager'}</Badge>
                    {me && <Badge>You</Badge>}
                  </span>
                  <span className="truncate text-[12.5px] text-white/70">{accessSummary(a, departments.data!)}</span>
                  <span className="truncate text-[12px] text-mute">
                    {a.name && `${a.email} · `}
                    {a.invited ? 'Invitation sent, not accepted yet' : a.last_sign_in_at ? `Last signed in ${relativeTime(a.last_sign_in_at)}` : 'Never signed in'}
                  </span>
                </div>
                {a.mfa ? <Badge tone="ok"><ShieldCheck className="size-3" /> 2FA on</Badge> : <Badge tone="warn"><ShieldAlert className="size-3" /> No 2FA yet</Badge>}
                <div className="flex">
                  <IconButton label="Change access" onClick={() => setEditing(a)}><Pencil className="size-4" /></IconButton>
                  <IconButton label="Reset 2FA" disabled={!a.mfa} onClick={async () => {
                    if (await confirm('Reset their authenticator?', <>For a lost or new phone. {a.name ?? a.email} is signed out everywhere and sets up the authenticator again at the next sign-in.</>, 'Reset 2FA')) {
                      run(() => resetAccount2fa(a.user_id), '2FA reset');
                    }
                  }}><KeyRound className="size-4" /></IconButton>
                  <IconButton label="Remove access" disabled={me} onClick={async () => {
                    if (await confirm(`Remove ${a.name ?? a.email}?`, 'Their login is deleted and they’re signed out right away. Everything they made stays.', 'Remove')) {
                      run(() => removeAccount(a.user_id), 'Access removed');
                    }
                  }}><Trash2 className="size-4" /></IconButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && departments.data && (
        <AccountDialog
          account={editing === 'new' ? null : editing}
          me={editing !== 'new' && editing.user_id === session?.user.id}
          departments={departments.data}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); accounts.reload(); }}
        />
      )}
      {dialog}
    </>
  );
}

type Preset = 'owner' | 'manager' | 'team';

function AccountDialog({ account, me, departments, onClose, onDone }: {
  account: AdminAccount | null; me: boolean; departments: Department[]; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState(account?.name ?? '');
  const [access, setAccess] = useState<AccessInput>(account
    ? { role: account.role, media: account.media, rules: account.rules, accounting: account.accounting, teams: account.teams }
    : { role: 'manager', media: true, rules: true, accounting: false, teams: null });
  const [busy, setBusy] = useState(false);
  const preset: Preset = access.role === 'owner' ? 'owner' : access.teams === null ? 'manager' : 'team';
  const teams = departments;
  const set = (patch: Partial<AccessInput>) => setAccess((a) => ({ ...a, ...patch }));
  const pick = (p: Preset) => setAccess(
    p === 'owner' ? { role: 'owner', media: true, rules: true, accounting: true, teams: null }
      : p === 'manager' ? { role: 'manager', media: true, rules: true, accounting: access.accounting, teams: null }
        : { role: 'manager', media: false, rules: false, accounting: false, teams: access.teams ?? [] },
  );
  const toggleTeam = (id: string) => set({ teams: (access.teams ?? []).includes(id) ? (access.teams ?? []).filter((t) => t !== id) : [...(access.teams ?? []), id] });
  const invalid = preset === 'team' && (access.teams ?? []).length === 0 && !access.media && !access.accounting;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (account) {
        await updateAccount(account.user_id, { name: name.trim(), ...access });
        toast('Access saved');
      } else {
        await inviteAccount(email.trim(), name.trim(), access);
        toast(`Invitation sent to ${email.trim()}`);
      }
      onDone();
    } catch (err) { toast((err as Error).message, 'bad'); } finally { setBusy(false); }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={account ? `${account.name ?? account.email}` : 'Invite someone'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="account" loading={busy} disabled={invalid}>{account ? 'Save' : 'Send invitation'}</Button></>}
    >
      <form id="account" onSubmit={submit} className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">{(id) => <Input id={id} required value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          {!account && <Field label="Email" hint="They get a link to set a password, then an authenticator app.">{(id) => <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>}
        </div>

        <div className="grid gap-2">
          <span className="text-[13px] font-medium text-white/85">What can they do?</span>
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              ['owner', 'Owner', 'Everything, plus accounts and the activity log'],
              ['manager', 'Manager', 'Media, schedules of every team and the rules'],
              ['team', 'Team manager', 'Only the teams you pick, like the head of security'],
            ] as const).map(([p, title, body]) => (
              <button
                key={p}
                type="button"
                disabled={me && p !== 'owner' && account?.role === 'owner'}
                onClick={() => pick(p)}
                className={cn('grid gap-1 rounded-xl border p-3 text-left disabled:opacity-40', preset === p ? 'border-gold bg-gold/10' : 'border-line hover:bg-white/[0.04]')}
              >
                <span className="flex items-center gap-1.5 text-[14px] font-semibold">{preset === p && <Check className="size-4 text-gold" />}{title}</span>
                <span className="text-[12px] leading-snug text-white/60">{body}</span>
              </button>
            ))}
          </div>
          {me && account?.role === 'owner' && <p className="text-[12px] text-mute">You can’t take away your own owner access.</p>}
        </div>

        {preset !== 'owner' && (
          <div className="grid gap-4 rounded-xl border border-line p-4">
            <div className="grid gap-2">
              <span className="text-[13px] font-medium text-white/85">Teams they run</span>
              <span className="text-[12px] text-mute">Their schedule, people, time off and birthdays. They don’t see other teams at all.</span>
              <div className="flex flex-wrap gap-1.5">
                <TeamChip on={access.teams === null} onClick={() => set({ teams: access.teams === null ? [] : null })}>Every team</TeamChip>
                {access.teams !== null && teams.map((d) => <TeamChip key={d.id} on={access.teams!.includes(d.id)} onClick={() => toggleTeam(d.id)}>{d.plural}</TeamChip>)}
              </div>
            </div>
            <Switch checked={access.media} onChange={(media) => set({ media })} label="Media" description="Albums, promo slides, screens, gallery emails and photo removal requests" />
            <Switch checked={access.rules} onChange={(rules) => set({ rules })} label="Schedule rules" description="Shift times, days off, nightly minimums, for the teams they run" />
            <Switch checked={access.accounting} onChange={(accounting) => set({ accounting })} label="Accounting" description="Sees every payment request with bank details, pays them, manages vendors and downloads the paperwork" />
            <p className="text-[12px] text-mute">Everyone can add tasks and ask for payments (they see their own requests). The activity log and accounts are for owners only.</p>
            {invalid && <p className="text-[12.5px] text-warn">Pick at least one team, or turn on media or accounting.</p>}
          </div>
        )}
      </form>
    </Dialog>
  );
}

const TeamChip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" onClick={onClick} className={cn('flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px]', on ? 'border-gold bg-gold/15 text-gold' : 'border-line text-white/70 hover:bg-white/[0.05]')}>
    {on && <Check className="size-3.5" />}{children}
  </button>
);

