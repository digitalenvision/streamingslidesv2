// Sign-in: password, then the authenticator app (set up on first sign-in). Also used by
// /welcome, where an invitation or reset link lands to choose a password.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { KeyRound, Lock, ShieldCheck, Smartphone } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Button, Field, FullScreenSpinner, Input, Mark } from '@/components/ui';
import { cn } from '@/lib/format';

export function Login() {
  const auth = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  if (auth.step === 'loading') return <FullScreenSpinner />;
  if (auth.step === 'ready') return <Navigate to={from} replace />;
  return (
    <AuthFrame>
      {auth.step === 'signed-out' && <PasswordStep />}
      {auth.step === 'no-access' && <NoAccess email={auth.session?.user.email} />}
      {auth.step === 'verify-2fa' && <CodeStep />}
      {auth.step === 'setup-2fa' && <SetupStep />}
    </AuthFrame>
  );
}

/** Invitation and password-reset links land here: choose a password, then 2FA. */
export function Welcome() {
  const auth = useAuth();
  const [done, setDone] = useState(false);
  if (auth.step === 'loading') return <FullScreenSpinner />;
  if (auth.step === 'signed-out') {
    return <AuthFrame><Notice title="This link has expired">Ask an owner for a new invitation, or use “Forgot password” on the sign-in page.<a href="/login" className="mt-4 block font-semibold text-gold">Go to sign-in →</a></Notice></AuthFrame>;
  }
  if (auth.step === 'no-access') return <AuthFrame><NoAccess email={auth.session?.user.email} /></AuthFrame>;
  // A reset for someone who already has 2FA: the code comes first (password changes need it).
  if (auth.step === 'verify-2fa') return <AuthFrame><CodeStep /></AuthFrame>;
  if (!done) return <AuthFrame><NewPasswordStep onDone={() => setDone(true)} /></AuthFrame>;
  return <Navigate to="/login" replace />;
}

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgb(135_8_153/.24),transparent_70%),radial-gradient(40%_40%_at_80%_100%,rgb(228_177_26/.10),transparent_70%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgb(255_255_255/.5)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/.5)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(60%_60%_at_50%_40%,black,transparent)]" />
      <div className="relative w-full max-w-[380px] animate-fade-up">
        <div className="flex flex-col items-center gap-3">
          <Mark className="h-10" />
          <span className="font-mono text-[12px] font-semibold tracking-[0.42em]">COMMAND</span>
          <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-white/40"><Lock className="size-3" /> GUSTO ARUBA · AUTHORIZED STAFF ONLY</span>
        </div>
        <div className="panel mt-8 p-6 shadow-pop">{children}</div>
      </div>
    </div>
  );
}

function StepTitle({ icon, title, body }: { icon: ReactNode; title: string; body?: ReactNode }) {
  return (
    <div className="mb-5 grid gap-1.5">
      <span className="mb-1 grid size-10 place-items-center rounded-xl bg-gold/12 text-gold [&>svg]:size-5">{icon}</span>
      <h1 className="text-[20px]">{title}</h1>
      {body && <p className="text-[13px] text-mute">{body}</p>}
    </div>
  );
}

function PasswordStep() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message === 'Invalid login credentials' ? 'That email and password don’t match.' : error.message);
  };

  const forgot = async () => {
    if (!email.trim()) return setError('Type your email first, then tap “Forgot password”.');
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/welcome` });
    setBusy(false);
    setResetSent(true);
  };

  if (resetSent) {
    return <Notice title="Check your email">If {email.trim()} has an account, a link to choose a new password is on its way.<button className="mt-4 block font-semibold text-gold" onClick={() => setResetSent(false)}>Back to sign-in</button></Notice>;
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <StepTitle icon={<KeyRound />} title="Sign in" />
      <Field label="Email">{(id) => <Input id={id} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
      <Field label="Password" error={error ?? undefined}>
        {(id) => <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={busy} className="mt-1">Continue</Button>
      <button type="button" onClick={forgot} className="text-[13px] text-mute hover:text-white">Forgot password</button>
    </form>
  );
}

function CodeStep() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async (value: string) => {
    setBusy(true);
    setError(null);
    const { data } = await supabase.auth.mfa.listFactors();
    const factor = data?.totp.find((f) => f.status === 'verified');
    if (!factor) { setBusy(false); return setError('No authenticator on this account. Ask an owner to reset it.'); }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: value });
    setBusy(false);
    if (error) { setError('That code didn’t work. Codes change every 30 seconds.'); setCode(''); return; }
    supabase.rpc('log_sign_in').then(() => {}, () => {});
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); verify(code); }} className="grid gap-4">
      <StepTitle icon={<ShieldCheck />} title="Enter your code" body="Open your authenticator app and type the 6-digit code for Gusto Command." />
      <CodeInput value={code} onChange={setCode} onComplete={verify} error={error} disabled={busy} />
      <Button type="submit" variant="primary" size="lg" loading={busy} disabled={code.length !== 6}>Verify</Button>
      <SignOutLink />
    </form>
  );
}

function SetupStep() {
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      // Clear half-finished attempts, then start a fresh one.
      const { data } = await supabase.auth.mfa.listFactors();
      for (const f of data?.all ?? []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: enrolled, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Gusto Command ${new Date().toISOString().slice(0, 10)}`, issuer: 'Gusto Command' });
      if (error || !enrolled) return setError(error?.message ?? 'Could not start the setup.');
      setFactor({ id: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret });
    })();
  }, []);

  const verify = async (value: string) => {
    if (!factor) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: value });
    setBusy(false);
    if (error) { setError('That code didn’t work. Check the time on your phone and try the next one.'); setCode(''); return; }
    supabase.rpc('log_sign_in').then(() => {}, () => {});
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); verify(code); }} className="grid gap-4">
      <StepTitle
        icon={<Smartphone />}
        title="Protect your account"
        body="Every Command account uses a code from an authenticator app (Google Authenticator, 1Password, Authy…). Scan this once with your phone."
      />
      <div className="grid place-items-center rounded-xl bg-white p-3">
        {factor ? <img src={factor.qr} alt="QR code for your authenticator app" className="size-44" /> : <div className="skeleton size-44 rounded-lg" />}
      </div>
      {factor && (
        <details className="text-[12.5px] text-mute">
          <summary className="cursor-pointer">Can’t scan? Type this key instead</summary>
          <code className="mt-2 block select-all break-all rounded-lg bg-white/[0.05] p-2.5 font-mono text-[12px] text-white/85">{factor.secret}</code>
        </details>
      )}
      <CodeInput value={code} onChange={setCode} onComplete={verify} error={error} disabled={busy || !factor} label="Code from the app" />
      <Button type="submit" variant="primary" size="lg" loading={busy} disabled={code.length !== 6}>Turn on and continue</Button>
      <SignOutLink />
    </form>
  );
}

function NewPasswordStep({ onDone }: { onDone: () => void }) {
  const { session } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problems = passwordProblems(password);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (problems.length) return setError(`Needs ${problems.join(', ')}.`);
    if (password !== confirm) return setError('The two passwords don’t match.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    onDone();
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <StepTitle icon={<KeyRound />} title="Choose a password" body={<>For <span className="text-white">{session?.user.email}</span>. Next you’ll set up your authenticator app.</>} />
      <Field label="New password" hint={password && problems.length ? `Needs ${problems.join(', ')}` : 'At least 10 characters, with upper and lower case and a number.'}>
        {(id) => <Input id={id} type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <Field label="Type it again" error={error ?? undefined}>
        {(id) => <Input id={id} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={busy}>Save password</Button>
    </form>
  );
}

export function passwordProblems(p: string) {
  return [
    p.length < 10 && '10+ characters',
    !/[a-z]/.test(p) && 'a lowercase letter',
    !/[A-Z]/.test(p) && 'an uppercase letter',
    !/\d/.test(p) && 'a number',
  ].filter(Boolean) as string[];
}

function NoAccess({ email }: { email?: string }) {
  return (
    <Notice title="No access">
      {email ?? 'This account'} isn’t a Command account. Ask an owner to invite you.
      <SignOutLink />
    </Notice>
  );
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return <div className="grid gap-2"><h1 className="text-[20px]">{title}</h1><div className="text-[13.5px] text-mute">{children}</div></div>;
}

const SignOutLink = () => (
  <button type="button" onClick={() => supabase.auth.signOut()} className="mt-1 block w-full text-center text-[13px] text-mute hover:text-white">Use a different account</button>
);

/** Six boxes for a one-time code; pasting works, submits by itself when full. */
export function CodeInput({ value, onChange, onComplete, error, disabled, label = 'Code' }: {
  value: string; onChange: (v: string) => void; onComplete: (v: string) => void; error?: string | null; disabled?: boolean; label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, [disabled]);
  return (
    <div className="grid gap-1.5">
      <span className="text-[13px] font-medium text-white/85">{label}</span>
      <label className="relative grid grid-cols-6 gap-2">
        <input
          ref={input}
          value={value}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label={label}
          maxLength={6}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 6);
            onChange(v);
            if (v.length === 6) onComplete(v);
          }}
          className="absolute inset-0 z-10 w-full cursor-text opacity-0"
        />
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className={cn(
              'grid h-12 place-items-center rounded-xl border bg-ink-850 font-mono text-[20px] font-semibold',
              i === value.length && !disabled ? 'border-gold/70' : 'border-line',
              error && 'border-bad/50',
            )}
          >
            {value[i] ?? ''}
          </span>
        ))}
      </label>
      {error && <p className="text-[12px] text-bad">{error}</p>}
    </div>
  );
}
