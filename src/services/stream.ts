import { supabase } from '@/lib/supabase';
import { deleteFromImageKit } from '@/lib/imagekit';
import type { Stream, StreamSettings, StreamWithItems } from '@/types';

/**
 * Get all streams for a slideshow
 */
export async function getStreams(slideshowId: string): Promise<StreamWithItems[]> {
  const { data, error } = await supabase
    .from('streams')
    .select(`
      *,
      stream_items (
        *
      )
    `)
    .eq('slideshow_id', slideshowId)
    .order('order', { ascending: true });

  if (error) {
    throw error;
  }

  // Sort items within each stream
  return (data || []).map((stream: any) => ({
    ...stream,
    items: (stream.stream_items || []).sort((a: any, b: any) => a.order - b.order),
  }));
}

/**
 * Get a single stream by ID
 */
export async function getStream(id: string): Promise<StreamWithItems | null> {
  const { data, error } = await supabase
    .from('streams')
    .select(`
      *,
      stream_items (
        *
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return {
    ...data,
    items: (data.stream_items || []).sort((a: any, b: any) => a.order - b.order),
  };
}

/**
 * Create a new stream
 */
export async function createStream(
  slideshowId: string,
  title: string,
  type: 'slideshow' | 'single-photo' | 'video',
  settings?: Partial<StreamSettings>
): Promise<Stream> {
  // Get current max order
  const { data: existingStreams } = await supabase
    .from('streams')
    .select('order')
    .eq('slideshow_id', slideshowId)
    .order('order', { ascending: false })
    .limit(1);

  const nextOrder = existingStreams && existingStreams.length > 0
    ? existingStreams[0].order + 1
    : 0;

  const defaultSettings: StreamSettings = {
    duration: 5,
    transition: 'fade',
    transitionSpeed: 'medium',
    frequency: type === 'single-photo' || type === 'video' ? 5 : undefined,
  };

  const { data, error } = await supabase
    .from('streams')
    .insert({
      slideshow_id: slideshowId,
      title,
      type,
      order: nextOrder,
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
 * Update a stream
 */
export async function updateStream(
  id: string,
  updates: Partial<Omit<Stream, 'id' | 'slideshow_id' | 'created_at'>>
): Promise<Stream> {
  const { data, error } = await supabase
    .from('streams')
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
 * Update stream settings
 */
export async function updateStreamSettings(
  id: string,
  settings: Partial<StreamSettings>
): Promise<Stream> {
  const stream = await getStream(id);
  
  if (!stream) {
    throw new Error('Stream not found');
  }

  const mergedSettings = {
    ...stream.settings,
    ...settings,
  };

  return updateStream(id, { settings: mergedSettings });
}

/**
 * Delete a stream and all its items from database and ImageKit
 */
export async function deleteStream(id: string): Promise<void> {
  // First, get all stream items to delete their files from ImageKit
  const { data: items, error: fetchError } = await supabase
    .from('stream_items')
    .select('id, content')
    .eq('stream_id', id);

  if (fetchError) {
    console.error('Error fetching stream items:', fetchError);
  }

  // Delete the stream (cascade will delete items from database)
  const { error: deleteError } = await supabase
    .from('streams')
    .delete()
    .eq('id', id);

  if (deleteError) {
    throw deleteError;
  }

  // Delete files from ImageKit in the background
  if (items && items.length > 0) {
    const deletePromises = items.map(async (item) => {
      const fileToDelete = item.content?.storage_path || item.content?.url;
      if (fileToDelete) {
        try {
          await deleteFromImageKit(fileToDelete);
          console.log(`Deleted file from ImageKit (stream cleanup)`);
        } catch (err) {
          console.error(`Failed to delete file from ImageKit:`, err);
        }
      }
    });

    // Execute deletions in parallel (non-blocking)
    Promise.allSettled(deletePromises);
  }
}

/**
 * Reorder streams
 */
export async function reorderStreams(
  slideshowId: string,
  streamIds: string[]
): Promise<void> {
  const updates = streamIds.map((id, index) => ({
    id,
    order: index,
    updated_at: new Date().toISOString(),
  }));

  for (const update of updates) {
    const { error } = await supabase
      .from('streams')
      .update({ order: update.order, updated_at: update.updated_at })
      .eq('id', update.id)
      .eq('slideshow_id', slideshowId);

    if (error) {
      throw error;
    }
  }
}

/**
 * Apply global settings to all streams in a slideshow
 */
export async function applyGlobalSettings(
  slideshowId: string,
  settings: Partial<StreamSettings>
): Promise<void> {
  const streams = await getStreams(slideshowId);

  for (const stream of streams) {
    await updateStreamSettings(stream.id, settings);
  }
}

