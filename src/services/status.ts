import { supabase } from '@/lib/supabase';
import type { PreviewStatus } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Store active channels to reuse them
const statusChannels = new Map<string, RealtimeChannel>();
const heartbeatChannels = new Map<string, RealtimeChannel>();

/**
 * Get or create a status channel for a slideshow
 */
function getStatusChannel(slideshowId: string): RealtimeChannel {
  const channelName = `slideshow:${slideshowId}:status`;
  
  let channel = statusChannels.get(channelName);
  
  if (!channel) {
    console.log(`Creating new status channel: ${channelName}`);
    channel = supabase.channel(channelName, {
      config: {
        broadcast: {
          self: false, // Don't receive own broadcasts for status
        },
      },
    });
    statusChannels.set(channelName, channel);
  }
  
  return channel;
}

/**
 * Get or create a heartbeat channel for a slideshow
 */
function getHeartbeatChannel(slideshowId: string): RealtimeChannel {
  const channelName = `slideshow:${slideshowId}:heartbeat`;
  
  let channel = heartbeatChannels.get(channelName);
  
  if (!channel) {
    console.log(`Creating new heartbeat channel: ${channelName}`);
    channel = supabase.channel(channelName, {
      config: {
        broadcast: {
          self: false, // Don't receive own heartbeats
        },
      },
    });
    heartbeatChannels.set(channelName, channel);
  }
  
  return channel;
}

/**
 * Broadcast preview status
 */
export async function broadcastStatus(
  slideshowId: string,
  status: Omit<PreviewStatus, 'timestamp'>
): Promise<void> {
  const channel = getStatusChannel(slideshowId);
  
  // Ensure channel is subscribed before sending
  if (channel.state !== 'joined') {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Status channel subscription timeout'));
      }, 5000);
      
      channel.subscribe((channelStatus) => {
        if (channelStatus === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        } else if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT' || channelStatus === 'CLOSED') {
          clearTimeout(timeout);
          statusChannels.delete(`slideshow:${slideshowId}:status`);
          reject(new Error(`Status channel subscription failed: ${channelStatus}`));
        }
      });
    });
  }
  
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
  console.log(`Subscribing to status for slideshow: ${slideshowId}`);
  
  const channelName = `slideshow:${slideshowId}:status`;
  
  // Remove any existing channel to ensure fresh subscription
  const existingChannel = statusChannels.get(channelName);
  if (existingChannel) {
    console.log('Removing existing status channel to create fresh subscription');
    existingChannel.unsubscribe();
    statusChannels.delete(channelName);
  }
  
  const channel = getStatusChannel(slideshowId);
  
  // Add the broadcast listener
  channel.on('broadcast', { event: 'status' }, (message) => {
    console.log('Received status update:', message.payload);
    onStatusUpdate(message.payload as PreviewStatus);
  });
  
  // Subscribe to the channel with error handling
  channel.subscribe((status) => {
    console.log(`Status subscription status: ${status}`);
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      console.error(`Status channel subscription failed: ${status}, will retry on reconnection`);
      statusChannels.delete(channelName);
    }
  });

  return () => {
    console.log(`Unsubscribing from status for slideshow: ${slideshowId}`);
    channel.unsubscribe();
    statusChannels.delete(channelName);
  };
}

/**
 * Send heartbeat to indicate preview is active
 */
export async function sendHeartbeat(slideshowId: string): Promise<void> {
  const channel = getHeartbeatChannel(slideshowId);
  
  // Ensure channel is subscribed before sending
  if (channel.state !== 'joined') {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Heartbeat channel subscription timeout'));
      }, 5000);
      
      channel.subscribe((channelStatus) => {
        if (channelStatus === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        } else if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT' || channelStatus === 'CLOSED') {
          clearTimeout(timeout);
          heartbeatChannels.delete(`slideshow:${slideshowId}:heartbeat`);
          reject(new Error(`Heartbeat channel subscription failed: ${channelStatus}`));
        }
      });
    });
  }
  
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
  console.log(`Subscribing to heartbeat for slideshow: ${slideshowId}`);
  
  const channelName = `slideshow:${slideshowId}:heartbeat`;
  
  // Remove any existing channel to ensure fresh subscription
  const existingChannel = heartbeatChannels.get(channelName);
  if (existingChannel) {
    console.log('Removing existing heartbeat channel to create fresh subscription');
    existingChannel.unsubscribe();
    heartbeatChannels.delete(channelName);
  }
  
  const channel = getHeartbeatChannel(slideshowId);
  
  // Add the broadcast listener
  channel.on('broadcast', { event: 'heartbeat' }, (message) => {
    console.log('Received heartbeat');
    onHeartbeat(message.payload.timestamp);
  });
  
  // Subscribe to the channel with error handling
  channel.subscribe((status) => {
    console.log(`Heartbeat subscription status: ${status}`);
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      console.error(`Heartbeat channel subscription failed: ${status}, will retry on reconnection`);
      heartbeatChannels.delete(channelName);
    }
  });

  return () => {
    console.log(`Unsubscribing from heartbeat for slideshow: ${slideshowId}`);
    channel.unsubscribe();
    heartbeatChannels.delete(channelName);
  };
}

