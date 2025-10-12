import { supabase } from '@/lib/supabase';
import { deleteFromImageKit } from '@/lib/imagekit';
import type { Slideshow, SlideshowSettings, SlideshowWithStats } from '@/types';

/**
 * Get all slideshows for the current user
 */
export async function getSlideshows(): Promise<SlideshowWithStats[]> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase
    .from('slideshows')
    .select(`
      *,
      streams (
        id,
        stream_items (
          id,
          content
        )
      )
    `)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  // Calculate stats for each slideshow
  return (data || []).map((slideshow: any) => {
    const streams = slideshow.streams || [];
    const streamCount = streams.length;
    
    // Calculate total duration and get random thumbnail
    let totalDuration = 0;
    let thumbnailUrl: string | undefined;
    const allItems: any[] = [];

    streams.forEach((stream: any) => {
      const items = stream.stream_items || [];
      allItems.push(...items);
      
      items.forEach((item: any) => {
        if (item.content.duration) {
          totalDuration += item.content.duration;
        } else {
          // Default duration from settings or 5 seconds
          totalDuration += slideshow.settings?.duration || 5;
        }
      });
    });

    // Get random thumbnail from all items
    if (allItems.length > 0) {
      const randomItem = allItems[Math.floor(Math.random() * allItems.length)];
      thumbnailUrl = randomItem.content.thumbnail_url || randomItem.content.url;
    }

    // Remove nested data
    const { streams: _streams, ...slideshowData } = slideshow;

    return {
      ...slideshowData,
      stream_count: streamCount,
      total_duration: totalDuration,
      thumbnail_url: thumbnailUrl,
    };
  });
}

/**
 * Get a single slideshow by ID
 */
export async function getSlideshow(id: string): Promise<Slideshow | null> {
  const { data, error } = await supabase
    .from('slideshows')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data;
}

/**
 * Create a new slideshow
 */
export async function createSlideshow(
  title: string,
  settings?: Partial<SlideshowSettings>
): Promise<Slideshow> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  const defaultSettings: SlideshowSettings = {
    background: {
      type: 'color',
      color: '#ffffff',
    },
    loop: true,
    margin: 0,
    shuffle: false,
    duration: 5,
    transition: 'fade',
    transitionSpeed: 'medium',
  };

  const { data, error } = await supabase
    .from('slideshows')
    .insert({
      user_id: user.id,
      title,
      settings: { ...defaultSettings, ...settings },
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Update a slideshow
 */
export async function updateSlideshow(
  id: string,
  updates: Partial<Omit<Slideshow, 'id' | 'user_id' | 'created_at'>>
): Promise<Slideshow> {
  const { data, error } = await supabase
    .from('slideshows')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Update slideshow settings
 */
export async function updateSlideshowSettings(
  id: string,
  settings: Partial<SlideshowSettings>
): Promise<Slideshow> {
  // First get current slideshow to merge settings
  const slideshow = await getSlideshow(id);
  
  if (!slideshow) {
    throw new Error('Slideshow not found');
  }

  const mergedSettings = {
    ...slideshow.settings,
    ...settings,
  };

  return updateSlideshow(id, { settings: mergedSettings });
}

/**
 * Delete a slideshow and all associated content from database and ImageKit
 */
export async function deleteSlideshow(id: string): Promise<void> {
  // First, get all streams and their items to delete files from ImageKit
  const { data: streams, error: streamsError } = await supabase
    .from('streams')
    .select(`
      id,
      stream_items (
        id,
        content
      )
    `)
    .eq('slideshow_id', id);

  if (streamsError) {
    console.error('Error fetching streams:', streamsError);
  }

  // Also get the slideshow to check for background image
  const { data: slideshow } = await supabase
    .from('slideshows')
    .select('settings')
    .eq('id', id)
    .single();

  // Delete the slideshow (cascade will delete streams and items from database)
  const { error: deleteError } = await supabase
    .from('slideshows')
    .delete()
    .eq('id', id);

  if (deleteError) {
    throw deleteError;
  }

  // Collect all files to delete from ImageKit
  const filesToDelete: string[] = [];

  // Add background image if exists
  if (slideshow?.settings?.background?.imageUrl) {
    const bgUrl = slideshow.settings.background.imageUrl;
    if (bgUrl.includes('imagekit.io')) {
      filesToDelete.push(bgUrl);
    }
  }

  // Add all stream items
  if (streams && streams.length > 0) {
    streams.forEach((stream: any) => {
      if (stream.stream_items) {
        stream.stream_items.forEach((item: any) => {
          const fileToDelete = item.content?.storage_path || item.content?.url;
          if (fileToDelete) {
            filesToDelete.push(fileToDelete);
          }
        });
      }
    });
  }

  // Delete all files from ImageKit in the background
  if (filesToDelete.length > 0) {
    const deletePromises = filesToDelete.map(async (file) => {
      try {
        await deleteFromImageKit(file);
        console.log(`Deleted file from ImageKit (slideshow cleanup)`);
      } catch (err) {
        console.error(`Failed to delete file from ImageKit:`, err);
      }
    });

    // Execute deletions in parallel (non-blocking)
    Promise.allSettled(deletePromises);
    console.log(`Cleaning up ${filesToDelete.length} files from ImageKit...`);
  }
}

/**
 * Duplicate a slideshow
 */
export async function duplicateSlideshow(id: string): Promise<Slideshow> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Get original slideshow
  const original = await getSlideshow(id);
  
  if (!original) {
    throw new Error('Slideshow not found');
  }

  // Create new slideshow
  return createSlideshow(
    `${original.title} (Copy)`,
    original.settings
  );
}

