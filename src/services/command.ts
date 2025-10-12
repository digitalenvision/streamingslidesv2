import { supabase } from '@/lib/supabase';
import type { SlideshowCommand } from '@/types';

/**
 * Send a command to a slideshow
 */
export async function sendCommand(
  slideshowId: string,
  command: 'next' | 'previous' | 'play' | 'pause' | 'reload' | 'black-screen' | 'show-screen',
  payload?: Record<string, any>
): Promise<void> {
  // Save command to database for persistence
  const { error: dbError } = await supabase
    .from('slideshow_commands')
    .insert({
      slideshow_id: slideshowId,
      command,
      payload,
      timestamp: new Date().toISOString(),
    });

  if (dbError) {
    console.error('Failed to save command to database:', dbError);
  }

  // Broadcast command via Realtime
  const channel = supabase.channel(`slideshow:${slideshowId}`);
  
  await channel.send({
    type: 'broadcast',
    event: 'command',
    payload: {
      command,
      payload,
      timestamp: Date.now(),
    },
  });
}

/**
 * Subscribe to commands for a slideshow
 */
export function subscribeToCommands(
  slideshowId: string,
  onCommand: (command: string, payload?: Record<string, any>) => void
) {
  const channel = supabase
    .channel(`slideshow:${slideshowId}`)
    .on('broadcast', { event: 'command' }, (payload) => {
      onCommand(payload.payload.command, payload.payload.payload);
    })
    .subscribe();

  return () => {
    channel.unsubscribe();
  };
}

/**
 * Get command history for a slideshow
 */
export async function getCommandHistory(
  slideshowId: string,
  limit: number = 50
): Promise<SlideshowCommand[]> {
  const { data, error } = await supabase
    .from('slideshow_commands')
    .select('*')
    .eq('slideshow_id', slideshowId)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Clear command history for a slideshow
 */
export async function clearCommandHistory(slideshowId: string): Promise<void> {
  const { error } = await supabase
    .from('slideshow_commands')
    .delete()
    .eq('slideshow_id', slideshowId);

  if (error) {
    throw error;
  }
}

