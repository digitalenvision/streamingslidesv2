# Streaming Slides

A modern web application for creating and managing dynamic event slideshows with real-time remote control capabilities.

## Features

- **Slideshow Management**: Create and organize multiple slideshows
- **Stream-based Content**: Add multiple content streams with different media types
- **Real-time Remote Control**: Control presentations remotely using Supabase Realtime
- **Media Upload**: Upload photos and videos via ImageKit
- **Customizable Transitions**: Multiple transition effects and speeds
- **Background Customization**: Solid colors or custom background images
- **Auto-loop & Shuffle**: Flexible playback options
- **Google Cast Integration**: Cast presentations to compatible devices
- **Advanced Image Caching**: IndexedDB-based persistent caching with lossless compression
- **Offline Support**: View cached slideshows without internet connection
- **Responsive Design**: Works on all screen sizes

## Tech Stack

- **Frontend**: React 18 with TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React Context API
- **Database & Auth**: Supabase (PostgreSQL, Auth, Realtime)
- **Media Storage**: ImageKit
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Build Tool**: Vite
- **Routing**: React Router v6

## Prerequisites

- Node.js 18+ and npm/yarn
- Supabase account and project
- ImageKit account

## Environment Setup

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Fill in your environment variables:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_IMAGEKIT_PUBLIC_KEY=your_imagekit_public_key
VITE_IMAGEKIT_PRIVATE_KEY=your_imagekit_private_key
VITE_IMAGEKIT_URL_ENDPOINT=your_imagekit_url_endpoint
```

## Supabase Setup

### Database Schema

Run the following SQL in your Supabase SQL editor:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Slideshows table
CREATE TABLE slideshows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Streams table
CREATE TABLE streams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slideshow_id UUID REFERENCES slideshows(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('slideshow', 'single-photo', 'video')),
  title TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  settings JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Stream items table
CREATE TABLE stream_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stream_id UUID REFERENCES streams(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('photo', 'video', 'custom')),
  content JSONB NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Albums table
CREATE TABLE albums (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Photos table
CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('upload', 'dropbox', 'gdrive')),
  storage_path TEXT,
  overlay JSONB,
  album_id UUID REFERENCES albums(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Slideshow commands table
CREATE TABLE slideshow_commands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slideshow_id UUID REFERENCES slideshows(id) ON DELETE CASCADE,
  command TEXT NOT NULL,
  payload JSONB,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_slideshows_user_id ON slideshows(user_id);
CREATE INDEX idx_streams_slideshow_id ON streams(slideshow_id);
CREATE INDEX idx_stream_items_stream_id ON stream_items(stream_id);
CREATE INDEX idx_photos_user_id ON photos(user_id);
CREATE INDEX idx_photos_album_id ON photos(album_id);
CREATE INDEX idx_slideshow_commands_slideshow_id ON slideshow_commands(slideshow_id);

-- Row Level Security (RLS)
ALTER TABLE slideshows ENABLE ROW LEVEL SECURITY;
ALTER TABLE streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE slideshow_commands ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own slideshows"
  ON slideshows FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own slideshows"
  ON slideshows FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own slideshows"
  ON slideshows FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own slideshows"
  ON slideshows FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view streams of their slideshows"
  ON streams FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM slideshows
    WHERE slideshows.id = streams.slideshow_id
    AND slideshows.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert streams to their slideshows"
  ON streams FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM slideshows
    WHERE slideshows.id = streams.slideshow_id
    AND slideshows.user_id = auth.uid()
  ));

CREATE POLICY "Users can update streams of their slideshows"
  ON streams FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM slideshows
    WHERE slideshows.id = streams.slideshow_id
    AND slideshows.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete streams of their slideshows"
  ON streams FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM slideshows
    WHERE slideshows.id = streams.slideshow_id
    AND slideshows.user_id = auth.uid()
  ));

CREATE POLICY "Users can view stream items of their streams"
  ON stream_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM streams
    INNER JOIN slideshows ON slideshows.id = streams.slideshow_id
    WHERE streams.id = stream_items.stream_id
    AND slideshows.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert stream items to their streams"
  ON stream_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM streams
    INNER JOIN slideshows ON slideshows.id = streams.slideshow_id
    WHERE streams.id = stream_items.stream_id
    AND slideshows.user_id = auth.uid()
  ));

CREATE POLICY "Users can update stream items of their streams"
  ON stream_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM streams
    INNER JOIN slideshows ON slideshows.id = streams.slideshow_id
    WHERE streams.id = stream_items.stream_id
    AND slideshows.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete stream items of their streams"
  ON stream_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM streams
    INNER JOIN slideshows ON slideshows.id = streams.slideshow_id
    WHERE streams.id = stream_items.stream_id
    AND slideshows.user_id = auth.uid()
  ));

-- Similar policies for albums, photos, and slideshow_commands...
CREATE POLICY "Users can manage their own albums"
  ON albums FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own photos"
  ON photos FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage commands for their slideshows"
  ON slideshow_commands FOR ALL
  USING (EXISTS (
    SELECT 1 FROM slideshows
    WHERE slideshows.id = slideshow_commands.slideshow_id
    AND slideshows.user_id = auth.uid()
  ));

-- Public access to preview slideshows (read-only)
CREATE POLICY "Anyone can view slideshows for preview"
  ON slideshows FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view streams for preview"
  ON streams FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view stream items for preview"
  ON stream_items FOR SELECT
  USING (true);
```

### Edge Functions

Create two Edge Functions in your Supabase project:

#### 1. imagekit-auth

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabaseClient.auth.getUser()

    if (!user) {
      throw new Error('Unauthorized')
    }

    const privateKey = Deno.env.get('IMAGEKIT_PRIVATE_KEY')
    const token = crypto.randomUUID()
    const expire = Math.floor(Date.now() / 1000) + 3600

    const signature = await generateSignature(token, expire, privateKey!)

    return new Response(
      JSON.stringify({ token, expire, signature }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function generateSignature(token: string, expire: number, privateKey: string) {
  const message = token + expire
  const encoder = new TextEncoder()
  const keyData = encoder.encode(privateKey)
  const messageData = encoder.encode(message)
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
  const hashArray = Array.from(new Uint8Array(signature))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
```

#### 2. imagekit-delete

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabaseClient.auth.getUser()

    if (!user) {
      throw new Error('Unauthorized')
    }

    const { fileId } = await req.json()

    const privateKey = Deno.env.get('IMAGEKIT_PRIVATE_KEY')
    const publicKey = Deno.env.get('IMAGEKIT_PUBLIC_KEY')
    
    const authString = btoa(privateKey + ':')
    
    const response = await fetch(`https://api.imagekit.io/v1/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Basic ${authString}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to delete file from ImageKit')
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd streaming-slides
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables (see Environment Setup above)

4. Set up Supabase database (see Supabase Setup above)

5. Deploy Edge Functions to Supabase

## Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Building for Production

Build the application:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Image Caching System

The application features an advanced image caching system that:

- **Caches images locally** using IndexedDB for persistent storage
- **Compresses images** losslessly (PNG format) to save space
- **Eliminates repeated API calls** to ImageKit after initial load
- **Works offline** - view cached slideshows without internet
- **Tracks statistics** - see cache size and compression savings

### How It Works

1. **First Load**: Images are fetched from ImageKit and cached locally
2. **Compression**: Images are compressed using lossless PNG encoding
3. **Storage**: Compressed images stored in IndexedDB
4. **Subsequent Loads**: Images loaded from cache (no network requests)

See [CACHING_SYSTEM.md](./CACHING_SYSTEM.md) for detailed documentation.

### Cache Management

Access cache settings in the Settings page:
- View cache size and statistics
- See compression savings percentage
- Clear cache if needed

## Usage

### Creating a Slideshow

1. Log in to your account
2. Click "New Slideshow" on the dashboard
3. Enter a title and click "Create"

### Adding Streams

1. Open a slideshow in the builder
2. Click "Add Stream"
3. Choose stream type (Photo Stream, Single Photo, or Video)
4. Upload media files

### Configuring Settings

- **Slideshow Settings**: Background, playback options
- **Stream Settings**: Duration, transitions, frequency
- **Global Settings**: Apply settings to all streams

### Remote Control

1. Open the slideshow builder
2. Click "Remote" to open the remote control
3. Open "Preview" in a separate window or cast to a display
4. Use remote control buttons to manage the presentation

## Project Structure

```
src/
├── components/          # React components
│   ├── auth/           # Authentication components
│   ├── builder/        # Slideshow builder components
│   ├── dashboard/      # Dashboard components
│   ├── layout/         # Layout components
│   ├── stream/         # Stream management components
│   └── ui/             # Reusable UI components
├── contexts/           # React Context providers
├── lib/                # Utility functions and configurations
├── pages/              # Page components
├── services/           # API services
├── types/              # TypeScript type definitions
├── App.tsx             # Main application component
├── main.tsx            # Entry point
└── index.css           # Global styles
```

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.

