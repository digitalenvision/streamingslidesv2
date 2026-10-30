// Command frame: grouped sidebar + top bar (clock, ⌘K) on desktop; app-style tab bar
// with a "More" sheet on phones. Nav items carry the area they belong to, so each
// role only sees what it can use.
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Banknote, Building2, CalendarDays, CalendarOff, Flag, History, Images, LayoutGrid, ListTodo, LogOut, Mail, Megaphone, Menu, Monitor, Search, ShieldCheck,
  SlidersHorizontal, UserCog, Users, type LucideIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { countOpenRemovals } from '@/lib/data';
import { countOpenTasks } from '@/lib/tasks';
import { countDueToday } from '@/lib/payments';
import { displayName, useAuth } from '@/lib/auth';
import { can, roleLabel, type Area } from '@/lib/access';
import { cn } from '@/lib/format';
import { Badge, Dialog, IconButton, Logo, Mark } from './ui';
import { CommandPalette, useCommandPalette } from './CommandPalette';

interface NavItem { to: string; label: string; short?: string; icon: LucideIcon; area?: Area; end?: boolean }

export const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: 'Tonight',
    items: [
      { to: '/', label: 'Today', icon: LayoutGrid, end: true },
      { to: '/tasks', label: 'Tasks', icon: ListTodo, area: 'tasks' },
    ],
  },
  {
    title: 'Team',
    items: [
      { to: '/schedule', label: 'Schedule', icon: CalendarDays, area: 'staff' },
      { to: '/people', label: 'People', icon: Users, area: 'staff' },
      { to: '/time-off', label: 'Vacation & sick days', short: 'Time off', icon: CalendarOff, area: 'staff' },
    ],
  },
  {
    title: 'Media',
    items: [
      { to: '/albums', label: 'Albums', icon: Images, area: 'media' },
      { to: '/promos', label: 'Promo slides', short: 'Promos', icon: Megaphone, area: 'media' },
      { to: '/screens', label: 'Screens', icon: Monitor, area: 'media' },
      { to: '/removals', label: 'Removal requests', short: 'Removals', icon: Flag, area: 'media' },
      { to: '/visitors', label: 'Gallery emails', short: 'Emails', icon: Mail, area: 'media' },
    ],
  },
  {
    title: 'Accounting',
    items: [
      { to: '/payments', label: 'Payments', icon: Banknote, area: 'payments' },
      { to: '/vendors', label: 'Vendors', icon: Building2, area: 'accounting' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { to: '/settings/rules', label: 'Schedule rules', short: 'Rules', icon: SlidersHorizontal, area: 'rules' },
      { to: '/settings/accounts', label: 'Accounts', icon: UserCog, area: 'accounts' },
      { to: '/settings/activity', label: 'Activity log', short: 'Activity', icon: History, area: 'activity' },
      { to: '/settings/security', label: 'My security', short: 'Security', icon: ShieldCheck },
    ],
  },
];

const tabs = ['/', '/schedule', '/tasks', '/albums'];

export function AppShell() {
  const auth = useAuth();
  const palette = useCommandPalette();
  const [more, setMore] = useState(false);
  const location = useLocation();
  useEffect(() => setMore(false), [location.pathname]);

  const groups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.area || can(auth.access, i.area)) }))
    .filter((g) => g.items.length);
  const all = groups.flatMap((g) => g.items);
  const tabItems = tabs.map((t) => all.find((i) => i.to === t)).filter(Boolean) as NavItem[];
  const name = displayName(auth);
  // Open removal requests and tasks still to do, refreshed on every page change.
  const [openRemovals, setOpenRemovals] = useState(0);
  const [openTasks, setOpenTasks] = useState(0);
  const [dueToday, setDueToday] = useState(0);
  useEffect(() => {
    if (can(auth.access, 'media')) countOpenRemovals().then(setOpenRemovals);
    if (can(auth.access, 'accounting')) countDueToday().then(setDueToday);
    countOpenTasks().then(setOpenTasks);
  }, [auth.access, location.pathname]);
  const badge = (to: string) => (to === '/removals' ? openRemovals : to === '/tasks' ? openTasks : to === '/payments' ? dueToday : 0);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-[linear-gradient(180deg,#0c0716,#07040d_40%)] px-3 py-5 md:flex">
        <div className="flex items-center gap-2.5 px-3">
          <Mark className="h-7" />
          <span className="grid leading-none">
            <span className="font-mono text-[11px] font-semibold tracking-[0.32em] text-white">COMMAND</span>
            <span className="mt-1 font-mono text-[9px] tracking-[0.2em] text-white/35">GUSTO ARUBA</span>
          </span>
        </div>

        <button
          onClick={palette.show}
          className="mx-1 mt-6 flex h-9 items-center gap-2 rounded-lg border border-line bg-white/[0.03] px-2.5 text-[13px] text-white/45 transition-colors hover:border-white/15 hover:text-white/70"
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">Jump to…</span>
          <span className="kbd">⌘K</span>
        </button>

        <nav className="scroll-thin mt-5 grid flex-1 content-start gap-5 overflow-y-auto" aria-label="Main">
          {groups.map((g) => (
            <div key={g.title} className="grid gap-0.5">
              <div className="kicker px-3 pb-1.5">{g.title}</div>
              {g.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => cn(
                    'group relative flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-colors',
                    isActive ? 'bg-white/[0.07] text-white' : 'text-white/55 hover:bg-white/[0.035] hover:text-white',
                  )}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute -left-3 top-1.5 h-6 w-[3px] rounded-r-full bg-gold" />}
                      <Icon className={cn('size-[17px]', isActive ? 'text-gold' : 'text-white/40 group-hover:text-white/70')} />
                      {label}
                      {badge(to) > 0 && <span className="ml-auto rounded-full bg-bad px-1.5 text-[11px] font-semibold tabular-nums text-white">{badge(to)}</span>}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-line bg-white/[0.02] p-2.5">
          <Avatar name={name || '?'} />
          <span className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-[13px] font-semibold capitalize">{name}</span>
            <span className="kicker mt-0.5 !text-[9px] !text-gold/80">{auth.access ? (auth.access.role === 'owner' ? roleLabel.owner : auth.access.teams === null ? roleLabel.manager : 'Team manager') : ''}</span>
          </span>
          <IconButton label="Sign out" onClick={() => supabase.auth.signOut()} className="size-8"><LogOut className="size-4" /></IconButton>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Desktop top bar */}
        <div className="sticky top-0 z-30 hidden h-12 items-center justify-end gap-4 border-b border-line bg-ink-950/80 px-8 backdrop-blur-xl md:flex">
          <ArubaClock />
        </div>
        {/* Phone header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-ink-950/85 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:hidden">
          <div className="flex items-center gap-2 pl-1">
            <Mark className="h-6" />
            <span className="font-mono text-[10px] font-semibold tracking-[0.3em]">COMMAND</span>
          </div>
          <div className="flex items-center">
            <ArubaClock compact />
            <IconButton label="Search" onClick={palette.show}><Search className="size-[18px]" /></IconButton>
          </div>
        </header>

        {/* Schedules use the whole screen width; other pages keep a readable measure. */}
        <main className={cn('mx-auto w-full px-4', !location.pathname.startsWith('/schedule') && 'max-w-[1400px]', ' pb-[calc(96px+env(safe-area-inset-bottom))] pt-5 md:px-8 md:pb-16 md:pt-7')}>
          <Outlet />
        </main>
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-ink-950/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        {tabItems.map(({ to, label, short, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => cn('flex h-16 flex-col items-center justify-center gap-1 text-[10.5px] font-medium', isActive ? 'text-gold' : 'text-white/50')}
          >
            <Icon className="size-[21px]" />
            {short ?? label}
          </NavLink>
        ))}
        <button onClick={() => setMore(true)} className="flex h-16 flex-col items-center justify-center gap-1 text-[10.5px] font-medium text-white/50">
          <Menu className="size-[21px]" />
          More
        </button>
      </nav>

      <Dialog open={more} onClose={() => setMore(false)} title="Everything">
        <div className="grid gap-5 pb-2">
          {groups.map((g) => (
            <div key={g.title} className="grid gap-2">
              <div className="kicker">{g.title}</div>
              <div className="grid grid-cols-3 gap-2">
                {g.items.map(({ to, label, short, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) => cn('grid place-items-center gap-1.5 rounded-xl border border-line px-2 py-3 text-center text-[12px] font-medium', isActive ? 'border-gold/40 bg-gold/10 text-gold' : 'bg-white/[0.03] text-white/75')}
                  >
                    <span className="relative"><Icon className="size-5" />{badge(to) > 0 && <span className="absolute -right-2.5 -top-1.5 rounded-full bg-bad px-1 text-[10px] font-semibold text-white">{badge(to)}</span>}</span>
                    {short ?? label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
          <button onClick={() => supabase.auth.signOut()} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line text-white/70">
            <LogOut className="size-4" /> Sign out {name && <span className="capitalize">({name})</span>}
          </button>
        </div>
      </Dialog>

      <CommandPalette {...palette} />
    </div>
  );
}

/** Live Aruba time: the club's clock, whatever timezone the laptop is in. */
function ArubaClock({ compact }: { compact?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Aruba', ...o }).format(now);
  const time = fmt({ hour: 'numeric', minute: '2-digit', hour12: true });
  if (compact) return <span className="num mr-1 text-[12px] text-white/60">{time}</span>;
  return (
    <span className="flex items-center gap-2.5 font-mono text-[11px] tracking-[0.12em] text-white/50">
      <span className="size-1.5 animate-pulse rounded-full bg-ok" />
      {fmt({ weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}
      <span className="text-white/85">{time}</span>
      ARUBA
    </span>
  );
}

export function Avatar({ name, className, color }: { name: string; className?: string; color?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  return (
    <span className={cn('grid size-8 shrink-0 place-items-center rounded-full bg-gold/15 font-mono text-[11px] font-semibold text-gold', color, className)}>
      {initials}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions, back, kicker }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode; kicker?: ReactNode }) {
  return (
    <div className="mb-6 grid gap-3 md:mb-8">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid min-w-0 gap-1.5">
          {kicker && <div className="kicker !text-gold/80">{kicker}</div>}
          <h1 className="text-[26px] leading-tight md:text-[32px]">{title}</h1>
          {subtitle && <p className="max-w-2xl text-mute">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export { Mark, Logo, Badge };
