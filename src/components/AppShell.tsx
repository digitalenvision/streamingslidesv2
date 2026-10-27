// Admin frame: sidebar on desktop, app-style bottom tab bar on phones.
import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Images, LayoutGrid, LogOut, Megaphone, Monitor, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/format';
import { IconButton, Logo, Mark } from './ui';

const nav = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/albums', label: 'Albums', icon: Images },
  { to: '/promos', label: 'Promo slides', short: 'Promos', icon: Megaphone },
  { to: '/screens', label: 'Screens', icon: Monitor },
  { to: '/visitors', label: 'Gallery emails', short: 'Emails', icon: Users },
];

export function AppShell() {
  const { session } = useAuth();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-ink-950 px-4 py-6 md:flex">
        <div className="flex items-center gap-2 px-2">
          <Logo className="w-24" />
          <span className="mt-1 rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">Media</span>
        </div>
        <nav className="mt-8 grid gap-1" aria-label="Main">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn(
                'flex h-10 items-center gap-3 rounded-xl px-3 font-medium transition-colors',
                isActive ? 'bg-white/[0.08] text-white' : 'text-white/60 hover:bg-white/[0.04] hover:text-white',
              )}
            >
              {({ isActive }) => <><Icon className={cn('size-[18px]', isActive && 'text-gold')} />{label}</>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-2 rounded-xl border border-line px-3 py-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold/15 text-[13px] font-bold uppercase text-gold">
            {session?.user.email?.[0] ?? '?'}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-white/70">{session?.user.email}</span>
          <IconButton label="Sign out" onClick={() => supabase.auth.signOut()} className="size-8"><LogOut className="size-4" /></IconButton>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-ink-950/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:hidden">
          <Logo className="w-20" />
          <IconButton label="Sign out" onClick={() => supabase.auth.signOut()}><LogOut className="size-[18px]" /></IconButton>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-5 md:px-8 md:pb-16 md:pt-8">
          <Outlet />
        </main>
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-ink-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        {nav.map(({ to, label, short, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => cn('flex h-16 flex-col items-center justify-center gap-1 text-[10.5px] font-medium', isActive ? 'text-gold' : 'text-white/55')}
          >
            <Icon className="size-[21px]" />
            {short ?? label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6 grid gap-3 md:mb-8">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid min-w-0 gap-1">
          <h1 className="text-[26px] leading-tight md:text-[32px]">{title}</h1>
          {subtitle && <p className="text-mute">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export { Mark };
