# Deploy Supabase Edge Functions

## Prerequisites

1. **Supabase CLI installed**
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase**
   ```bash
   supabase login
   ```
   This will open a browser to authenticate.

3. **Link your project**
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```
   Get your project ref from: Supabase Dashboard → Project Settings → General → Reference ID

## Deploy Edge Functions

### Option 1: Deploy Both Functions at Once

```bash
# Deploy imagekit-auth function
supabase functions deploy imagekit-auth

# Deploy imagekit-delete function
supabase functions deploy imagekit-delete
```

### Option 2: Use the Deploy Script

```bash
chmod +x deploy-functions.sh
./deploy-functions.sh
```

## Set Edge Function Secrets

After deploying, you need to set the ImageKit credentials as secrets:

```bash
# Set ImageKit Private Key
supabase secrets set IMAGEKIT_PRIVATE_KEY=your_imagekit_private_key_here

# Set ImageKit Public Key
supabase secrets set IMAGEKIT_PUBLIC_KEY=your_imagekit_public_key_here
```

**Get your ImageKit keys from:**
ImageKit Dashboard → Developer Options → API Keys

## Verify Deployment

1. **Check Functions in Dashboard**
   - Go to: Supabase Dashboard → Edge Functions
   - You should see `imagekit-auth` and `imagekit-delete`

2. **Test the Functions**
   ```bash
   # Test imagekit-auth
   curl -i --location --request GET 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/imagekit-auth' \
     --header 'Authorization: Bearer YOUR_ANON_KEY'

   # Should return: { token, expire, signature }
   ```

3. **Check in Your App**
   - Upload a photo → Should work
   - Delete a photo → Check console for "Deleted file from ImageKit"

## Troubleshooting

### Error: "Supabase CLI not found"
```bash
npm install -g supabase
```

### Error: "Not logged in"
```bash
supabase login
```

### Error: "Project not linked"
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

### Error: "ImageKit credentials not configured"
```bash
# Make sure you set the secrets:
supabase secrets set IMAGEKIT_PRIVATE_KEY=your_key
supabase secrets set IMAGEKIT_PUBLIC_KEY=your_key
```

### View Function Logs
```bash
# View logs for imagekit-delete
supabase functions logs imagekit-delete

# Follow logs in real-time
supabase functions logs imagekit-delete --follow
```

## What These Functions Do

### imagekit-auth
- Generates authentication parameters for ImageKit uploads
- Required for: Photo/video uploads
- Called automatically when you upload media

### imagekit-delete
- Deletes files from ImageKit storage
- Required for: Cleaning up deleted photos/videos
- Called automatically when you delete content

## Environment Variables Required

In your Edge Functions (they're set via `supabase secrets set`):

```
IMAGEKIT_PRIVATE_KEY=private_xyz123...
IMAGEKIT_PUBLIC_KEY=public_abc456...
SUPABASE_URL=https://xxx.supabase.co (auto-provided)
SUPABASE_ANON_KEY=eyJhb... (auto-provided)
```

## Manual Deployment Steps

If the automatic script doesn't work, deploy manually:

### 1. Navigate to project
```bash
cd /Users/juliendebats/Desktop/slide
```

### 2. Deploy imagekit-auth
```bash
supabase functions deploy imagekit-auth --no-verify-jwt
```

### 3. Deploy imagekit-delete
```bash
supabase functions deploy imagekit-delete --no-verify-jwt
```

### 4. Set secrets
```bash
supabase secrets set IMAGEKIT_PRIVATE_KEY=your_private_key
supabase secrets set IMAGEKIT_PUBLIC_KEY=your_public_key
```

## Updating Functions

To update after making changes:

```bash
# Redeploy the function
supabase functions deploy imagekit-delete

# Or redeploy both
supabase functions deploy imagekit-auth
supabase functions deploy imagekit-delete
```

## Success Indicators

✅ Functions appear in Supabase Dashboard → Edge Functions
✅ Upload photos works without errors
✅ Delete photos shows "Deleted file from ImageKit" in console
✅ Files disappear from ImageKit dashboard after deletion

## Next Steps

After deployment:
1. Test photo upload in your app
2. Test photo deletion and check console
3. Verify files are removed from ImageKit dashboard
4. Check Edge Function logs if any issues occur

---

**Need Help?** Check the function logs:
```bash
supabase functions logs imagekit-auth --follow
supabase functions logs imagekit-delete --follow
```

