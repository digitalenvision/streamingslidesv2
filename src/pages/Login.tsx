import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Button, Field, FullScreenSpinner, Input, Logo } from '@/components/ui';

export function Login() {
  const { session, staff, loading } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <FullScreenSpinner />;
  if (session && staff) return <Navigate to={(location.state as { from?: string })?.from ?? '/'} replace />;
  const noAccess = session && !staff ? true : params.has('no-access');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message === 'Invalid login credentials' ? 'That email and password don’t match.' : error.message);
  };

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgb(135_8_153/.28),transparent_70%),radial-gradient(40%_40%_at_80%_100%,rgb(228_177_26/.12),transparent_70%)]" />
      <div className="relative w-full max-w-sm animate-fade-up">
        <Logo className="mx-auto w-32" />
        <p className="mt-3 text-center text-mute">Photos, promo slides and screens</p>
        <form onSubmit={submit} className="panel mt-8 grid gap-4 p-6">
          {noAccess && (
            <p className="rounded-xl bg-warn/10 px-3.5 py-3 text-[13px] text-warn">
              This account isn’t on the Gusto team yet. Ask an owner to add you.
              {session && <button type="button" className="ml-1 underline" onClick={() => supabase.auth.signOut()}>Sign out</button>}
            </p>
          )}
          <Field label="Email">{(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <Field label="Password" error={error ?? undefined}>
            {(id) => <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={busy} className="mt-1">Sign in</Button>
        </form>
      </div>
    </div>
  );
}
