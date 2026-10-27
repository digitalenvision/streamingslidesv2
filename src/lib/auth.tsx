import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { FullScreenSpinner } from '@/components/ui';

interface Auth {
  session: Session | null;
  staff: { role: 'owner' | 'editor' } | null;
  loading: boolean;
}

const AuthContext = createContext<Auth>({ session: null, staff: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Auth>({ session: null, staff: null, loading: true });

  useEffect(() => {
    const load = async (session: Session | null) => {
      if (!session) return setState({ session: null, staff: null, loading: false });
      const { data } = await supabase.from('staff').select('role').eq('user_id', session.user.id).maybeSingle();
      setState({ session, staff: data as Auth['staff'], loading: false });
    };
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') load(session);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function RequireStaff({ children }: { children: ReactNode }) {
  const { session, staff, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenSpinner />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!staff) return <Navigate to="/login?no-access=1" replace />;
  return <>{children}</>;
}
