import { supabase } from '@/lib/supabase';
import type { SlideshowCommand } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Store active channels to reuse them
const commandChannels = new Map<string, RealtimeChannel>();

/**
 * Get or create a command channel for a slideshow
 */
function getCommandChannel(slideshowId: string): RealtimeChannel {
  const channelName = `slideshow:${slideshowId}:commands`;
  
  let channel = commandChannels.get(channelName);
  
  if (!channel) {
    console.log(`Creating new command channel: ${channelName}`);
    channel = supabase.channel(channelName, {
      config: {
        broadcast: {
          self: true, // Receive own broadcasts
        },
      },
    });
    commandChannels.set(channelName, channel);
  }
  
  return channel;
}

/**
 * Send a command to a slideshow
 */
export async function sendCommand(
  slideshowId: string,
  command: 'next' | 'previous' | 'play' | 'pause' | 'reload' | 'black-screen' | 'show-screen',
  payload?: Record<string, any>
): Promise<void> {
  console.log(`Sending command: ${command} to slideshow: ${slideshowId}`);
  
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

  // Get or create channel
  const channel = getCommandChannel(slideshowId);
  
  // Ensure channel is subscribed before sending
  if (channel.state !== 'joined') {
    console.log('Channel not joined, subscribing first...');
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Channel subscription timeout'));
      }, 5000);
      
      channel
        .subscribe((status) => {
          console.log(`Command channel subscription status: ${status}`);
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout);
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            clearTimeout(timeout);
            // Remove failed channel from cache
            commandChannels.delete(`slideshow:${slideshowId}:commands`);
            reject(new Error(`Channel subscription failed: ${status}`));
          }
        });
    });
  }

  // Broadcast command via Realtime
  const result = await channel.send({
    type: 'broadcast',
    event: 'command',
    payload: {
      command,
      payload,
      timestamp: Date.now(),
    },
  });
  
  console.log(`Command broadcast result:`, result);
}

/**
 * Subscribe to commands for a slideshow
 */
export function subscribeToCommands(
  slideshowId: string,
  onCommand: (command: string, payload?: Record<string, any>) => void
) {
  console.log(`Subscribing to commands for slideshow: ${slideshowId}`);
  
  const channelName = `slideshow:${slideshowId}:commands`;
  
  // Remove any existing channel to ensure fresh subscription
  const existingChannel = commandChannels.get(channelName);
  if (existingChannel) {
    console.log('Removing existing command channel to create fresh subscription');
    existingChannel.unsubscribe();
    commandChannels.delete(channelName);
  }
  
  const channel = getCommandChannel(slideshowId);
  
  // Add the broadcast listener
  channel.on('broadcast', { event: 'command' }, (message) => {
    console.log('Received command:', message.payload);
    onCommand(message.payload.command, message.payload.payload);
  });
  
  // Subscribe to the channel with error handling
  channel.subscribe((status) => {
    console.log(`Command subscription status: ${status}`);
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      console.error(`Command channel subscription failed: ${status}, will retry on next command`);
      commandChannels.delete(channelName);
    }
  });

  return () => {
    console.log(`Unsubscribing from commands for slideshow: ${slideshowId}`);
    channel.unsubscribe();
    commandChannels.delete(channelName);
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

