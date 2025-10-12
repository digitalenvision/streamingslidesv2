# Quick Setup Guide - Deploy Edge Functions

## Step-by-Step Instructions

### 1️⃣ Install Supabase CLI (if not already installed)

```bash
npm install -g supabase
```

### 2️⃣ Login to Supabase

```bash
supabase login
```

This will open your browser. Login with your Supabase account.

### 3️⃣ Get Your Project Reference ID

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **General**
4. Copy the **Reference ID** (looks like: `abcdefghijklmno`)

### 4️⃣ Link Your Project

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Replace `YOUR_PROJECT_REF` with the Reference ID from step 3.

### 5️⃣ Deploy the Edge Functions

**Option A: Use the automated script**
```bash
./deploy-functions.sh
```

**Option B: Deploy manually**
```bash
supabase functions deploy imagekit-auth
supabase functions deploy imagekit-delete
```

### 6️⃣ Set ImageKit Secrets

Get your ImageKit keys from: https://imagekit.io/dashboard → Developer Options → API Keys

```bash
supabase secrets set IMAGEKIT_PRIVATE_KEY=your_imagekit_private_key_here
supabase secrets set IMAGEKIT_PUBLIC_KEY=your_imagekit_public_key_here
```

**Example:**
```bash
supabase secrets set IMAGEKIT_PRIVATE_KEY=private_xyz123abc456...
supabase secrets set IMAGEKIT_PUBLIC_KEY=public_abc789xyz123...
```

### 7️⃣ Verify Deployment

Check your Supabase Dashboard:
1. Go to **Edge Functions** section
2. You should see:
   - ✅ `imagekit-auth`
   - ✅ `imagekit-delete`

### 8️⃣ Test in Your App

1. Upload a photo in your app
2. Delete the photo
3. Open browser console (F12)
4. You should see: `"Deleted file from ImageKit"`

## 🎉 Done!

Your Edge Functions are now deployed and ready to use!

---

## Troubleshooting

### "command not found: supabase"
Install the CLI: `npm install -g supabase`

### "Not logged in"
Run: `supabase login`

### "Project not linked"
Run: `supabase link --project-ref YOUR_PROJECT_REF`

### "ImageKit credentials not configured"
Set secrets:
```bash
supabase secrets set IMAGEKIT_PRIVATE_KEY=your_key
supabase secrets set IMAGEKIT_PUBLIC_KEY=your_key
```

### View Logs
```bash
supabase functions logs imagekit-delete --follow
```

---

## What You Just Deployed

✅ **imagekit-auth** - Generates auth tokens for uploading to ImageKit
✅ **imagekit-delete** - Deletes files from ImageKit when you delete content

Both functions are now running on Supabase's edge network! 🚀

