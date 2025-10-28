# Remote Control Fix - Multi-Browser Support

## Problem Summary

The remote control was not working reliably across multiple browsers or after page refreshes. Commands sent from the remote control page were not being received by preview windows, especially after a refresh.

## Root Causes Identified

1. **Channel Subscription Issues**: Channels were being created but not properly subscribed before broadcasting messages
2. **Channel State Management**: No reuse of channels, causing channel proliferation and stale connections
3. **Missing Error Handling**: Failed channel connections were not being detected or handled
4. **Callback Dependencies**: React hooks were not properly managing callback dependencies, causing subscription re-creation

## Fixes Implemented

### 1. Command Service (`src/services/command.ts`)

**Changes:**
- Added channel caching with `Map<string, RealtimeChannel>` to reuse channels
- Implemented `getCommandChannel()` helper to manage channel lifecycle
- **Critical Fix**: Channels now subscribe before broadcasting (`channel.state !== 'joined'` check)
- Added timeout and error handling for channel subscriptions (5-second timeout)
- Fresh subscription on component mount - removes stale channels
- Proper cleanup on unsubscribe - removes channel from cache
- Added comprehensive logging for debugging
- Configured channels with `self: true` for commands (so sender can verify receipt)

**Key Implementation:**
```typescript
// Ensure channel is subscribed before sending
if (channel.state !== 'joined') {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Channel subscription timeout'));
    }, 5000);
    
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}
```

### 2. Status Service (`src/services/status.ts`)

**Changes:**
- Added separate channel caches for status and heartbeat channels
- Implemented channel management helpers (`getStatusChannel()`, `getHeartbeatChannel()`)
- Same subscription-before-broadcast pattern for both status and heartbeat
- Fresh subscriptions on component mount
- Proper error handling and channel cleanup
- Configured channels with `self: false` for status/heartbeat (avoid echo)

### 3. SlideshowPreview Component (`src/pages/SlideshowPreview.tsx`)

**Changes:**
- Wrapped `handleCommand` in `useCallback` with proper dependencies
- Commands now use functional setState to avoid dependency issues
- Immediate heartbeat on mount (don't wait 5 seconds for first heartbeat)
- Added error handling for heartbeat and status broadcast failures
- Comprehensive logging for debugging subscription lifecycle

**Key Implementation:**
```typescript
const handleCommand = useCallback((command: string, _payload?: any) => {
  switch (command) {
    case 'next':
      setCurrentIndex(prev => {
        const nextIndex = prev + 1;
        if (nextIndex >= allItems.length) {
          if (slideshow?.settings?.loop) {
            return 0;
          } else {
            setIsPlaying(false);
            return prev;
          }
        }
        return nextIndex;
      });
      break;
    // ... other commands
  }
}, [allItems.length, slideshow?.settings?.loop]);
```

### 4. RemoteControl Component (`src/pages/RemoteControl.tsx`)

**Changes:**
- Added logging for subscription lifecycle
- Proper cleanup on unmount
- Better visibility into status and heartbeat reception

## Technical Details

### Channel Naming Convention
- Commands: `slideshow:{slideshowId}:commands`
- Status: `slideshow:{slideshowId}:status`
- Heartbeat: `slideshow:{slideshowId}:heartbeat`

### Channel Configuration
```typescript
// Commands - receive own broadcasts for verification
supabase.channel(channelName, {
  config: {
    broadcast: {
      self: true,
    },
  },
});

// Status/Heartbeat - don't receive own broadcasts
supabase.channel(channelName, {
  config: {
    broadcast: {
      self: false,
    },
  },
});
```

### Subscription Lifecycle

1. **Component Mount (Preview)**:
   - Subscribe to command channel
   - Start sending heartbeats (immediate + every 5 seconds)
   - Broadcast status updates on state changes

2. **Component Mount (Remote Control)**:
   - Subscribe to status channel
   - Subscribe to heartbeat channel
   - Monitor heartbeat to detect active previews (10-second timeout)

3. **Sending Command**:
   - Get or create channel
   - Ensure channel is subscribed (wait up to 5 seconds)
   - Broadcast command
   - Log result

4. **Component Unmount**:
   - Unsubscribe from all channels
   - Clear channels from cache
   - Stop heartbeat interval

### Error Handling

All channel operations now handle errors gracefully:
- Subscription timeouts (5 seconds)
- Channel errors, timeouts, or closures
- Failed channels are removed from cache for retry
- Broadcast failures are logged but don't crash the app

## Testing Recommendations

### Test Scenario 1: Multiple Browsers
1. Open preview in Browser A
2. Open remote control in Browser B
3. Send commands from Browser B
4. Verify preview in Browser A responds immediately

### Test Scenario 2: Refresh Preview
1. Open preview and remote control
2. Refresh the preview browser
3. Wait for heartbeat to re-establish (< 5 seconds)
4. Send commands from remote control
5. Verify preview responds

### Test Scenario 3: Refresh Remote Control
1. Open preview and remote control
2. Refresh the remote control browser
3. Verify status indicator shows "Active" within 10 seconds
4. Send commands
5. Verify preview responds

### Test Scenario 4: Multiple Previews
1. Open preview in multiple windows/browsers
2. Open one remote control
3. Send commands
4. Verify all previews respond synchronously

## Debugging

All components now include comprehensive console logging:

**Preview logs:**
- `SlideshowPreview: Setting up command subscription`
- `SlideshowPreview: Starting heartbeat`
- `SlideshowPreview: Handling command: {command}`
- `SlideshowPreview: Broadcasting status update`

**Remote Control logs:**
- `RemoteControl: Subscribing to status updates`
- `RemoteControl: Subscribing to heartbeat`
- `RemoteControl: Received heartbeat`
- `RemoteControl: Received status update`

**Service logs:**
- `Creating new command channel: {channelName}`
- `Sending command: {command} to slideshow: {slideshowId}`
- `Command subscription status: {status}`
- `Received command: {payload}`

To debug issues, open the browser console and look for these log messages. The logs will show:
- When subscriptions are established
- When messages are sent and received
- Any connection errors or timeouts

## Performance Considerations

- Channel reuse prevents connection overhead
- Heartbeat interval of 5 seconds balances responsiveness and network usage
- Status broadcasts only on state changes, not continuously
- Channels are properly cleaned up to prevent memory leaks

## Known Limitations

1. **Supabase Realtime Limits**: Subject to Supabase's realtime connection limits
2. **Network Dependency**: Requires active internet connection for realtime features
3. **First Connection**: May take up to 5 seconds for initial channel subscription
4. **Browser Tab Sleep**: Inactive tabs may delay heartbeats, causing false "inactive" status

## Future Improvements

1. **Reconnection Logic**: Automatic retry with exponential backoff for failed channels
2. **Offline Detection**: Show warning when network is unavailable
3. **Connection Quality**: Display connection strength indicator
4. **Command Queue**: Queue commands when preview is temporarily disconnected
5. **Presence API**: Use Supabase Presence for more robust active preview detection

