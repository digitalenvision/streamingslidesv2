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

    // Get ImageKit private key from environment
    const privateKey = Deno.env.get('IMAGEKIT_PRIVATE_KEY')

    if (!privateKey) {
      throw new Error('ImageKit private key not configured')
    }

    // Generate authentication parameters for ImageKit upload
    const token = crypto.randomUUID()
    const expire = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now

    // Generate signature using HMAC-SHA1
    const signature = await generateSignature(token, expire, privateKey)

    console.log(`Generated ImageKit auth for user: ${user.id}`)

    return new Response(
      JSON.stringify({ 
        token, 
        expire, 
        signature 
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  } catch (error) {
    console.error('Error in imagekit-auth function:', error)
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error' 
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

/**
 * Generate HMAC-SHA1 signature for ImageKit authentication
 */
async function generateSignature(
  token: string, 
  expire: number, 
  privateKey: string
): Promise<string> {
  const message = token + expire
  const encoder = new TextEncoder()
  const keyData = encoder.encode(privateKey)
  const messageData = encoder.encode(message)
  
  // Import the key for HMAC
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  
  // Generate the signature
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
  
  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(signature))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  
  return hashHex
}

