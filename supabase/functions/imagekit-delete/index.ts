import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with user's auth token
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Verify user is authenticated
    const { data: { user } } = await supabaseClient.auth.getUser()

    if (!user) {
      throw new Error('Unauthorized')
    }

    // Get fileId from request body
    const { fileId } = await req.json()

    if (!fileId) {
      throw new Error('fileId is required')
    }

    // Get ImageKit credentials from environment
    const privateKey = Deno.env.get('IMAGEKIT_PRIVATE_KEY')
    const publicKey = Deno.env.get('IMAGEKIT_PUBLIC_KEY')

    if (!privateKey || !publicKey) {
      throw new Error('ImageKit credentials not configured')
    }

    // Create Basic Auth header for ImageKit API
    const authString = btoa(`${privateKey}:`)

    // Delete file from ImageKit
    const imagekitResponse = await fetch(
      `https://api.imagekit.io/v1/files/${fileId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Basic ${authString}`,
        },
      }
    )

    if (!imagekitResponse.ok) {
      const errorText = await imagekitResponse.text()
      console.error('ImageKit deletion failed:', errorText)
      throw new Error(`ImageKit API error: ${imagekitResponse.status} - ${errorText}`)
    }

    console.log(`Successfully deleted file: ${fileId}`)

    return new Response(
      JSON.stringify({ success: true, fileId }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  } catch (error) {
    console.error('Error in imagekit-delete function:', error)
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        success: false 
      }),
      { 
        status: 400, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  }
})

