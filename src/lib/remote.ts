// Live link between the admin and the TV players, over a Supabase Realtime broadcast
// channel per screen. The admin sends commands; each player answers with its status
// every few seconds (which doubles as a heartbeat).
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type Command = 'play' | 'pause' | 'next' | 'previous' | 'black' | 'unblack' | 'reload';

export interface PlayerStatus {
  player: string; // one id per open player (a screen can have several TVs)
  playing: boolean;
  black: boolean;
  index: number;
  total: number;
  albums: number;
  promos: number;
  now: { kind: 'photo' | 'promo' | 'title'; album?: string; title?: string; src?: string } | null;
  version: number;
  ua: string;
  at: number;
}

export function screenChannel(screenId: string) {
  return supabase.channel(`screen:${screenId}`, { config: { broadcast: { self: false } } });
}

export function sendCommand(channel: RealtimeChannel, command: Command) {
  return channel.send({ type: 'broadcast', event: 'command', payload: { command } });
}
