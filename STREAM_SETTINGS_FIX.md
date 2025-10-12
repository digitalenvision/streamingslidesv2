# Stream Settings Priority & Frequency Fix

## Overview
Fixed the slideshow preview system to properly respect stream-specific settings and implement the frequency feature for single-photo and video streams.

## Issues Fixed

### 1. Stream Settings Not Being Applied
**Problem**: All items were being played with only the slideshow's default settings, ignoring individual stream settings.

**Solution**: Each item now carries its parent stream's settings and applies them with proper priority:
- Duration: Stream setting → Slideshow default → 5 seconds
- Transition: Stream setting → Slideshow default → 'fade'
- Transition Speed: Stream setting → Slideshow default → 'medium'

### 2. Frequency Setting Not Working
**Problem**: Single-photo and video streams with frequency settings (e.g., "show every 15 slides") were not being inserted at the correct intervals.

**Solution**: Implemented a proper playback sequence builder that:
1. Separates streams by type (slideshow, single-photo, video)
2. Creates a base sequence from slideshow streams
3. Inserts single-photo and video items at their specified frequency intervals

### 3. PostgreSQL JSONB Handling
**Problem**: Settings values from the database were sometimes coming as objects `{type, value, position}` instead of primitives.

**Solution**: Added a `getValue()` helper function that safely extracts primitive values from PostgreSQL JSONB objects.

## How It Works Now

### Stream Types

1. **Slideshow Streams**: Items form the base playback sequence
2. **Single-Photo Streams**: Items are inserted at frequency intervals (default: every 5 slides)
3. **Video Streams**: Items are inserted at frequency intervals (default: every 5 slides)

### Playback Sequence Example

If you have:
- Slideshow stream with 20 photos
- Single-photo stream with 1 photo (frequency: 15)

The sequence will be:
```
1-15: Slideshow photos 1-15
16: Single-photo item
17-30: Slideshow photos 16-20, then 1-10
31: Single-photo item
... and so on
```

### Settings Priority

For each item displayed:
```typescript
// Duration
const duration = 
  currentItem.streamSettings?.duration ||  // 1. Stream setting
  slideshow.settings.duration ||           // 2. Slideshow default
  5;                                       // 3. Fallback

// Transition
const transition = 
  currentItem.streamSettings?.transition || // 1. Stream setting
  slideshow.settings.transition ||          // 2. Slideshow default
  'fade';                                   // 3. Fallback

// Transition Speed
const transitionSpeed = 
  currentItem.streamSettings?.transitionSpeed || // 1. Stream setting
  slideshow.settings.transitionSpeed ||          // 2. Slideshow default
  'medium';                                      // 3. Fallback
```

## Files Modified

### `/src/pages/SlideshowPreview.tsx`
- Added `EnhancedStreamItem` interface to track stream settings with each item
- Added `buildPlaybackSequence()` function to properly sequence items
- Added `getValue()` helper to handle PostgreSQL JSONB objects
- Updated duration, transition, and transitionSpeed to respect stream settings
- Added comprehensive console logging for debugging

### `/src/pages/StreamSettings.tsx`
- Added `getValue()` helper to handle PostgreSQL JSONB objects
- Fixed rendering of `settings.frequency` to safely convert to number
- Added default settings initialization to prevent undefined errors

## Testing

When you preview a slideshow, check the browser console for logs like:

```
SlideshowPreview: Building playback sequence
SlideshowPreview: Total streams: 3
SlideshowPreview: Slideshow streams: 1
SlideshowPreview: Single-photo streams: 1
SlideshowPreview: Video streams: 1
SlideshowPreview: Stream "Ads" (single-photo) has frequency: 15
SlideshowPreview: Inserting frequency item at position 15 (after every 15 slides)
SlideshowPreview: Final sequence has 21 items
SlideshowPreview: Base items: 20 Frequency items inserted: 1

SlideshowPreview: Item 1/21 - Type: slideshow, Duration: 5s
SlideshowPreview: Item 2/21 - Type: slideshow, Duration: 5s
...
SlideshowPreview: Item 15/21 - Type: slideshow, Duration: 5s
SlideshowPreview: Item 16/21 - Type: single-photo, Duration: 3s
```

## Frequency Calculation

The frequency setting determines **after how many base slides** a frequency item appears:

- Frequency = 1: Item appears after every slide
- Frequency = 5: Item appears after every 5 slides (positions 5, 10, 15, 20, ...)
- Frequency = 15: Item appears after every 15 slides (positions 15, 30, 45, ...)

## Notes

- Shuffle only affects slideshow items, not frequency items
- Frequency items maintain their insertion positions even with shuffle enabled
- If there are no slideshow items, frequency items will play in their regular order
- Video items use their natural duration (handled by `onEnded` event)

