// Album photo grid: select (checkbox or shift-click ranges), drag to reorder, open a
// large preview. Bulk actions live in the parent; this only reports selection/order.
import { useRef, useState } from 'react';
import { Check, Globe, MonitorOff, Star, Loader2, AlertTriangle } from 'lucide-react';
import { photoUrl } from '@/lib/media';
import { cn } from '@/lib/format';
import type { UploadTask } from '@/lib/upload';
import type { Photo } from '@/types';

interface Props {
  photos: Photo[];
  pending: UploadTask[];
  coverId: string | null;
  selected: Set<string>;
  onSelect: (next: Set<string>) => void;
  onOpen: (photo: Photo) => void;
  onReorder: (ids: string[]) => void;
}

export function PhotoGrid({ photos, pending, coverId, selected, onSelect, onOpen, onReorder }: Props) {
  const anchor = useRef<number | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const selecting = selected.size > 0;

  const toggle = (index: number, range: boolean) => {
    const next = new Set(selected);
    if (range && anchor.current !== null) {
      const [a, b] = [anchor.current, index].sort((x, y) => x - y);
      photos.slice(a, b + 1).forEach((p) => next.add(p.id));
    } else {
      const id = photos[index].id;
      if (next.has(id)) next.delete(id);
      else next.add(id);
      anchor.current = index;
    }
    onSelect(next);
  };

  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = photos.map((p) => p.id);
    const moving = selected.has(dragId) ? ids.filter((id) => selected.has(id)) : [dragId];
    const rest = ids.filter((id) => !moving.includes(id));
    const at = rest.indexOf(targetId);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    rest.splice(from < to ? at + 1 : at, 0, ...moving);
    onReorder(rest);
  };

  return (
    <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {photos.map((p, i) => {
        const isSelected = selected.has(p.id);
        return (
          <li
            key={p.id}
            draggable
            onDragStart={(e) => { setDragId(p.id); e.dataTransfer.effectAllowed = 'move'; }}
            onDragEnd={() => { setDragId(null); setOverId(null); }}
            onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(p.id); } }}
            onDrop={(e) => { e.preventDefault(); drop(p.id); setOverId(null); }}
            className={cn(
              'group relative aspect-square overflow-hidden rounded-lg bg-ink-800 transition-[opacity,transform]',
              dragId === p.id && 'opacity-40',
              overId === p.id && dragId !== p.id && 'ring-2 ring-gold',
            )}
          >
            <button
              type="button"
              onClick={(e) => (selecting || e.shiftKey || e.metaKey || e.ctrlKey ? toggle(i, e.shiftKey) : onOpen(p))}
              className="block size-full"
              aria-label={`Photo ${i + 1}${isSelected ? ', selected' : ''}`}
            >
              <img
                src={photoUrl(p.album_id, p.id, 400, p.format)}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                style={p.lqip ? { backgroundImage: `url(${p.lqip})`, backgroundSize: 'cover' } : undefined}
                className={cn('size-full object-cover transition-transform duration-300', isSelected && 'scale-[.88] rounded-md', p.hidden_web && p.hidden_screen && 'opacity-40')}
              />
            </button>
            <button
              type="button"
              onClick={(e) => toggle(i, e.shiftKey)}
              aria-label={isSelected ? 'Deselect' : 'Select'}
              className={cn(
                'absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-full border-2 transition-opacity',
                isSelected ? 'border-gold bg-gold text-purple-deep opacity-100' : 'border-white/80 bg-black/30 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-70',
                selecting && 'opacity-100',
              )}
            >
              {isSelected && <Check className="size-3.5" strokeWidth={3} />}
            </button>
            <div className="pointer-events-none absolute bottom-1.5 left-1.5 flex gap-1">
              {p.id === coverId && <Tag title="Cover"><Star className="size-3 fill-current" /></Tag>}
              {p.hidden_web && <Tag title="Hidden on website"><Globe className="size-3" /><Strike /></Tag>}
              {p.hidden_screen && <Tag title="Hidden on screens"><MonitorOff className="size-3" /></Tag>}
            </div>
          </li>
        );
      })}
      {pending.filter((t) => t.state !== 'done').map((t) => (
        <li key={t.key} className="relative aspect-square overflow-hidden rounded-lg bg-ink-800">
          {t.preview ? <img src={t.preview} alt="" className="size-full object-cover opacity-60" /> : <div className="skeleton size-full" />}
          <div className="absolute inset-0 grid place-items-center">
            {t.state === 'error'
              ? <span title={t.error} className="grid place-items-center gap-1 px-2 text-center text-[11px] text-bad"><AlertTriangle className="size-5" />Failed</span>
              : <Loader2 className="size-5 animate-spin text-white/80" />}
          </div>
        </li>
      ))}
    </ul>
  );
}

const Tag = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <span title={title} className="relative grid size-5 place-items-center rounded-md bg-ink-950/80 text-white backdrop-blur [&_svg]:text-gold">{children}</span>
);
const Strike = () => <span className="absolute h-px w-3.5 rotate-45 bg-gold" />;
