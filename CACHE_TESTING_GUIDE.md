# Cache System Testing Guide

## Quick Testing Steps

### 1. Test Initial Caching

1. **Open a slideshow preview** (first time)
   - Watch the loading progress bar
   - Note: "Preloading content... X%"
   - Should take a few seconds depending on image count

2. **Check Network Tab** (DevTools)
   - Open browser DevTools (F12)
   - Go to Network tab
   - Should see ImageKit requests for each image

### 2. Test Cached Loading

1. **Refresh the preview** (or close and reopen)
   - Should load almost instantly
   - No progress bar (already cached)

2. **Check Network Tab**
   - Filter by "Img" or "imagekit.io"
   - Should see ZERO ImageKit requests
   - All images loaded from cache

### 3. Test Cache Statistics

1. **Go to Settings page**
2. **Check Cache Management section**
   - Should show cache size (e.g., "2.5 MB")
   - Should show image count (e.g., "45 images")
   - Should show compression savings (e.g., "Space saved: 25.3%")

### 4. Test Cache Clearing

1. **Click "Clear All Cached Images"**
   - Wait for success message
   - Cache size should reset to "0 Bytes"
   - Image count should reset to "0 images"

2. **Return to slideshow preview**
   - Should show progress bar again (re-caching)
   - Network tab should show ImageKit requests again

### 5. Test Offline Mode

1. **Load a slideshow preview** (ensure it's cached)
2. **Open DevTools → Network tab**
3. **Enable "Offline" mode** (throttling dropdown)
4. **Refresh the preview**
   - Should still load and display images
   - Works completely offline!

## Expected Results

### ✅ Success Indicators

**Initial Load:**
- Progress bar displays: "Preloading content... X%"
- Network requests to ImageKit visible
- Images display correctly
- Preview works normally

**Cached Load:**
- No progress bar (instant load)
- Zero ImageKit network requests
- Images display correctly
- Load time < 500ms

**Statistics:**
- Cache size shown (e.g., "2.5 MB")
- Image count shown (e.g., "45")
- Compression ratio > 0% (typically 10-30%)
- Green banner showing space saved

**Offline Mode:**
- Images load without internet
- Preview fully functional
- No network errors

### ❌ Failure Indicators

**If you see these, something's wrong:**
- Progress bar stuck at 0%
- Network requests on every load
- Cache size always shows "0 Bytes"
- Images don't load offline
- Console errors about IndexedDB

## Detailed Test Scenarios

### Scenario 1: New Slideshow

```
1. Create new slideshow
2. Add 10 photos
3. Open preview
   → Should cache all 10 images
4. Check Settings
   → Should show ~10 images cached
5. Reload preview
   → Should load instantly from cache
```

### Scenario 2: Large Slideshow

```
1. Open slideshow with 50+ images
2. Watch progress bar
   → Should increment smoothly
3. Wait for completion
4. Check cache size in Settings
   → Should show MB of data
5. Test offline mode
   → All images should work
```

### Scenario 3: Mixed Content

```
1. Create slideshow with:
   - Photos (various formats)
   - Videos
2. Open preview
   → Both photos and videos cached
3. Check compression
   → Should see savings on photos
4. Reload
   → Instant load
```

### Scenario 4: Browser Restart

```
1. Cache a slideshow
2. Close browser completely
3. Reopen browser
4. Load same slideshow
   → Should load from cache (no network)
5. Verify persistence works
```

## Performance Benchmarks

### Expected Performance

**Initial Load (10 images, ~500KB each):**
- Total time: 5-10 seconds
- Network time: 3-5 seconds
- Compression time: 2-5 seconds

**Cached Load (same slideshow):**
- Total time: 0.5-1 second
- Network time: 0 seconds
- Load from cache: 0.5-1 second

**Improvement: 5-10x faster**

### Cache Size Benchmarks

**Typical slideshows:**
- 10 images (PNG): 3-5 MB → 2-4 MB (20-25% savings)
- 50 images (mixed): 15-20 MB → 12-16 MB (20-25% savings)
- 100 images (PNG): 30-40 MB → 24-30 MB (20-25% savings)

## Browser DevTools Tips

### View IndexedDB

1. Open DevTools (F12)
2. Go to "Application" tab
3. Expand "IndexedDB"
4. Look for "streaming-slides-cache"
5. Expand to see:
   - images (cached image data)
   - metadata (cache statistics)

### Monitor Network

1. Open DevTools (F12)
2. Go to "Network" tab
3. Filter by "Img" or "XHR"
4. Watch for imagekit.io requests
5. Compare first load vs. cached load

### Check Storage Usage

1. DevTools → Application tab
2. Look at "Storage" section
3. See total usage
4. Compare with cache statistics

## Troubleshooting

### Problem: Cache Not Working

**Check:**
1. IndexedDB enabled in browser
2. Sufficient storage quota
3. No private/incognito mode
4. Console for errors

**Solution:**
- Clear site data
- Disable extensions
- Try different browser
- Check quota limits

### Problem: Slow Performance

**Check:**
1. Image sizes (should use thumbnails)
2. Number of images (consider pagination)
3. Network speed
4. Device performance

**Solution:**
- Use smaller images
- Limit items per slideshow
- Optimize ImageKit settings
- Enable lazy loading

### Problem: Images Not Displaying

**Check:**
1. Image URLs valid
2. CORS headers correct
3. Network connectivity
4. Console errors

**Solution:**
- Verify ImageKit URLs
- Check CORS configuration
- Test direct image access
- Clear cache and retry

## Console Commands

Test cache directly in browser console:

```javascript
// Import cache manager
import { imageCache } from '@/lib/imageCache';

// Get statistics
const stats = await imageCache.getStats();
console.log(stats);

// Check if URL is cached
const isCached = await imageCache.isCached('https://...');
console.log('Cached:', isCached);

// Get all cached URLs
const urls = await imageCache.getAllCachedUrls();
console.log('Cached URLs:', urls.length);

// Clear cache
await imageCache.clear();
console.log('Cache cleared');
```

## Automated Testing

### Test Script (for future implementation)

```javascript
// Test cache functionality
async function testCache() {
  const testUrl = 'https://test-image.jpg';
  
  // Test 1: Cache image
  console.log('Test 1: Caching image...');
  const cached = await imageCache.cacheImage(testUrl);
  console.assert(cached, 'Should return object URL');
  
  // Test 2: Verify cached
  console.log('Test 2: Checking if cached...');
  const isCached = await imageCache.isCached(testUrl);
  console.assert(isCached, 'Should be cached');
  
  // Test 3: Get from cache
  console.log('Test 3: Getting from cache...');
  const url = await imageCache.get(testUrl);
  console.assert(url, 'Should return object URL');
  
  // Test 4: Statistics
  console.log('Test 4: Getting stats...');
  const stats = await imageCache.getStats();
  console.assert(stats.imageCount > 0, 'Should have images');
  
  // Test 5: Clear
  console.log('Test 5: Clearing cache...');
  await imageCache.clear();
  const statsAfter = await imageCache.getStats();
  console.assert(statsAfter.imageCount === 0, 'Should be empty');
  
  console.log('All tests passed! ✅');
}
```

## Success Criteria

Cache system is working correctly if:

✅ Initial load caches all images with progress
✅ Subsequent loads use cache (zero network)
✅ Statistics show cached data
✅ Compression savings displayed
✅ Clear cache works
✅ Offline mode works
✅ Cache persists after browser restart
✅ No console errors
✅ Performance improvement visible

## Next Steps After Testing

1. **Monitor in Production**
   - Track cache hit rates
   - Monitor storage usage
   - Collect performance metrics

2. **User Feedback**
   - Survey load time improvements
   - Ask about offline usage
   - Gather feature requests

3. **Optimization**
   - Adjust cache strategies
   - Optimize compression
   - Improve preloading

## Quick Reference

**Open Slideshow Preview:**
`http://localhost:5173/preview/{slideshow-id}`

**Open Settings:**
`http://localhost:5173/settings`

**Enable DevTools:**
`F12` or `Cmd+Option+I` (Mac)

**Enable Offline Mode:**
DevTools → Network → Throttling → Offline

**View IndexedDB:**
DevTools → Application → IndexedDB

**Clear Site Data:**
DevTools → Application → Clear storage

---

**Happy Testing! 🚀**

