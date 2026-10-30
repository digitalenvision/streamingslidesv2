// The signed-in admin's own security: authenticator, password, signing out everywhere.
import { useState, type FormEvent } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Badge, Button, Field, Input, useToast } from '@/components/ui';
import { passwordProblems } from '../Login';
import { supabase } from '@/lib/supabase';
import { displayName, useAuth } from '@/lib/auth';
import { roleLabel } from '@/lib/access';
import { useLoad } from '@/lib/useLoad';

export function Security() {
  const auth = useAuth();
  const toast = useToast();
  const factors = useLoad(async () => (await supabase.auth.mfa.listFactors()).data?.totp.filter((f) => f.status === 'verified') ?? []);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const problems = passwordProblems(password);

  const change = async (e: FormEvent) => {
    e.preventDefault();
    if (problems.length) return toast(`Password needs ${problems.join(', ')}`, 'bad');
    if (password !== confirm) return toast('The two passwords don’t match', 'bad');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast(error.message, 'bad');
    setPassword(''); setConfirm('');
    toast('Password changed');
  };

  return (
    <>
      <PageHeader kicker="Admin" title="My security" subtitle={<>{displayName(auth)} · {auth.session?.user.email} · {auth.role ? roleLabel[auth.role] : ''}</>} />
      <div className="grid max-w-2xl gap-5">
        <section className="panel grid gap-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px]">Authenticator app</h2>
            <Badge tone="ok"><ShieldCheck className="size-3" /> On</Badge>
          </div>
          <p className="text-mute">Every sign-in needs a code from your phone. {factors.data?.[0] ? <>Set up {new Date(factors.data[0].created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.</> : null}</p>
          <p className="text-[12.5px] text-white/45">New phone or lost it? Ask an owner to reset your 2FA (Accounts), then set it up again at your next sign-in.</p>
        </section>

        <form onSubmit={change} className="panel grid gap-4 p-5">
          <h2 className="text-[17px]">Change password</h2>
          <Field label="New password" hint={password && problems.length ? `Needs ${problems.join(', ')}` : 'At least 10 characters, with upper and lower case and a number.'}>
            {(id) => <Input id={id} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          <Field label="Type it again">{(id) => <Input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}</Field>
          <Button type="submit" variant="primary" loading={busy} disabled={!password} className="justify-self-start">Change password</Button>
        </form>

        <section className="panel grid gap-3 p-5">
          <h2 className="text-[17px]">Sessions</h2>
          <p className="text-mute">You’re signed out automatically after 12 hours without using Command. Left it open on a shared computer?</p>
          <Button className="justify-self-start" icon={<LogOut className="size-4" />} onClick={() => supabase.auth.signOut({ scope: 'global' })}>Sign out on every device</Button>
        </section>
      </div>
    </>
  );
}
