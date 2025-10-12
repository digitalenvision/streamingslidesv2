#!/bin/bash

# Deploy Supabase Edge Functions
# Make sure you're logged in: supabase login
# Make sure project is linked: supabase link --project-ref YOUR_PROJECT_REF

echo "🚀 Deploying Supabase Edge Functions..."
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found!"
    echo "Install it with: npm install -g supabase"
    exit 1
fi

echo "✅ Supabase CLI found"
echo ""

# Deploy imagekit-auth function
echo "📦 Deploying imagekit-auth..."
supabase functions deploy imagekit-auth --no-verify-jwt

if [ $? -eq 0 ]; then
    echo "✅ imagekit-auth deployed successfully"
else
    echo "❌ Failed to deploy imagekit-auth"
    exit 1
fi

echo ""

# Deploy imagekit-delete function
echo "📦 Deploying imagekit-delete..."
supabase functions deploy imagekit-delete --no-verify-jwt

if [ $? -eq 0 ]; then
    echo "✅ imagekit-delete deployed successfully"
else
    echo "❌ Failed to deploy imagekit-delete"
    exit 1
fi

echo ""
echo "🎉 All Edge Functions deployed successfully!"
echo ""
echo "⚠️  Don't forget to set your ImageKit secrets:"
echo "   supabase secrets set IMAGEKIT_PRIVATE_KEY=your_private_key"
echo "   supabase secrets set IMAGEKIT_PUBLIC_KEY=your_public_key"
echo ""
echo "📝 Check function logs with:"
echo "   supabase functions logs imagekit-auth --follow"
echo "   supabase functions logs imagekit-delete --follow"

