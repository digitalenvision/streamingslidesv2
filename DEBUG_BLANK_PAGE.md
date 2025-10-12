# Debug: Blank Page Issue

## Quick Fix Steps

### 1. Check Browser Console
1. Press `F12` (or `Cmd+Option+I` on Mac) to open DevTools
2. Click on the **Console** tab
3. Look for any red error messages
4. **Copy the exact error message** and share it

### 2. Common Causes & Solutions

#### Error: "Cannot read property 'X' of undefined"
**Cause:** The slideshow data structure doesn't match what the component expects

**Solution:** The slideshow might not have been created with proper default settings. I've just updated the code to handle this better.

#### Error: Related to ImageKit or uploadToImageKit
**Cause:** ImageKit configuration missing or Edge Functions not deployed

**Solution:** 
1. Check your `.env` has all ImageKit variables
2. Deploy the `imagekit-auth` Edge Function to Supabase

#### Error: Supabase related
**Cause:** Database not set up or RLS policies blocking access

**Solution:**
1. Make sure you ran the database setup SQL in Supabase
2. Check that RLS policies allow the current user to access the slideshow

### 3. Clear Browser State

Sometimes cached bad data causes issues:

```
1. Open DevTools (F12)
2. Go to Application tab
3. Click "Clear site data"
4. Refresh the page
```

### 4. Test with Fresh Slideshow

Try creating a brand new slideshow:
1. Go to Dashboard
2. Create new slideshow
3. Try accessing settings for the NEW slideshow

### 5. Check Network Tab

1. Open DevTools → Network tab
2. Navigate to the settings page
3. Look for any failed requests (red status codes)
4. Click on failed requests to see error details

## What I Just Fixed

I updated the `SlideshowSettings.tsx` page to:

1. ✅ Add default settings fallback
2. ✅ Properly merge settings with defaults
3. ✅ Add better error handling
4. ✅ Add console logging for debugging
5. ✅ Safely handle missing or malformed settings

## Next Steps

After the fix, try:

1. **Hard refresh** the page: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
2. If still blank, check the console and **tell me the exact error message**
3. The error message will help me identify the exact issue

## Example of What to Look For

Good info to share:
```
Error: Cannot read properties of undefined (reading 'background')
  at SlideshowSettings.tsx:153
```

or

```
Uncaught TypeError: settings.margin is undefined
  at SlideshowSettings.tsx:336
```

## Temporary Workaround

If you need to test other features while we fix this:

1. **Skip Settings page** - use the builder directly
2. Settings will use defaults automatically
3. Focus on testing uploads, preview, and caching features

Let me know what error you see in the console! 🔍

