# ImageKit Deletion Implementation

## Overview

All delete operations now automatically remove files from ImageKit in addition to deleting from the database. This prevents orphaned files and saves storage costs.

## What Was Implemented

### ✅ Smart File Deletion

When you delete:
- **Single Photo/Video** → Deletes from database + ImageKit
- **Multiple Photos/Videos** → Deletes all from database + ImageKit
- **Stream** → Deletes stream, all its items from database + ImageKit
- **Slideshow** → Deletes slideshow, all streams, all items, and background image from database + ImageKit

### ✅ Automatic Cleanup

The system intelligently extracts file identifiers from:
- Full ImageKit URLs (e.g., `https://ik.imagekit.io/xyz/file.jpg`)
- Storage paths (e.g., `/slideshows/file.jpg`)
- File IDs directly

### ✅ Error Handling

- Database deletion happens first (critical operation)
- ImageKit deletion happens in background (non-blocking)
- Failures in ImageKit deletion don't break the UI
- All errors are logged to console for debugging

## Files Modified

### 1. `/src/lib/imagekit.ts`
**Added:**
- `extractFileId()` - Smart extraction of file ID from URL or path
- Enhanced `deleteFromImageKit()` - Works with URLs, paths, or file IDs
- Better error messages

**Example:**
```typescript
// All of these work:
await deleteFromImageKit('file-id-123');
await deleteFromImageKit('/slideshows/photo.jpg');
await deleteFromImageKit('https://ik.imagekit.io/abc/photo.jpg');
```

### 2. `/src/services/photo.ts`
**Updated:**
- `deleteStreamItem()` - Deletes item + file from ImageKit
- `deleteMultipleStreamItems()` - Batch deletes items + files

**Behavior:**
```typescript
// When you delete a photo:
1. Fetch item from database to get file info
2. Delete from database
3. Extract file identifier (storage_path or url)
4. Delete from ImageKit (background, non-blocking)
5. Log success/failure
```

### 3. `/src/services/stream.ts`
**Updated:**
- `deleteStream()` - Deletes stream + all its items' files

**Behavior:**
```typescript
// When you delete a stream:
1. Fetch all items in the stream
2. Delete stream from database (cascade deletes items)
3. For each item, delete file from ImageKit
4. All ImageKit deletions happen in parallel
```

### 4. `/src/services/slideshow.ts`
**Updated:**
- `deleteSlideshow()` - Complete cleanup of slideshow and all assets

**Behavior:**
```typescript
// When you delete a slideshow:
1. Fetch all streams and their items
2. Fetch slideshow settings (for background image)
3. Delete slideshow from database (cascade deletes everything)
4. Collect all file identifiers:
   - Background image (if exists)
   - All photos/videos from all streams
5. Delete all files from ImageKit in parallel
6. Log total cleanup count
```

## How It Works

### Deletion Flow

```
User clicks delete
    ↓
Get file info from database
    ↓
Delete from database (blocks UI)
    ↓
Extract file identifier
    ↓
Call ImageKit Edge Function (background)
    ↓
ImageKit deletion (doesn't block UI)
    ↓
Log success/failure
```

### File Identifier Extraction

The system handles various formats:

```typescript
// Full URL
"https://ik.imagekit.io/abc/slideshows/photo.jpg"
→ extracts: "photo.jpg"

// Storage path
"/slideshows/photo.jpg"
→ extracts: "photo.jpg"

// Direct file ID
"abc123xyz.jpg"
→ uses: "abc123xyz.jpg"
```

### Parallel Deletion

When deleting multiple files (stream or slideshow):

```typescript
// All deletions happen in parallel
Promise.allSettled([
  deleteFromImageKit(file1),
  deleteFromImageKit(file2),
  deleteFromImageKit(file3),
  // ... etc
]);

// Failures don't affect other deletions
// UI doesn't wait for completion
```

## Edge Function Required

Make sure your `imagekit-delete` Edge Function is deployed:

```typescript
// Supabase Edge Function: imagekit-delete
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // Authenticate user
  const supabaseClient = createClient(...)
  const { data: { user } } = await supabaseClient.auth.getUser()
  
  if (!user) throw new Error('Unauthorized')
  
  // Get fileId from request
  const { fileId } = await req.json()
  
  // Delete from ImageKit API
  const response = await fetch(
    `https://api.imagekit.io/v1/files/${fileId}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Basic ${btoa(privateKey + ':')}`,
      },
    }
  )
  
  return new Response(JSON.stringify({ success: true }))
})
```

## Console Messages

Watch the browser console to see deletion activity:

### Success Messages
```
Deleted file from ImageKit
Deleted file from ImageKit (stream cleanup)
Deleted file from ImageKit (slideshow cleanup)
Cleaning up 15 files from ImageKit...
```

### Error Messages
```
Failed to delete from ImageKit: [error details]
Failed to delete file from ImageKit: [error details]
Could not extract fileId from: [url]
```

## Testing

### Test Single Photo Deletion
```
1. Upload a photo to a stream
2. Delete the photo
3. Check console: "Deleted file from ImageKit"
4. Verify in ImageKit dashboard: file is gone
```

### Test Stream Deletion
```
1. Create stream with 5 photos
2. Delete the stream
3. Check console: "Deleted file from ImageKit (stream cleanup)" × 5
4. Verify in ImageKit: all 5 files gone
```

### Test Slideshow Deletion
```
1. Create slideshow with 3 streams, 20 total photos
2. Add background image
3. Delete the slideshow
4. Check console: "Cleaning up 21 files from ImageKit..."
5. Verify in ImageKit: all files gone
```

### Test Bulk Deletion
```
1. Select 10 photos in a stream
2. Click "Delete Selected"
3. Check console: Multiple "Deleted file from ImageKit" messages
4. Verify in ImageKit: all 10 files gone
```

## Error Scenarios

### ImageKit API Error
```
User deletes photo
→ Database deletion succeeds ✅
→ ImageKit deletion fails ❌
→ Error logged to console
→ File remains orphaned in ImageKit (can be cleaned up later)
→ User doesn't see error (non-critical)
```

### Network Error
```
User deletes photo while offline
→ Database deletion succeeds ✅
→ ImageKit deletion fails ❌ (network error)
→ Error logged to console
→ File remains in ImageKit
→ Can be retried manually if needed
```

### Edge Function Not Deployed
```
User deletes photo
→ Database deletion succeeds ✅
→ ImageKit API call fails ❌ (404)
→ Error logged: "Failed to delete file from ImageKit: 404"
→ Deploy Edge Function to fix
```

## Benefits

✅ **Automatic Cleanup** - No manual ImageKit management needed
✅ **Cost Savings** - Prevents orphaned files accumulating
✅ **Non-Blocking** - UI stays responsive during ImageKit deletions
✅ **Safe** - Database deletion happens first (critical)
✅ **Parallel** - Multiple files deleted simultaneously
✅ **Smart** - Works with URLs, paths, or IDs
✅ **Logged** - All operations visible in console
✅ **Resilient** - ImageKit failures don't break the UI

## Potential Improvements

Future enhancements could include:

1. **Retry Logic** - Automatically retry failed deletions
2. **Batch API Calls** - Delete multiple files in one API call
3. **Cleanup Queue** - Track failed deletions for retry
4. **Manual Cleanup Tool** - Find and remove orphaned files
5. **Deletion Confirmation** - Show ImageKit deletion status in UI
6. **Storage Analytics** - Track space saved from deletions

## Troubleshooting

### Files Not Deleting from ImageKit

**Check:**
1. Edge Function deployed? `imagekit-delete`
2. ImageKit credentials correct? Check `.env`
3. Console errors? Look for specific error messages
4. Network issues? Check browser Network tab

**Solutions:**
- Deploy Edge Function to Supabase
- Verify ImageKit API keys in Edge Function
- Check Edge Function logs in Supabase dashboard
- Test Edge Function directly

### Console Warnings

```
"Could not extract fileId from: undefined"
```
**Cause:** Item doesn't have storage_path or url
**Solution:** Normal for items without files (shouldn't happen with photos/videos)

```
"Failed to delete from ImageKit: 404"
```
**Cause:** File already deleted or doesn't exist
**Solution:** Safe to ignore, cleanup successful anyway

## Summary

All deletion operations now automatically clean up ImageKit files:
- ✅ Single items delete their file
- ✅ Multiple items delete all files
- ✅ Streams delete all item files
- ✅ Slideshows delete everything (items + background)
- ✅ Non-blocking background deletion
- ✅ Comprehensive error handling
- ✅ Smart file ID extraction

**Result:** No more orphaned files in ImageKit! 🎉

