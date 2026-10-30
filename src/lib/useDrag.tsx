// Pointer dragging shared by the schedule boards.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Pointer dragging for mouse and pen. (On touch screens names are tapped instead, so the
 * page still scrolls normally.) Drop targets are found by their data-drop attribute.
 */
export function useDrag(onDrop: (id: string, from: string | null, target: string | null) => void) {
  const [dragging, setDragging] = useState<{ id: string; name: ReactNode; from: string | null; x: number; y: number } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const pending = useRef<{ id: string; name: ReactNode; from: string | null; x: number; y: number } | null>(null);
  const active = useRef(false);
  const dropped = useRef(0);
  const latest = useRef(onDrop);
  latest.current = onDrop;

  useEffect(() => {
    const targetAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-drop]') as HTMLElement | null)?.dataset.drop ?? null;
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      if (!active.current && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) return;
      active.current = true;
      setDragging({ ...p, x: e.clientX, y: e.clientY });
      setOver(targetAt(e.clientX, e.clientY));
    };
    const up = (e: PointerEvent) => {
      const p = pending.current;
      pending.current = null;
      if (active.current && p) {
        dropped.current = Date.now();
        latest.current(p.id, p.from, targetAt(e.clientX, e.clientY));
      }
      active.current = false;
      setDragging(null);
      setOver(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  return {
    start: (e: ReactPointerEvent, id: string, name: ReactNode, from: string | null) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      pending.current = { id, name, from, x: e.clientX, y: e.clientY };
    },
    justDropped: () => Date.now() - dropped.current < 250,
    dragging,
    over,
    ghost: dragging && createPortal(
      <div className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-1/2 rounded-md border border-gold/70 bg-ink-700 px-2.5 py-1 text-[13px] font-medium shadow-pop" style={{ left: dragging.x, top: dragging.y }}>
        {dragging.name}
      </div>,
      document.body,
    ),
  };
}
