import { supabase } from '@/lib/supabase';
import type { PreviewStatus } from '@/types';

/**
 * Broadcast preview status
 */
export async function broadcastStatus(
  slideshowId: string,
  status: Omit<PreviewStatus, 'timestamp'>
): Promise<void> {
  const channel = supabase.channel(`slideshow:${slideshowId}:status`);
  
  await channel.send({
    type: 'broadcast',
    event: 'status',
    payload: {
      ...status,
      timestamp: Date.now(),
    },
  });
}

/**
 * Subscribe to preview status updates
 */
export function subscribeToStatus(
  slideshowId: string,
  onStatusUpdate: (status: PreviewStatus) => void
) {
  const channel = supabase
    .channel(`slideshow:${slideshowId}:status`)
    .on('broadcast', { event: 'status' }, (payload) => {
      onStatusUpdate(payload.payload as PreviewStatus);
    })
    .subscribe();

  return () => {
    channel.unsubscribe();
  };
}

/**
 * Send heartbeat to indicate preview is active
 */
export async function sendHeartbeat(slideshowId: string): Promise<void> {
  const channel = supabase.channel(`slideshow:${slideshowId}:heartbeat`);
  
  await channel.send({
    type: 'broadcast',
    event: 'heartbeat',
    payload: {
      timestamp: Date.now(),
    },
  });
}

/**
 * Subscribe to heartbeat to detect if preview is active
 */
export function subscribeToHeartbeat(
  slideshowId: string,
  onHeartbeat: (timestamp: number) => void
) {
  const channel = supabase
    .channel(`slideshow:${slideshowId}:heartbeat`)
    .on('broadcast', { event: 'heartbeat' }, (payload) => {
      onHeartbeat(payload.payload.timestamp);
    })
    .subscribe();

  return () => {
    channel.unsubscribe();
  };
}

