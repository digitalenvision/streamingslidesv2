# Manual Deployment Steps - Run These Commands

## ✅ Supabase CLI is Already Installed!

Version 2.48.3 is installed at `~/.local/bin/supabase`

---

## 🚀 Follow These Steps in Your Terminal

### Step 1: Login to Supabase

Open your terminal and run:

```bash
supabase login
```

This will:
1. Open your browser
2. Ask you to login to Supabase
3. Grant access to the CLI

### Step 2: Get Your Project Reference ID

1. Go to: https://supabase.com/dashboard
2. Select your project
3. Click **Settings** → **General**
4. Copy the **Reference ID** (looks like: `abcdefghijklmnop`)

### Step 3: Link Your Project

In terminal, run (replace with your actual project ref):

```bash
cd /Users/juliendebats/Desktop/slide
supabase link --project-ref YOUR_PROJECT_REF_HERE
```

Example:
```bash
supabase link --project-ref abcdefghijklmnop
```

### Step 4: Deploy Edge Functions

Run the deployment script:

```bash
./deploy-functions.sh
```

**OR** deploy manually:

```bash
supabase functions deploy imagekit-auth
supabase functions deploy imagekit-delete
```

### Step 5: Set ImageKit Secrets

Get your keys from: https://imagekit.io/dashboard → Developer Options → API Keys

Then run:

```bash
supabase secrets set IMAGEKIT_PRIVATE_KEY=your_private_key_here
supabase secrets set IMAGEKIT_PUBLIC_KEY=your_public_key_here
```

**Example:**
```bash
supabase secrets set IMAGEKIT_PRIVATE_KEY=private_Abc123XyZ...
supabase secrets set IMAGEKIT_PUBLIC_KEY=public_Xyz789AbC...
```

---

## ✅ Verify Deployment

### Check in Supabase Dashboard:
1. Go to: https://supabase.com/dashboard
2. Select your project
3. Click **Edge Functions** in sidebar
4. You should see:
   - ✅ `imagekit-auth`
   - ✅ `imagekit-delete`

### Test in Your App:
1. Upload a photo
2. Delete the photo
3. Open browser console (F12)
4. Look for: `"Deleted file from ImageKit"` ✅

---

## 🎉 Done!

Your Edge Functions are deployed and ready to use!

---

## Commands Summary (Copy & Paste)

```bash
# 1. Login
supabase login

# 2. Link project (replace YOUR_PROJECT_REF)
cd /Users/juliendebats/Desktop/slide
supabase link --project-ref YOUR_PROJECT_REF

# 3. Deploy functions
./deploy-functions.sh

# 4. Set secrets (replace with your actual keys)
supabase secrets set IMAGEKIT_PRIVATE_KEY=your_private_key
supabase secrets set IMAGEKIT_PUBLIC_KEY=your_public_key
```

---

## Troubleshooting

### Can't find supabase command?
Restart your terminal or run:
```bash
export PATH="$HOME/.local/bin:$PATH"
```

### Need to see function logs?
```bash
supabase functions logs imagekit-delete --follow
```

### Functions not working?
1. Check they're deployed: Supabase Dashboard → Edge Functions
2. Check secrets are set: Run `supabase secrets list`
3. Check function logs: `supabase functions logs imagekit-delete`

---

## What You're Deploying

- **imagekit-auth**: Generates auth tokens for uploading files
- **imagekit-delete**: Deletes files from ImageKit when you delete content

Both are located in: `/Users/juliendebats/Desktop/slide/supabase/functions/`

