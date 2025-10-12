# Vercel Deployment Guide

## ✅ Code Pushed to GitHub!

Your code is now available at:
**https://github.com/digitalenvision/streamingslidesv2**

---

## 🚀 Deploy to Vercel

### Step 1: Go to Vercel

1. Visit: **https://vercel.com**
2. Sign in with your GitHub account

### Step 2: Import Your Repository

1. Click **"Add New..."** → **"Project"**
2. Select **"Import Git Repository"**
3. Find and select: **`digitalenvision/streamingslidesv2`**
4. Click **"Import"**

### Step 3: Configure Build Settings

Vercel should auto-detect these settings, but verify:

- **Framework Preset**: `Vite`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### Step 4: Add Environment Variables

Click **"Environment Variables"** and add these:

#### Required Variables:

```plaintext
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
VITE_IMAGEKIT_PUBLIC_KEY=your_imagekit_public_key
VITE_IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_id
```

#### Where to Get These:

**Supabase Variables:**
1. Go to: https://supabase.com/dashboard
2. Select your project
3. Click **Settings** → **API**
4. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

**ImageKit Variables:**
1. Go to: https://imagekit.io/dashboard
2. Click **Developer Options** → **API Keys**
3. Copy:
   - **Public Key** → `VITE_IMAGEKIT_PUBLIC_KEY`
   - **URL Endpoint** → `VITE_IMAGEKIT_URL_ENDPOINT`

### Step 5: Deploy!

1. Click **"Deploy"**
2. Wait 2-3 minutes for build to complete
3. Your app will be live at: `https://your-project.vercel.app`

---

## 🔧 Post-Deployment Configuration

### Update Supabase Allowed URLs

1. Go to: https://supabase.com/dashboard
2. Select your project
3. Go to **Authentication** → **URL Configuration**
4. Add your Vercel URL to:
   - **Site URL**: `https://your-project.vercel.app`
   - **Redirect URLs**: `https://your-project.vercel.app/**`

### Update ImageKit CORS Settings (if needed)

1. Go to: https://imagekit.io/dashboard
2. Click **Settings** → **CORS**
3. Add your Vercel domain: `https://your-project.vercel.app`

---

## 📝 Custom Domain (Optional)

### Add Custom Domain:

1. In Vercel dashboard, go to **Settings** → **Domains**
2. Click **"Add"**
3. Enter your domain (e.g., `slides.yourdomain.com`)
4. Follow DNS configuration instructions
5. Update Supabase allowed URLs with your custom domain

---

## 🔄 Automatic Deployments

Vercel is now connected to your GitHub repository!

### Every time you push to GitHub:
```bash
git add .
git commit -m "Your commit message"
git push
```

Vercel will automatically:
- ✅ Detect the push
- ✅ Build your app
- ✅ Deploy to production
- ✅ Send you a notification

### Preview Deployments:
- Every pull request gets its own preview URL
- Test changes before merging to main

---

## 📊 Monitoring & Analytics

### Built-in Vercel Features:
- **Analytics**: Track page views, performance
- **Logs**: View runtime logs and errors
- **Performance**: Monitor Core Web Vitals
- **Deployment History**: Rollback to previous versions

Access these in your Vercel project dashboard.

---

## ✅ SPA Routing Fix

The project includes a `vercel.json` file that fixes the common 404 error on page refresh. This ensures all routes are handled by React Router, not Vercel's file system.

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

This means:
- ✅ Page refreshes work on any route
- ✅ Direct URL access works
- ✅ Browser back/forward buttons work
- ✅ Shared links work correctly

---

## 🐛 Troubleshooting

### Build Fails?

**Check these:**
1. Environment variables are set correctly
2. All dependencies in `package.json` are correct
3. Check build logs for specific errors

**Common fixes:**
```bash
# Locally test the build
npm run build

# If it fails, fix the errors and push again
git add .
git commit -m "Fix build errors"
git push
```

### App Loads But Features Don't Work?

**Check:**
1. Environment variables are set in Vercel
2. Supabase URL is correct
3. ImageKit keys are correct
4. Browser console for errors (F12)

### Authentication Issues?

**Make sure:**
1. Supabase allowed URLs include your Vercel domain
2. Redirect URLs are configured correctly
3. Clear cookies and try again

### Images Not Loading?

**Verify:**
1. ImageKit public key is correct
2. ImageKit CORS allows your domain
3. Image URLs are accessible

---

## 🎯 Production Checklist

Before going live, ensure:

- ✅ All environment variables set in Vercel
- ✅ Supabase allowed URLs configured
- ✅ ImageKit CORS configured
- ✅ Custom domain configured (if applicable)
- ✅ Edge Functions deployed to Supabase
- ✅ Database tables and policies set up
- ✅ Test full user flow:
  - Sign up / Login
  - Create slideshow
  - Upload photos
  - Preview slideshow
  - Delete content

---

## 📱 Vercel CLI (Optional)

Install Vercel CLI for advanced deployment:

```bash
npm i -g vercel

# Login
vercel login

# Deploy from command line
vercel

# Deploy to production
vercel --prod
```

---

## 🔐 Security Best Practices

### Environment Variables:
- ✅ NEVER commit `.env` to Git (already in `.gitignore`)
- ✅ Use Vercel's environment variable encryption
- ✅ Rotate keys if accidentally exposed

### Supabase:
- ✅ Row Level Security (RLS) policies enabled
- ✅ Only allow authenticated users to access data
- ✅ Validate all inputs on backend

### ImageKit:
- ✅ Use Edge Function for private key operations
- ✅ Public key is safe to expose in frontend
- ✅ Implement upload restrictions if needed

---

## 🎉 You're Live!

Your app is now deployed and accessible worldwide!

**Next steps:**
1. Share your app URL
2. Monitor usage in Vercel dashboard
3. Set up custom domain if desired
4. Keep pushing updates - they auto-deploy!

---

## 📚 Useful Links

- **GitHub Repo**: https://github.com/digitalenvision/streamingslidesv2
- **Vercel Dashboard**: https://vercel.com/dashboard
- **Supabase Dashboard**: https://supabase.com/dashboard
- **ImageKit Dashboard**: https://imagekit.io/dashboard
- **Vercel Docs**: https://vercel.com/docs

