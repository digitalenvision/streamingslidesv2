# Margin/Spacing and Video Playback Fix

## Issues Fixed

### 1. Margin/Spacing Not Applied
**Problem**: The slideshow settings margin/spacing wasn't being properly applied to the content area in preview mode.

**Root Cause**: Using `padding` with percentage on a container with `inset-0` didn't properly create the margin effect because the inner content was still constrained to `max-w-full max-h-full`.

**Solution**: Changed from using `padding` to explicitly setting `top`, `left`, `right`, and `bottom` with the margin percentage. This creates proper spacing on all sides:

```typescript
// Before
style={{ padding: `${margin}%` }}
className="max-w-full max-h-full"

// After
style={{ 
  top: `${margin}%`,
  left: `${margin}%`,
  right: `${margin}%`,
  bottom: `${margin}%`,
}}
className="w-full h-full"
```

### 2. Video Playback Enhancement
**Problem**: Videos should play for their complete duration and then transition to the next slide, but this behavior needed verification.

**How It Works**:
- Videos use the HTML5 `<video>` element with `autoPlay`
- The `onEnded` event triggers `handleNext()` to advance to the next slide
- Videos do NOT use the timer system (unlike photos)
- The timer is explicitly skipped for video items in the auto-advance logic

**Enhancements Added**:
1. **Error handling**: If a video fails to load, it automatically skips to the next slide
2. **Playback attributes**:
   - `muted={false}` - Videos play with audio
   - `playsInline` - Important for mobile devices
3. **Debug logging**: Console logs show:
   - When video loads (with duration)
   - When video starts playing
   - When video ends
   - Any playback errors

## Testing

### Test Margin/Spacing

1. Go to Slideshow Settings
2. Set the margin slider to a value (e.g., 10%)
3. Preview the slideshow
4. You should see visible spacing/border around all content (photos and videos)
5. Try different margin values (0%, 5%, 15%, 20%) to see the effect

**What you'll see**:
- 0%: Content fills entire screen
- 10%: 10% spacing on all sides
- 20%: 20% spacing on all sides (significant border)

### Test Video Playback

1. Add a video to a stream
2. Preview the slideshow
3. Open the browser console (F12)
4. When the video plays, you'll see:

```
SlideshowPreview: Item 5/20 - Type: video, Duration: 0s
SlideshowPreview: Video loaded, duration: 12.34s
SlideshowPreview: Video started playing
... (video plays for 12.34 seconds) ...
SlideshowPreview: Video ended, advancing to next slide
SlideshowPreview: Item 6/20 - Type: slideshow, Duration: 5s
```

**Expected behavior**:
- Video plays completely (full duration)
- No timer countdown during video playback
- After video ends, transitions to next slide
- Next photo uses its configured duration (e.g., 5s)

### Test Video with Frequency Setting

1. Create a video stream with frequency = 10
2. Add a video to it
3. Preview slideshow
4. The video should:
   - Appear after every 10 slides
   - Play for its full duration
   - Then continue with regular slides

## Code Changes

### `/src/pages/SlideshowPreview.tsx`

**Margin Fix** (lines 478-486):
```typescript
<div
  className="absolute flex items-center justify-center"
  style={{ 
    top: `${margin}%`,
    left: `${margin}%`,
    right: `${margin}%`,
    bottom: `${margin}%`,
  }}
>
```

**Video Enhancements** (lines 495-515):
```typescript
<video
  ref={videoRef}
  src={currentUrl}
  className="max-w-full max-h-full object-contain"
  autoPlay
  muted={false}
  playsInline
  onLoadedMetadata={(e) => {
    const video = e.currentTarget;
    console.log(`Video loaded, duration: ${video.duration.toFixed(2)}s`);
  }}
  onPlay={() => {
    console.log('Video started playing');
  }}
  onEnded={handleVideoEnded}
  onError={(e) => {
    console.error('Video playback error:', e);
    handleNext();
  }}
/>
```

**Video Timer Logic** (lines 93-99):
```typescript
const currentItem = allItems[currentIndex];
const isVideoItem = currentItem.type === 'video';

if (isVideoItem) {
  // Video will trigger next on ended event
  return;
}
```

## How Video Playback Works

1. **Item Detection**: The preview checks if current item type is `'video'`
2. **Timer Skip**: If it's a video, the auto-advance timer is NOT set
3. **Autoplay**: Video element has `autoPlay` attribute, starts immediately
4. **Playback**: Video plays for its full natural duration
5. **End Event**: When video ends, `onEnded` fires and calls `handleNext()`
6. **Transition**: Next item displays with its transition effect
7. **Resume Timer**: If next item is a photo, timer resumes based on its duration

## Duration Priority for Videos

Videos ignore all duration settings and play for their natural length:
- Stream duration setting: **Ignored**
- Slideshow default duration: **Ignored**
- Video natural duration: **Used** ✓

For photos:
1. Stream duration setting
2. Slideshow default duration
3. Fallback: 5 seconds

## Visual Effect Examples

### Margin = 0%
```
┌─────────────────────────────────┐
│                                 │
│         [FULL CONTENT]          │
│                                 │
└─────────────────────────────────┘
```

### Margin = 10%
```
┌─────────────────────────────────┐
│ ┌─────────────────────────────┐ │
│ │                             │ │
│ │       [CONTENT]             │ │
│ │                             │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

### Margin = 20%
```
┌─────────────────────────────────┐
│   ┌─────────────────────────┐   │
│   │                         │   │
│   │     [CONTENT]           │   │
│   │                         │   │
│   └─────────────────────────┘   │
└─────────────────────────────────┘
```

## Troubleshooting

### Video Not Playing
1. Check browser console for errors
2. Verify video URL is accessible
3. Check video format (MP4 is most compatible)
4. Some browsers may block autoplay with sound - this is expected

### Video Skips Immediately
1. Check console for "Video playback error"
2. Verify video file exists in ImageKit
3. Check network tab for 404 errors
4. Video might be corrupted or unsupported format

### Margin Not Visible
1. Check slideshow settings - margin might be set to 0
2. Verify the value in the database
3. Try a larger margin value (15-20%) to see the effect clearly
4. Check that you're previewing, not editing

### Video Plays Muted
- Check the `muted` attribute on the video element
- Should be `muted={false}` for audio playback
- Some browsers may require user interaction before allowing audio

