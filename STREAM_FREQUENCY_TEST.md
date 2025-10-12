# Stream Frequency Testing Guide

## Quick Test Steps

### 1. Setup Test Slideshow

1. Create a new slideshow
2. Create a slideshow stream with at least 20-30 photos
3. Create a single-photo stream with 1 photo
4. Go to the single-photo stream settings
5. Set the frequency to 15 (or any other value you want to test)

### 2. Preview and Verify

1. Click "Preview" on your slideshow
2. Open the browser console (F12)
3. Look for these logs:

```
SlideshowPreview: Building playback sequence
SlideshowPreview: Stream "Your Stream Name" (single-photo) has frequency: 15
SlideshowPreview: Inserting frequency item at position 15 (after every 15 slides)
SlideshowPreview: Final sequence has X items
```

4. Watch the slideshow play:
   - Count the slides
   - The single-photo should appear after exactly 15 regular slides
   - Then again after another 15 slides, etc.

### 3. Check Duration Settings

1. Set a custom duration on the single-photo stream (e.g., 10 seconds)
2. Set a different duration on the slideshow stream (e.g., 3 seconds)
3. Preview and watch the console:

```
SlideshowPreview: Item 1/X - Type: slideshow, Duration: 3s
SlideshowPreview: Item 2/X - Type: slideshow, Duration: 3s
...
SlideshowPreview: Item 15/X - Type: slideshow, Duration: 3s
SlideshowPreview: Item 16/X - Type: single-photo, Duration: 10s
```

4. Verify that:
   - Regular photos display for 3 seconds
   - The single-photo displays for 10 seconds

### 4. Test Multiple Frequency Streams

1. Create another single-photo or video stream
2. Set a different frequency (e.g., 5)
3. Preview and verify both frequency items appear at their correct intervals

Expected behavior:
```
Slides 1-4: Regular photos
Slide 5: Second frequency item (freq=5)
Slides 6-9: Regular photos
Slide 10: Second frequency item (freq=5)
Slides 11-14: Regular photos
Slide 15: Both frequency items (freq=5 and freq=15)
Slide 16: Second frequency item (freq=5)
...
```

### 5. Test Transition Settings

1. Set a custom transition on a stream (e.g., "slide-left" with "slow" speed)
2. Preview and verify the transition is applied to items from that stream
3. Items from other streams should use their own transitions

## What to Look For

### ✅ Correct Behavior
- Frequency items appear at exact intervals
- Each stream's duration settings are respected
- Each stream's transition settings are respected
- Console logs show correct frequency calculations
- Shuffle only affects slideshow items, not frequency positions

### ❌ Incorrect Behavior
- Frequency items appearing at wrong positions
- All items using the same duration
- Frequency items not appearing at all
- Errors in the console about undefined properties

## Debug Tips

If something isn't working:

1. **Check the console logs** - they show exactly when and where items are inserted
2. **Verify stream settings** - make sure frequency is actually saved (not just displayed)
3. **Check item counts** - the logs show how many items are in each stream
4. **Test with simple setup** - start with just 1 slideshow stream and 1 single-photo stream

## Example Test Scenario

**Setup:**
- Slideshow stream: 30 photos, duration=3s, transition=fade
- Single-photo stream: 1 photo, duration=10s, frequency=15, transition=zoom

**Expected Result:**
- Photos 1-15: Slideshow photos (3s each, fade transition)
- Photo 16: Single-photo (10s, zoom transition)
- Photos 17-30: Slideshow photos (3s each, fade transition)
- Photo 31: Single-photo again (10s, zoom transition)
- Loop continues...

**Total sequence:** 32 items (30 base + 2 frequency insertions)

## Common Issues

### Issue: Frequency item not appearing
- **Check:** Does the single-photo stream have items?
- **Check:** Is the frequency value actually saved in the database?
- **Check:** Are there enough base slides? (Need at least `frequency` slides)

### Issue: Settings not applied
- **Check:** Console shows `undefined` for stream settings
- **Fix:** The `getValue()` helper should handle this
- **Verify:** Check that settings are saved in the stream

### Issue: Blank page on settings
- **Fix:** Already fixed with default settings initialization
- **Verify:** Check console for errors about undefined properties

