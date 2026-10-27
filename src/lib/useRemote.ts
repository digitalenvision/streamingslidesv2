import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { screenChannel, sendCommand, type Command, type PlayerStatus } from './remote';

const STALE_MS = 25_000;

/** Live players on a screen (from their status broadcasts) and a way to command them. */
export function useRemote(screenId: string | undefined) {
  const [players, setPlayers] = useState<PlayerStatus[]>([]);
  const channel = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!screenId) return;
    const seen = new Map<string, PlayerStatus>();
    const publish = () => setPlayers([...seen.values()].filter((p) => Date.now() - p.at < STALE_MS).sort((a, b) => a.player.localeCompare(b.player)));
    const ch = screenChannel(screenId)
      .on('broadcast', { event: 'status' }, ({ payload }) => {
        seen.set(payload.player, { ...(payload as PlayerStatus), at: Date.now() });
        publish();
      })
      .subscribe((state) => {
        // Ask players to report right away instead of waiting for their next heartbeat.
        if (state === 'SUBSCRIBED') ch.send({ type: 'broadcast', event: 'hello', payload: {} });
      });
    channel.current = ch;
    const sweep = setInterval(publish, 5000);
    return () => {
      clearInterval(sweep);
      ch.unsubscribe();
      channel.current = null;
    };
  }, [screenId]);

  const send = (command: Command) => channel.current && sendCommand(channel.current, command);
  return { players, send };
}
