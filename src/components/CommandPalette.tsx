// ⌘K / Ctrl+K: jump to any page, person or album, or start a common task.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarPlus, CornerDownLeft, Images, Plus, Printer, Search, UserPlus, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/access';
import { listEmployees } from '@/lib/staff';
import { listAlbums } from '@/lib/data';
import { albumName, arubaToday, cn, formatDate } from '@/lib/format';
import { weekStart } from '@/lib/schedule';
import { navGroups, Avatar } from './AppShell';
import type { Album, Employee } from '@/types';

interface Item { id: string; label: string; hint?: string; group: string; icon?: LucideIcon; avatar?: string; to: string }

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return { open, show: useCallback(() => setOpen(true), []), hide: useCallback(() => setOpen(false), []) };
}

export function CommandPalette({ open, hide }: { open: boolean; hide: () => void }) {
  const { access: role } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [people, setPeople] = useState<Employee[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    if (can(role, 'staff')) listEmployees().then(setPeople).catch(() => {});
    if (can(role, 'media')) listAlbums().then(setAlbums).catch(() => {});
  }, [open, role]);

  const items = useMemo<Item[]>(() => {
    const week = weekStart(arubaToday(true));
    const actions: Item[] = [
      can(role, 'staff') && { id: 'a-print', label: 'Print this week’s schedule', group: 'Actions', icon: Printer, to: `/schedule/print?week=${week}` },
      can(role, 'staff') && { id: 'a-off', label: 'Add time off', hint: 'Vacation, sick day, asked off', group: 'Actions', icon: CalendarPlus, to: '/time-off?new=1' },
      can(role, 'staff') && { id: 'a-person', label: 'Add a person', group: 'Actions', icon: UserPlus, to: '/people?new=1' },
      can(role, 'media') && { id: 'a-album', label: 'New album', group: 'Actions', icon: Plus, to: '/albums?new=1' },
    ].filter(Boolean) as Item[];
    const pages: Item[] = navGroups.flatMap((g) => g.items.filter((i) => !i.area || can(role, i.area)).map((i) => ({
      id: `p-${i.to}`, label: i.label, hint: g.title, group: 'Go to', icon: i.icon, to: i.to,
    })));
    const ppl: Item[] = people.map((p) => ({
      id: `e-${p.id}`, label: p.name, hint: [p.job_title, !p.active && 'inactive'].filter(Boolean).join(' · '), group: 'People', avatar: p.name, to: `/people?id=${p.id}`,
    }));
    const alb: Item[] = albums.slice(0, 200).map((a) => ({
      id: `al-${a.id}`, label: albumName(a), hint: formatDate(a.event_date, { month: 'short', day: 'numeric', year: 'numeric' }), group: 'Albums', icon: Images, to: `/albums/${a.id}`,
    }));
    const q = query.trim().toLowerCase();
    if (!q) return [...actions, ...pages];
    const words = q.split(/\s+/);
    const match = (i: Item) => {
      const hay = `${i.label} ${i.hint ?? ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    };
    return [...actions, ...pages, ...ppl, ...alb].filter(match).slice(0, 40);
  }, [query, people, albums, role]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;
  const go = (i: Item | undefined) => { if (!i) return; hide(); navigate(i.to); };

  let lastGroup = '';
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-3 pt-[12dvh]" onKeyDown={(e) => {
      if (e.key === 'Escape') hide();
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); go(items[active]); }
    }}>
      <div className="absolute inset-0 animate-[fade-up_.15s_ease_both] bg-black/70 backdrop-blur-sm" onClick={hide} />
      <div role="dialog" aria-label="Jump to" className="relative w-full max-w-xl animate-fade-up overflow-hidden rounded-2xl border border-line bg-ink-850 shadow-pop">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 text-white/40" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, albums, pages…"
            className="h-14 flex-1 bg-transparent text-[15px] placeholder:text-white/30 focus:outline-none"
          />
          <span className="kbd">esc</span>
        </div>
        <div ref={list} className="scroll-thin max-h-[55dvh] overflow-y-auto p-2">
          {items.length === 0 && <p className="px-3 py-8 text-center text-mute">Nothing matches “{query}”.</p>}
          {items.map((item, index) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <div key={item.id}>
                {header && <div className="kicker px-3 pb-1 pt-3">{header}</div>}
                <button
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={() => go(item)}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left', index === active ? 'bg-white/[0.08]' : '')}
                >
                  {item.avatar ? <Avatar name={item.avatar} className="size-7 text-[10px]" /> : Icon && <Icon className="size-4 text-white/50" />}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="truncate text-[12px] text-white/40">{item.hint}</span>}
                  {index === active ? <CornerDownLeft className="size-3.5 text-gold" /> : <ArrowRight className="size-3.5 text-transparent" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
