// Sign-in state for Gusto Command. Getting in takes three things: a session (password),
// an admin role, and a second factor (authenticator app) verified in this session.
// The database enforces the same rule (is_admin() needs aal2), this only drives the UI.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { FullScreenSpinner } from '@/components/ui';
import type { Access, Role } from '@/types';

export type AuthStep =
  | 'loading'
  | 'signed-out'
  | 'no-access' // signed in, but not an admin
  | 'setup-2fa' // admin without an authenticator yet
  | 'verify-2fa' // admin, needs today's code
  | 'ready';

interface Auth {
  step: AuthStep;
  session: Session | null;
  role: Role | null;
  access: Access | null;
  name: string | null;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<Auth>({ step: 'loading', session: null, role: null, access: null, name: null, refresh: async () => {} });

// Signed out after this long without touching the panel (on any device it's open on).
const IDLE_LIMIT_MS = 12 * 3_600_000;
const ACTIVITY_KEY = 'gusto-command:last-active';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<Auth, 'refresh'>>({ step: 'loading', session: null, role: null, access: null, name: null });

  const load = useCallback(async (session: Session | null) => {
    if (!session) return setState({ step: 'signed-out', session: null, role: null, access: null, name: null });
    const [{ data: access }, { data: aal }] = await Promise.all([
      supabase.rpc('my_access'),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    const name = (session.user.user_metadata?.name as string | undefined) ?? null;
    if (!access) return setState({ step: 'no-access', session, role: null, access: null, name });
    const step: AuthStep = aal?.currentLevel === 'aal2' ? 'ready' : aal?.nextLevel === 'aal2' ? 'verify-2fa' : 'setup-2fa';
    setState({ step, session, role: (access as Access).role, access: access as Access, name });
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await load(data.session);
  }, [load]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Run outside the auth callback (supabase-js holds a lock while it runs).
      if (event !== 'INITIAL_SESSION') setTimeout(() => load(session), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  // Idle sign-out.
  useEffect(() => {
    if (!state.session) return;
    const touch = () => { try { localStorage.setItem(ACTIVITY_KEY, String(Date.now())); } catch { /* private mode */ } };
    const check = () => {
      let last = Date.now();
      try { last = Number(localStorage.getItem(ACTIVITY_KEY)) || Date.now(); } catch { /* private mode */ }
      if (Date.now() - last > IDLE_LIMIT_MS) supabase.auth.signOut();
    };
    check();
    touch();
    let throttle = 0;
    const onActivity = () => { if (Date.now() - throttle > 30_000) { throttle = Date.now(); touch(); } };
    const events = ['pointerdown', 'keydown', 'visibilitychange'] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const timer = setInterval(check, 60_000);
    return () => { events.forEach((e) => window.removeEventListener(e, onActivity)); clearInterval(timer); };
  }, [state.session]);

  return <AuthContext.Provider value={{ ...state, refresh }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { step } = useAuth();
  const location = useLocation();
  if (step === 'loading') return <FullScreenSpinner />;
  if (step !== 'ready') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

export const displayName = (auth: Pick<Auth, 'name' | 'session'>) =>
  auth.name ?? auth.session?.user.email?.split('@')[0] ?? '';
